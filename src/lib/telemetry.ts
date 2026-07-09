/**
 * Frontend telemetry client (JAA-429).
 *
 * Two concerns, one client:
 *  1. Usage analytics  → POST /telemetry/events  (session_start/session_end/page_view/interaction)
 *  2. Errors / crashes → POST /telemetry/errors   (window.onerror, unhandledrejection, React boundary)
 *
 * Design goals (from the ticket):
 *  - Batched + debounced flush, bounded queue (drop-oldest), and it MUST NOT throw or block the app
 *    if the endpoint is down — telemetry failing is never a user-visible failure.
 *  - Carries user identity (from auth), a per-load `sessionId`, and `appVersion`.
 *  - session_end is delivered with `navigator.sendBeacon` so it survives page unload.
 *
 * Privacy — what we capture (internal tool, authenticated users; identity is recorded on purpose):
 *  - User email (identity), sessionId, appVersion, userAgent.
 *  - Route paths visited and dwell time; names of interacted controls (data-telemetry / aria-label / text).
 *  - For errors: message, stack, kind, current path, timestamp.
 *  No form values, no request bodies, no PII beyond the authenticated user's email.
 */

import { isTelemetryEnabled } from "./feature-flags"

export type TelemetryEventType = "session_start" | "session_end" | "page_view" | "interaction"

export interface TelemetryEvent {
  type: TelemetryEventType
  sessionId: string
  appVersion: string
  user: string | null
  occurredAt: string
  /** session_end */
  durationMs?: number
  /** page_view */
  path?: string
  dwellMs?: number
  /** interaction */
  name?: string
  props?: Record<string, unknown>
}

export type TelemetryErrorKind = "error" | "unhandledrejection" | "react"

export interface TelemetryErrorReport {
  message: string
  stack?: string
  kind: TelemetryErrorKind
  path: string
  appVersion: string
  userAgent: string
  occurredAt: string
  sessionId: string
  user: string | null
}

export interface TelemetryConfig {
  /** ms of inactivity before an automatic flush of the events queue. */
  debounceMs: number
  /** periodic flush interval (safety net for low-activity sessions). */
  flushIntervalMs: number
  /** max queued events before the oldest are dropped. */
  maxQueue: number
}

const DEFAULTS: TelemetryConfig = {
  debounceMs: 1000,
  flushIntervalMs: 15_000,
  maxQueue: 100,
}

const APP_VER: string = typeof APP_VERSION === "string" ? APP_VERSION : "0.0.0"

interface TelemetryState {
  started: boolean
  sessionId: string
  sessionStart: number
  user: string | null
  queue: TelemetryEvent[]
  lastPath: string | null
  lastPathEnter: number
  config: TelemetryConfig
  debounceTimer: ReturnType<typeof setTimeout> | null
  intervalTimer: ReturnType<typeof setInterval> | null
  tokenProvider: (() => Promise<string>) | null
  listeners: Array<() => void>
}

function newSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  } catch {
    /* ignore */
  }
  return `s-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

const state: TelemetryState = {
  started: false,
  sessionId: newSessionId(),
  sessionStart: Date.now(),
  user: null,
  queue: [],
  lastPath: null,
  lastPathEnter: Date.now(),
  config: { ...DEFAULTS },
  debounceTimer: null,
  intervalTimer: null,
  tokenProvider: null,
  listeners: [],
}

function telemetryBaseUrl(): string {
  return (
    (window as unknown as { __BRIDGE_CONFIG__?: { API_URL?: string } }).__BRIDGE_CONFIG__?.API_URL ??
    import.meta.env.VITE_BRIDGE_API_URL ??
    "http://localhost:8000/api/v1"
  )
}

/** Resilient POST: never throws, never rejects. Returns true on a 2xx. */
async function post(path: string, body: unknown, opts: { beacon?: boolean } = {}): Promise<boolean> {
  // Network chokepoint for every telemetry transport. Re-check the flag here
  // (not just in initTelemetry) because the runtime config.js is a deferred
  // script that can execute AFTER the init microtask — so init may slip through
  // with the default-on flag, but by the time anything actually flushes the
  // config has loaded. Gating here guarantees ZERO requests when telemetry is
  // disabled (JAA-558), so backends without the sink produce no console errors.
  if (!isTelemetryEnabled()) return false

  const url = `${telemetryBaseUrl()}${path}`
  const payload = JSON.stringify(body)

  // Page is unloading: sendBeacon is the only reliable transport.
  if (opts.beacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      return navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }))
    } catch {
      return false
    }
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (state.tokenProvider) {
      try {
        headers.Authorization = `Bearer ${await state.tokenProvider()}`
      } catch {
        /* auth not ready — send anyway; mock + collector don't require it */
      }
    }
    const res = await fetch(url, { method: "POST", headers, body: payload, keepalive: true })
    return res.ok || res.status === 202
  } catch {
    // Network down / collector unreachable — swallow. Telemetry is best-effort.
    return false
  }
}

function baseEvent(type: TelemetryEventType): TelemetryEvent {
  return {
    type,
    sessionId: state.sessionId,
    appVersion: APP_VER,
    user: state.user,
    occurredAt: new Date().toISOString(),
  }
}

function enqueue(event: TelemetryEvent): void {
  state.queue.push(event)
  if (state.queue.length > state.config.maxQueue) {
    // Drop oldest so a stuck collector can't grow memory without bound.
    state.queue.splice(0, state.queue.length - state.config.maxQueue)
  }
  scheduleFlush()
}

function scheduleFlush(): void {
  if (state.debounceTimer) clearTimeout(state.debounceTimer)
  state.debounceTimer = setTimeout(() => {
    void flush()
  }, state.config.debounceMs)
}

/** Send the queued events as a single batch. Never throws. */
export async function flush(opts: { beacon?: boolean } = {}): Promise<void> {
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer)
    state.debounceTimer = null
  }
  if (state.queue.length === 0) return
  const batch = state.queue.splice(0, state.queue.length)
  const ok = await post("/telemetry/events", { events: batch }, opts)
  if (!ok && !opts.beacon) {
    // Re-queue (respecting the cap) so a transient failure doesn't lose data.
    state.queue.unshift(...batch)
    if (state.queue.length > state.config.maxQueue) {
      state.queue.splice(0, state.queue.length - state.config.maxQueue)
    }
  }
}

/** Set / update the identified user (called from the auth layer). */
export function setTelemetryUser(user: { email: string } | null): void {
  state.user = user?.email ?? null
}

/** Provide a bearer-token getter so authenticated collectors get the token. */
export function setTelemetryTokenProvider(provider: () => Promise<string>): void {
  state.tokenProvider = provider
}

/** The current per-load session id (also carried on every emitted event). */
export function getTelemetrySessionId(): string {
  return state.sessionId
}

/** Record an explicit interaction (declarative `track("name")` wrapper). */
export function track(name: string, props?: Record<string, unknown>): void {
  const ev = baseEvent("interaction")
  ev.name = name
  ev.path = currentPath()
  if (props) ev.props = props
  enqueue(ev)
}

/** Record a route change. Emits the dwell time of the previous page when known. */
export function trackPageView(path: string): void {
  const now = Date.now()
  const ev = baseEvent("page_view")
  ev.path = path
  if (state.lastPath !== null) ev.dwellMs = now - state.lastPathEnter
  state.lastPath = path
  state.lastPathEnter = now
  enqueue(ev)
}

function currentPath(): string {
  return typeof window !== "undefined" ? window.location.pathname + window.location.search : ""
}

/** Build + send an error report immediately (its own resilient channel). */
export function captureError(input: {
  message: string
  stack?: string
  kind: TelemetryErrorKind
}): void {
  const report: TelemetryErrorReport = {
    message: input.message,
    stack: input.stack,
    kind: input.kind,
    path: currentPath(),
    appVersion: APP_VER,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    occurredAt: new Date().toISOString(),
    sessionId: state.sessionId,
    user: state.user,
  }
  void post("/telemetry/errors", { errors: [report] })
}

/** Emit session_end with the total session duration and beacon-flush. */
export function endSession(): void {
  const ev = baseEvent("session_end")
  ev.durationMs = Date.now() - state.sessionStart
  state.queue.push(ev)
  void flush({ beacon: true })
}

function onWindowError(event: ErrorEvent): void {
  captureError({
    message: event.message || String(event.error ?? "Unknown error"),
    stack: event.error instanceof Error ? event.error.stack : undefined,
    kind: "error",
  })
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason
  captureError({
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    kind: "unhandledrejection",
  })
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  // Prefer an explicit declarative tag; otherwise capture any clickable control
  // so adoption coverage is broad without hand-tagging every button.
  const tagged = target.closest<HTMLElement>("[data-telemetry]")
  const el = tagged ?? target.closest<HTMLElement>('button, a, [role="button"]')
  if (!el) return
  const name =
    el.getAttribute("data-telemetry") ||
    el.getAttribute("aria-label") ||
    (el.textContent ?? "").trim().slice(0, 60)
  if (!name) return
  track(name, tagged ? undefined : { derived: true })
}

/**
 * Install global listeners and start the session. Idempotent.
 * Pass partial config overrides (used by tests).
 */
export function initTelemetry(config: Partial<TelemetryConfig> = {}): void {
  if (state.started) return
  // Skip entirely when the backend has no telemetry sink (JAA-558): never
  // register listeners/timers and never POST, so there are no failed-request
  // console errors. Turned off via __APP_CONFIG__.features.telemetry.
  if (!isTelemetryEnabled()) return
  state.config = { ...DEFAULTS, ...config }
  state.started = true
  state.sessionStart = Date.now()
  state.lastPathEnter = Date.now()

  const onError = onWindowError as EventListener
  const onRejection = onUnhandledRejection as EventListener
  const onClick = onDocumentClick as EventListener
  const onVisibility = () => {
    if (document.visibilityState === "hidden") void flush({ beacon: true })
  }
  const onPageHide = () => endSession()

  window.addEventListener("error", onError)
  window.addEventListener("unhandledrejection", onRejection)
  document.addEventListener("click", onClick, true)
  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("pagehide", onPageHide)

  state.listeners = [
    () => window.removeEventListener("error", onError),
    () => window.removeEventListener("unhandledrejection", onRejection),
    () => document.removeEventListener("click", onClick, true),
    () => document.removeEventListener("visibilitychange", onVisibility),
    () => window.removeEventListener("pagehide", onPageHide),
  ]

  state.intervalTimer = setInterval(() => void flush(), state.config.flushIntervalMs)

  // session_start opens the batch.
  enqueue(baseEvent("session_start"))
}

/** Test-only: tear down listeners/timers and reset all state. */
export function __resetTelemetryForTests(): void {
  if (state.debounceTimer) clearTimeout(state.debounceTimer)
  if (state.intervalTimer) clearInterval(state.intervalTimer)
  for (const off of state.listeners) off()
  state.started = false
  state.sessionId = newSessionId()
  state.sessionStart = Date.now()
  state.user = null
  state.queue = []
  state.lastPath = null
  state.lastPathEnter = Date.now()
  state.config = { ...DEFAULTS }
  state.debounceTimer = null
  state.intervalTimer = null
  state.tokenProvider = null
  state.listeners = []
}

/** Test-only: inspect the pending queue. */
export function __getTelemetryQueue(): TelemetryEvent[] {
  return [...state.queue]
}
