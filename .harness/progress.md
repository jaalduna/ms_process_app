# Progress — ms_process_app

_Session notes: what / why / next. Newest on top._

## 2026-06-23 — JAA-547 (eligibility-params editor UI) — webapp — EXECUTED

**What:** In-app editor for eligibility parameters. New module `src/modules/parametros-elegibilidad/`
(admin-gated, nav label **"Editor de Parámetros"**, route `/parametros-elegibilidad`): country selector
(9 countries BO,BR,BR_MOSAICO,CAM,CL,CO,EC,MX,PE) + 4 specialized tab editors —
`Code_Parametros` (key-value), `Criterios_Elegibilidad` (rules+range), `Q/M_Variables`
(vocab-bound selector → no invalid column typable), `Estructura` (locked; only `Muestra_Ideal`
editable). Live client validation (`validation.ts`, structured issues) gates the publish button;
`ReviewPublishDialog` shows the before→after diff and publishes via react-query mutation against the
mock `POST /params/{tabla}/{pais}/publish`.

**Backend seam:** mock-server gained `mock-server/routes/params.js` faithful to the frozen JAA-546
contract (GET/PUT/validate/publish; `/api/v1/params`; string `errors[]`; `added/removed` diff; 404
unknown table; 422 invalid publish). Seeded 9 countries × 5 tables; wired into `seed.js` + `test.js`
reset. Scope = framework + 4 tables (per user); other 11 tables → follow-up.

**Why label "Editor de Parámetros":** "Parámetros Elegibilidad" collided (substring) with existing
e2e `getByRole("link", {name:"Elegibilidad"})` + `navigateTo("Elegibilidad")` matchers (strict-mode
violation). Distinct label avoids the collision without touching 8 existing call sites.

**Verify:** `npm test` 184/184 + new (mock params 12, validation 12) ✓; lint ✓; `tsc -b` ✓;
`npm run build` ✓; Playwright e2e `e2e/parametros-elegibilidad.spec.ts` (2 @smoke) ✓.

**Next:** separate evaluator → commit → push ado → PR to develop → sync Linear. Follow-up tickets for
the remaining 11 eligibility tables.

## 2026-06-19 — JAA-384 (mock-server fidelity: C1-C4) — webapp — EXECUTED, evaluator PASS

**What:** Closed 4 mock-server contract divergences so the in-repo mock faithfully mirrors the
real ms-process-api (the front↔backend contract seam). Sub-issue of the JAA-377 contract audit.
- **t1 (C1)** `period` int-strictness: added `export const isIntegerPeriod` to `routes/sync.js`;
  the 4 POST `/runs` handlers (eligibility/prices/weighting/mtr) now 422 `validation_error` on a
  non-integer **body** period. Scoped to the POST body only — HTTP query params are always strings,
  so `GET /runs?period=` filtering stays string-loose (already `String()`-compares). Safe because
  the frontend always sends `period` as a number to these POSTs (`periodStringToNumber`/`Number()`).
- **t2 (C2)** `routes/metadata.js` `/metadata/last-sync` now honors `req.query.stage` (default
  "inicio" when absent) + the `min_queries` filter (`queries_total`) instead of hardcoding
  `lastCompletedByStage("inicio")`. Frontend calls `useLastSync("pesaje")`, so the Calibración
  card "Sync:" date now reflects the pesaje stage (its intent), not inicio. Seeds carry both
  inicio + pesaje jobs in the `jobs` store, so the date stays populated (no regression to "never").
- **t3 (C3)** `src/types/api.ts` `LastSyncEntry` realigned `{job_id, stage}` (a lie — never sent)
  → `{country, completed_at, run_id, period?, tag?, triggered_by?, started_at?}` matching what the
  mock + backend actually return. Also fixed the in-app demo mock `src/lib/mock-api.ts`
  `makeLastSync()` to emit `{run_id, period}`. No consumer read the removed fields.
- **t4 (C4)** `routes/sync.js` `/trigger` now destructures + stores the 6 fields the frontend's
  TriggerRequest sends but the mock dropped (`table_suffix, group_by, start_period, final_period,
  skip_merge, skip_simulation`) — reflected on the job and observable via GET `/events/{id}`.
  (Also persisted the previously-dropped `row_limit`/`lookback_months`.)

**Verify:** vitest **160/160** (+20 new across 3 mock-server test files following the
feedback.test.js express+ephemeral-port+fetch pattern), eslint clean, `tsc -b` clean. Live curl
proved C1 (422 on string period / 201 on int / query filter still 200), C2 (stage=pesaje vs inicio
differ), C4 (6 fields reflected). Playwright smoke 39 expected + 2 skipped + 1 **flaky** (traceability
country-filter — module NOT touched by this diff; **5/5 PASS in isolation**; known suite flakiness
JAA-393/JAA-411). Separate evaluator (ux-ui-reviewer, fresh ctx, ran everything itself incl. live
curl + Calibración Playwright walkthrough showing per-country Sync dates, zero console errors) →
**ac1-ac5 all PASS**.

**Decisions baked in:** C1 strictness = POST body only (query stays loose); C2 honors stage + min_queries.

**Result:** worktree `../ms_process_app-JAA-384`, branch `fix/JAA-384-mock-fidelity` (off `ado/develop`
@11acafe). All changes are frontend-repo only (`mock-server/` + `src/types`,`src/lib`); no backend
touched — the 5 backend modules remain JAA-378..383 (Databricks-orchestration approach, user-chosen).

**Next:** commit → push `ado` → PR to `develop` → Linear In Review → auto-merge when policies green.

## 2026-06-18 — JAA-431 (rewrite stale weighting e2e to post-JAA-425 flow) — webapp — EXECUTED, evaluator PASS

**What:** JAA-425 collapsed the Pesaje card actions: the whole card is now a button that opens
`WeightingDetailModal`, which hosts the editable params (controls labelled by raw key, e.g.
`MAX_ROUNDS_COLAPSO`) + the run button (`Ejecutar`/`Re-ejecutar` → confirm AlertDialog whose action
carries the SAME label, not "Confirmar"); process close/open moved to the status badge. The old
card-level `Configurar parametros`/`Ejecutar`/`Ver detalle`/`Marcar como listo` buttons + the
`WeightingConfigDialog` are gone — leaving 3 e2e specs clicking dead selectors (2 `@smoke` tests
hung to the 300s timeout = the reds). Rewrote all three to the new flow + extracted a shared
`e2e/helpers/weighting.ts` (`card`, `openCardModal`, `runButton`, `confirmRun`, `confirmDialog`).

**Key facts that shaped the rewrite:** `test/reset` re-seeds but the seeded runs are for a period
the cards don't display → cards start with NO run, so the first action is `Ejecutar` (not
`Re-ejecutar`); the history test must create a run first. Param edits are modal-local (re-seeded on
open from `run.parameters_json` merged over `DEFAULT_WEIGHTING_PARAMS`). The `confirmRun` must use
explicit click→expect(alertdialog)→click-action steps — the old retry-loop `confirmAction` races
with the modal closing on confirm and falsely throws "did not complete".

**Verify (run via `./node_modules/.bin/playwright`, NOT npx — rtk hook hangs it):** grep clean;
weighting smoke 3/3; full weighting suite (smoke+flow) **6/6**; `tsc -b` ✓; eslint e2e ✓; vitest
**129/129**. Separate skeptical evaluator (ux-ui-reviewer, fresh ctx) **ALL PASS** + anti-hollow
sanity (asserts POST params; badge-close hides run button).

**Worktree setup friction:** fresh worktree had no node_modules; symlink to main repo broke vite's
temp-config resolution → had to `npm install` in-worktree. `jsonwebtoken` (JAA-371) is in
mock-server/package.json but not root → installed `--no-save` to boot the mock.

**Next:** commit → push ado → PR to develop → Linear In Review → auto-merge when policies green.

## 2026-06-18 — JAA-427 (UI: in-app feedback section) — webapp — EXECUTED, evaluator PASS

**What:** In-app feedback. "Enviar feedback" trigger in the `AuthenticatedLayout` sidebar footer
(full button expanded / icon+tooltip collapsed) opens a shadcn `Dialog` with a required `message`
textarea, a `category` select (bug/idea/otro), and an optional `contact`. On submit it POSTs to
`/feedback` via new `submitFeedback()` in `src/lib/api.ts`, auto-attaching context
`{module, path, appVersion, user}` (module/path from `useLocation`, appVersion from the layout's
resolved version, user from `useAuth`). Success → sonner toast + close + reset; empty message →
inline error, no POST; API error → inline message, text preserved. Mock seam:
`mock-server/routes/feedback.js` (`POST /feedback` → 201 `{id,createdAt}`, 400 empty message),
mounted in `server.js`. Added `ui/textarea.tsx` (shadcn) + `Feedback*` types in `types/api.ts`.

**Verify:** `npx tsc -b` ✓, `npm run lint` ✓, vitest **129✓ (18 files)** incl. new
`mock-server/__tests__/feedback.test.js` (3) + `src/__tests__/api-feedback.test.ts` (2). Playwright
`feedback.spec.ts` **3/3 PASS** (smoke): trigger reachable across routes, empty-message validation
blocks submit (no POST), success shows toast + closes + POST body carries module/path/appVersion.
Separate skeptical evaluator (ux-ui-reviewer, fresh ctx) **ALL 6 ACs PASS** (incl. live curl 201/400).

**Findings captured (capture-don't-chase):**
- JAA-431 — 3 e2e specs (`weighting-params`, `weighting`, `weighting-iterate`) still click the
  `"Configurar parametros"` button that JAA-425 removed → 2 `@smoke` tests hang to the 300s timeout.
  Pre-existing red on `develop`, unrelated to JAA-427. Related to JAA-425/JAA-427.

**Harness friction logged:** full `@smoke` run wasted ~10min on the 2 stale-selector timeouts above.

**Next:** commit → push ado → PR to develop → Linear In Review → auto-merge when policies green.

## 2026-06-18 — JAA-423 (Pesaje params per-country + iterate loop) — webapp — EXECUTED, evaluator PASS

**What:** Turned Pesaje from one global param gear (JAA-343) into a per-country iterate loop:
configurar → correr → revisar stats → ajustar → re-ejecutar → marcar como listo.
- **t1** `WeightingConfigDialog`: optional `triggerLabel` → renders a labeled "Configurar parametros"
  button (icon-only trigger kept for back-compat); controlled params/onChange API unchanged.
- **t2** `WeightingCountryCard`: per-country `params` state seeded from the country's last run
  `parameters_json` (merged over DEFAULT) via React's adjust-state-during-render pattern keyed on
  `run_id` (avoids the new `react-hooks/set-state-in-effect` lint). Renders its own config dialog;
  `handleExecutar` posts local `params`. Dropped the `weightingParams` prop.
- **t3** `PesajePage`: removed the global gear + shared `weightingParams` state.
- **t4** `WeightingDetailModal`: `canRerun` now `(failed || completed) && onRerun` so the
  "ajustar y volver a correr" step works after success; added `aria-label={key}` to the editable
  number inputs (a11y + testable). Card passes `onRerun` only when the process is **not closed**.
- **t5** "Marcar como listo" CTA (visible when completed && open) → confirm → `useSetProcessStatus`
  **close('pesaje', country)** — reuses JAA-391; closed already disables Ejecutar + hides config.
  The `ProcessStatusBadge` stays as the live status + reopen path.
- **t6** Migrated `weighting.spec.ts` + `weighting-params.spec.ts` off the removed global gear to the
  per-card "Configurar parametros" flow; new `e2e/weighting-iterate.spec.ts` covers the full loop.

**Verify:** `npx tsc -b` clean, `eslint` clean, **vitest 99/0** (+7 new). Playwright (mock :5423
MOCK_STEP_INTERVAL_MS=300, dev :5523, via `rtk proxy`): weighting-iterate + weighting-params +
weighting = **5/5**; process-open-close **1/1** (no regression). Separate evaluator (ux-ui-reviewer,
fresh ctx) drove the live app → **ac1–ac6 PASS** (captured Argentina POST N_PERIODOS_OUTLIERS=99
while Bolivia stayed 12; close/open round-trip live).

**Decisions (user-confirmed):** listo = cerrar proceso (no new state); config per-card pre-filled
from last run; re-run allowed after completed.

**Result:** worktree `../ms_process_app-JAA-423`, branch `feat/JAA-423-pesaje-per-country-params`
(off `ado/develop`). Commit `f2215a5`, merged `ado/develop` twice (conflicts in WeightingCountryCard.tsx
vs ebb010c + progress.md vs JAA-421). **PR #516523 → develop**, build policy approved → auto-completing.

## 2026-06-18 — JAA-421 (Overview period filter — UI + mock-server) — webapp — EXECUTED, evaluator PASS

**What:** Frontend+mock half (contract seam) of JAA-420. The Overview built each cell as the
latest-overall run per stage/country → rows mixed periods (prices@202602 vs elegibilidad/calibración
@202605, per seeds). Added a period selector so every cell reflects the selected period.
- **t1** mock-server: optional `period` arg on `RunStore.lastCompleted(period)`, `eligibilityStore.lastCompleted(period)`,
  and `lastCompletedByStage(stage, period)` (reuse `String(run.period)===String(period)`); wired all 5
  handlers (server.js prices/weighting/mtr + metadata.js elegibilidad/calibration) to pass `req.query.period`.
  No param ⇒ latest overall (backward compatible).
- **t2** `src/lib/api.ts`: `getLast{Prices,Weighting,Mtr,Elegibilidad,Calibration}` accept `period?: number`,
  forwarded via a small `periodParams()` helper as a string query param; omitted ⇒ no params.
- **t3** `OverviewPage`: 5 unfiltered "discovery" queries → `availablePeriods` (desc); default selection
  **derived** (`pickedPeriod ?? availablePeriods[0]`, no effect-setState — react-hooks/set-state-in-effect);
  5 period-keyed display queries; cells show date only (per-cell period line removed) + "—" when empty;
  subtitle reflects period. `PeriodSelector` extended with optional `periods?: string[]` (backward compat).
- **t4** tests: api-last-period.test.ts (5 endpoints × forwarded/omitted), OverviewPage period describe
  (selector renders, default=most-recent-with-data, same period across stages, "—", no period digits),
  new e2e/overview-period.spec.ts (@smoke): selector + subtitle + refetch-on-change (subtitle change +
  dash-count change) + no raw YYYYMM digits.

**Verify:** vitest **107/0**, eslint clean, `tsc -b` clean. Mock curl: `?period=202602`→prices,
`?period=202605`→`{}`, no-param→latest (backward compat). Playwright overview-period **1/1** + navigation+smoke
**7/7** (no regression; mock :5421, dev :5521, `rtk proxy`). Separate evaluator (ux-ui-reviewer, fresh ctx)
re-ran all → **ac1–ac8 PASS**.

**Next:** commit → push `ado` → PR to `develop` → Linear In Review → auto-merge when policies green.

## 2026-06-17 — JAA-411 (e2e port/repair: un-fixme + flow re-audit) — webapp

**What:** Followed JAA-397. Repaired/rewrote every quarantined `test.fixme()` (21) + the
broken active @flow lifecycle specs, deleted obsolete sync flows, ported the one untestable
case to vitest. Baseline was 21 pass / 22 skip / 11 fail.

Key fixes:
- **helpers/config.ts**: `setModuleConfig` now seeds `overview:true` + `sync:false` (mirrors
  prod `public/config.js`). The old `sync:true` default made `LoginPage`'s hard redirect to
  `/dashboard` land on the retired sync dashboard instead of falling through to `/overview`.
  Added `MOCK_ORIGIN` (health endpoints are mounted at root, not `/api/v1`).
- **smoke.spec**: rewritten against the Overview landing (`MS Process App` / `Continue (dev)`,
  "Country Pipeline Overview" table, nav modules, root `/health/live`).
- **navigation.spec**: real nav labels; the 2 route-redirect tests dropped (in-memory dev auth
  is lost on hard `goto`; behaviour is guaranteed by construction + "disabled hidden" test).
- **prices/mtr/weighting.spec**: rewritten to the real card DOM — trigger (`Validar`/`Ejecutar`)
  → AlertDialog confirm → result badge (`Resultados listos`/`Completado`) → detail modal
  (outlier table / imputation summary / weight stats). `startX` helpers use the persistent
  eye/detail button as the success signal (confirmAction can win the action but lose its own
  dialog-hidden race). Failed-run path refreshes via client-side nav round-trip (a hard reload
  drops dev auth). Prices cancel uses an API-created **pending** run (deterministic under fast
  mock); weighting cancel can't (pending isn't cancellable + running auto-completes) → **ported
  to vitest** (WeightingCountryCard.test.tsx).
- **pipeline-deps.spec**: one real test — eligibility cards show their upstream `Precios`
  dependency pill (`role=status`); calibración no longer renders deps. Deep logic stays in
  usePipelineDeps/DependencyIndicator vitest.
- **performance.spec**: API perf tests kept; the 2 obsolete history-page tests → one Overview-load
  perf test.
- **calibration/eligibility**: un-fixme'd; fixed `\b<name>\b` card matchers (card text glues
  label to next token, e.g. "Chilenever") → plain `hasText`; made eligibility `startRun`
  tolerant of confirmAction's race.
- **Deleted** chile-sync / bolivia-parallel / peru-top100 specs + their PNGs (sync module
  disabled by default after rebrand — user-confirmed obsolete).

**Verify:** vitest 92✓ (+1 weighting-cancel port), eslint✓, `tsc -b`✓. Per-spec Playwright runs
all green. Full `test:e2e:full` run in progress.

**Next:** confirm full e2e 0-failed → separate evaluator → commit → PR to develop.

## 2026-06-17 — JAA-397 (e2e suite red: stale selectors) — webapp — EXECUTED, evaluator PASS

**Scope (user-approved):** *minimal unblock + defer*. The ticket framed it as "stale card
selectors", but RCA showed the suite was broadly red for THREE reasons: (1) **e2e couldn't log in** —
post-rebrand the app uses GitHub OAuth (`public/config.js` authProvider:"github"), which redirects to
real github.com; e2e needs `VITE_AUTH_BYPASS=true` (DevAuthProvider "Continue (dev)", which the
`login()` helper already targets) but the gitignored `.env.local` was missing in fresh worktrees;
(2) `smoke.spec`/`performance.spec` assert the OLD sync-centric "Trigger Data Sync" dashboard / brand
"SQL-Databricks Bridge"; (3) card DOM `.country-card`/`article` → `[data-slot="card"]`.

**What:**
- **t1** added `dev:e2e` npm script (`VITE_AUTH_BYPASS=true vite`) + documented the full e2e recipe in
  AGENTS.md (mock:fast on :8000, dev:e2e, `MOCK_SERVER_PORT=8000`, smoke vs flow projects).
- **t2** fixed the 3 card-load @smoke tests (prices:14, weighting:13, mtr:13) → `[data-slot="card"]`
  count 9 (verified live: Precios/Pesaje/MTR each render exactly 9).
- **t3** quarantined the remaining 20 red @smoke tests with `test.fixme()` + a `// JAA-411` comment
  each (smoke ×5, navigation ×3, pipeline-deps ×3, calibration ×2, performance ×2, prices ×2,
  eligibility ×1, mtr ×1, weighting ×1). Bodies intact, nothing deleted.
- **t5** created follow-up **JAA-411** (port @smoke assertions to vitest; repair/rewrite @flow).

**Verify:** vitest 91/91, eslint clean, tsc -b clean. **smoke project: 16 passed / 22 skipped / 0
failed in 53s** (was 22 failed / ~20min). Separate evaluator (ux-ui-reviewer, fresh ctx) ran the
checks → **ac1–ac6 all PASS**. Did NOT touch the heavy `@flow` project (deferred to JAA-411).

**Gotcha:** fresh worktrees need `.env.local` with `VITE_AUTH_BYPASS=true` (or use `npm run dev:e2e`)
or every e2e login hangs on the unautomatable GitHub OAuth redirect. Now baked into `dev:e2e`.

**Next:** commit → push `ado` → PR to `develop` → Linear In Review → auto-merge when policies green.

## 2026-06-17 — JAA-391 (Abrir/Cerrar proceso por país/etapa) — webapp — EXECUTED, evaluator PASS

**What:** Per-stage, per-country open/close ("abrir/cerrar") with attribution. Adopted the prior
session's untracked scaffold (`ProcessStatusBadge.tsx`, `useProcessStatus.ts`, mock
`process-store.js`/`processes.js`, 2 tests) and wired it up end to end:
- **t1** types (`ProcessStage/State/Entry/StatusResponse` in `types/api.ts`) + api
  (`getProcessStatus/openProcess/closeProcess` in `lib/api.ts`).
- **t2** mounted `processesRouter` in `server.js`; `seedProcesses` in `fixtures/seed.js` + `/test/reset`;
  added `processStore.reset()`. **Changed store default `closed`→`open`** (a fresh, un-acted process
  is editable, not finalized) and rewrote `seedProcesses` to demo closed/attribution under that default
  (colombia precios + brasil elegibilidad closed; argentina precios open-by-Maria).
- **t3** `ProcessStatusBadge` on all 5 stage cards (Elegibilidad/Precios/Pesaje/Calibración/MTR).
- **t4** added `useProcessEntry(stage,country)` helper; `canTrigger/canExecute &&= !isClosed` + tooltip
  "Proceso cerrado" on every card's start/retry button (Weighting restructured so the button shows
  disabled, not hidden, when closed).
- **t5** `EligibilityDetailModal`: badge in header + "Aprobar y Aplicar" disabled when closed.
- **t6** `OverviewPage` compact read-only Lock/LockOpen indicator (`aria-label` "Proceso abierto|
  cerrado [por {user}]").
- Fixed 2 pre-existing card tests whose `@/lib/api` mock lacked the new exports
  (`WeightingCountryCard.test`, `PesajePage.test`).

**Verify:** `tsc -b` clean, `eslint` clean, **vitest 89/0** (incl. ProcessStatusBadge 4 + OverviewPage 4).
New `e2e/process-open-close.spec.ts` — open→close→reopen, live badge+attribution+trigger-gate — **3/3
pass with `--retries=0 --repeat-each=3`** (mock :5191, dev :5391, via `rtk proxy`). `eligibility.spec`
re-run clean (full lifecycle pass). Separate evaluator (ux-ui-reviewer, fresh ctx) → **ac1–ac9 PASS**
(initially flagged ac9 as spec-flaky; hardened `toggleProcess` helper → now deterministic).

**Captured (capture-don't-chase):**
- **JAA-393** — e2e suite is wall-clock-bound (~8-12 min): mock advances 1 step/2s via setInterval,
  serial workers, retries:2. Proposed env-configurable `MOCK_STEP_INTERVAL_MS` + fast/true-e2e split.
- **JAA-394** — legacy e2e specs (smoke/prices/weighting/mtr) fail on BASE from stale post-rebrand
  selectors. NOT this change — confirmed my diff touches none of those files.

**Gotcha:** a stale mock process (started before the store-default edit) served everything as "closed"
and made the first e2e run misleading — always restart the mock after editing mock-server code.

**Next:** commit → push `ado` → PR to `develop` → Linear In Review → auto-merge when policies green.

## 2026-06-17 — JAA-393 (e2e fast-mode: configurable interval + smoke/flow split) — webapp

**What:** Test-infra only. `MOCK_STEP_INTERVAL_MS` env wired into `run-store.js` (fallback
2000ms) + `eligibility-store.js` (fallback 1500ms) so e2e can shrink pipeline waits; vitest
fake-timer test asserts the cadence. Playwright split into `smoke` (`grep /@smoke/`,
`retries:0`, 38 specs) + `flow` (`grepInvert`, `retries:2`, 15 specs). npm scripts `mock:fast`,
`test:e2e:fast`, `test:e2e:full`. Scope = fixes 1+2+4 (user); #3 parallelization deferred.

**Verify recipe (important):** mock must run on **:8000** to match committed `public/config.js`
(`window.__BRIDGE_CONFIG__.API_URL` overrides `VITE_BRIDGE_API_URL`), dev on :5393,
`MOCK_SERVER_PORT=8000`. Worktree needs `.env.local` with `VITE_AUTH_BYPASS=true` (gitignored).
Run ONE server set at a time (ports 8000/5393) — overlapping mock instances clobber each other.

**RCA / re-scope:** original ACs wanted the e2e suite green, but the suite is **pre-existingly
~60% red from stale selectors** (app renders fine; specs use outdated locators — e.g. Precios
renders 9 cards as `<button aria-label="View price validation history…">` while the spec waits
for `.country-card`/`article`). Fails **identically at 150ms and 2000ms** → orthogonal to this
change. Filed **JAA-397** (related). ac3/ac4 re-scoped to prove the speedup mechanism + no-new-
failures. Separate evaluator (ux-ui-reviewer): ac1–ac4 **all PASS**. vitest 83/83, lint, tsc green.

**Result:** worktree `../ms_process_app-JAA-393`, branch `feat/JAA-393-e2e-fast-mode` (off
`ado/develop`). Commit `ed5f684`. **PR 516252 → develop** (In Review). **Next:** check ADO branch
policies; auto-merge when green (re-run `/harness JAA-393` → step 7).

## 2026-06-16 — JAA-387 (eligibility results_ready reads as "done" at 2/8) — webapp

**What:** Screenshot showed a country card with amber **"Resultados listos"** badge at 2/8
(25%). Root cause: NOT a data desync — `results_ready` is a legit intermediate human-approval
gate in the 8-step, user-gated state machine (mirrors the real Bridge API: run → results_ready
→ approve → mordom_ready → upload → ready). Two real problems: (1) the badge "Resultados listos"
reads as *finished*, same tone as the terminal `ready`="Listo"; (2) the approve action
("Aprobar y Aplicar") was buried in the "Ver detalle" modal while the card showed only an inert
"Revisar resultados" text → looked stuck at 25% with no path forward.

**Fix:** `types.ts` STATUS_CONFIG: `results_ready` "Resultados listos" → **"Pendiente de revisión"**,
`mordom_ready` "MorDom listo" → "Revisar MorDom" (same class of bug). `EligibilityCountryCard.tsx`:
replaced the inert text with a clickable **"Revisar y aprobar"** CTA (ClipboardCheck, amber) that
opens the detail modal; suppressed the now-redundant "Ver detalle" in results_ready only.
Updated eligibility e2e (badge text + CTA path) incl. a negative assertion that "Resultados listos"
no longer appears.

**Verify:** `npx tsc -b` clean, `npm run lint` clean, vitest **81/81**, eligibility Playwright
**5/5** (mock :5050, dev :5273, run via `rtk proxy` — rtk mangles playwright stdout otherwise).
Separate skeptical evaluator (ux-ui-reviewer, fresh ctx) re-ran all → **ac1–ac4 PASS**.

**Findings captured (capture-don't-chase):**
- `src/modules/precios/types.ts` has the SAME `results_ready: "Resultados listos"` badge — likely
  the same confusion in the prices module. Out of scope here; worth its own ticket.

**Harness friction:** JAA-371 still unfixed — `jsonwebtoken` missing from package.json, mock crashes
on clean worktree until `npm install --no-save jsonwebtoken`. Also: `rtk` proxy hook mangles
`playwright --reporter=json/list` stdout (truncates to "PASS (n)") → use `rtk proxy npx playwright …`.

**Result:** worktree `../ms_process_app-JAA-387`, branch `fix/JAA-387-elegibilidad-results-ready-clarity`
(off `ado/develop`). Next: commit → push to ado → PR to develop → Linear In Review → auto-merge when green.

## 2026-06-15 — precios action row clip (ad-hoc, from screenshot) — webapp

**What:** Same family as JAA-360/pesaje/calibracion. In `PricesCountryCard.tsx` the running-state
action row (`Ejecutando…` `flex-1` + red `Detener` + eye preview) used a non-wrapping `flex gap-2`,
clipping the eye button in narrow cards. Fix: `flex gap-2` → `flex flex-wrap gap-2` (1 line).

**Verify:** `npx eslint` clean on the file; `tsc -b` shows only pre-existing unrelated errors
(ProcessStatusBadge / useProcessStatus — not this file). Playwright: logged in (Continue dev),
triggered Argentina validation at 900px width → confirmed Ejecutando + Detener + eye all contained
in the card, no clipping (screenshot). Committed on `fix/pesaje-action-row-wrap`.

## 2026-06-15 — JAA-343 (weighting params from param_configs.py) — webapp

**What:** Replaced the 5 placeholder Pesaje params with the 9 real GLOBAL params from
`KWP-pesaje/modules/param_configs.py` (exact UPPER_CASE keys → clean Databricks `job_parameters`):
N_PERIODOS_OUTLIERS, MAX_ROUNDS_COLAPSO, JERARQUIA_MIN_COLAPSO (nullable), CORRECAO_BOUNDS (bool),
METODO_BOUNDS (enum), P_BOUNDS, F_BOUNDS, AGREGACAO_BOUNDS (enum), MAX_ERR_RATIO_BOUNDS.
- New `src/modules/pesaje/weightingParams.ts` (type + DEFAULT + WEIGHTING_PARAM_FIELDS descriptors +
  by-key map). `WeightingConfigDialog` renders number / nullable-number / Switch / Select from
  descriptors (new `src/components/ui/switch.tsx` via radix-ui). Type+defaults re-exported from the
  dialog for import stability.
- `WeightingDetailModal` re-run editor is now type-aware (number/select/switch) so enum/bool params
  don't corrupt on re-run (was hardcoded `type=number` + parseFloat).
- Propagation chain unchanged & generic (`{...weightingParams}` → POST /weighting/runs →
  parameters_json); mock round-trips untouched.

**Verify:** `npm test` 80✓ (74→80, +6 new in WeightingConfigDialog.test.tsx), `npm run lint` ✓,
`npx tsc -b` ✓. New `e2e/weighting-params.spec.ts` PASS — edits METODO_BOUNDS=iqr +
MAX_ROUNDS_COLAPSO=80 + CORRECAO_BOUNDS off, confirms run, asserts the 9 keys land in the POST body
AND in the 201 response `parameters_json`. Ran against `node mock-server/server.js` (:5000) + dev
(:5199, VITE_AUTH_BYPASS=true). NOTE: this worktree needed `npm install` inside `mock-server/`
(its own package.json; jsonwebtoken was missing).

**Findings captured (capture-don't-chase):**
- JAA-374 — backend ms-process-api: reflect params in RunCreate.parameters → job_parameters (created).
- Linear free-issue limit hit, so these two could NOT be filed — TODO when quota frees:
  - MANUAL_COLLAPSES pair-editor (deferred from this ticket; list of (keep_uig, remove_uig) pairs).
  - `e2e/weighting.spec.ts` stale selectors — fails 4/4 on the BASE too (verified via git stash),
    pre-existing from the UI modernization (country-card/article selectors, /parameters/i regex vs
    "Parametros" label, Ejecutar→Confirmar AlertDialog flow). NOT a JAA-343 regression.

**Next:** evaluator (ux-ui-reviewer) → commit → push ado → PR to ado/develop → Linear In Review.

## 2026-06-15 — contract audit (ad-hoc) — investigation only

**What:** Triangulated mock-server ⇄ frontend (`src/lib/api.ts`, `src/types/api.ts`) ⇄ real
backend (`../ms-process-api`, FastAPI). Finding: frontend + mock implement a full contract the
backend has only ~1/3 built. **37 backend endpoints return 501** — entire Eligibility/Prices/
Weighting/MTR/Traceability modules + `events/{id}/download|tables`. Metadata `last-*` cards
(except last-calibration) are empty backend stubs. Admin is aligned at `/api/v1/admin/*` (early
agent claim of a `/admin` split was wrong — verified mount at server.js:80). Subtle real
divergences: mock `last-sync` ignores `stage` param (metadata.js:86 hardcodes "inicio"); mock is
untyped so `period` int-vs-str boundary untested; mock `/trigger` drops 6 fields frontend sends.

**Captured (no code written):** JAA-377 (parent, backend gaps) + sub-issues JAA-378 eligibility,
JAA-379 prices, JAA-380 weighting, JAA-381 mtr, JAA-382 traceability (low-pri/deferred), JAA-383
events download+tables. JAA-384 = mock-fidelity (C1 period types, C2 last-sync stage, C3 type
lie, C4 trigger fields), related to JAA-377. Backend work belongs in the ms-process-api repo.

**Next:** each sub-issue is its own /harness session. JAA-384 is a quick frontend-repo win.

## 2026-06-15 — calibration-download-streaming (ad-hoc) — webapp

**What:** Tested/fixed the Calibration History CSV "download with streaming" flow.
Root cause of the screenshot's **"Failed to load tables"**: the real `ms_process_api`
`/events/:jobId/tables` + `/download` are **501 TODO stubs** (`routes/events.py`); only
`calibration/:tag/download` streams (StreamingResponse, 64KiB). Against the mock both work.
Made the mock actually stream: `/events/:jobId/download?table=` now emits a chunked CSV of
the table's rows via a constant-memory `Readable` (no Content-Length), 404 on unknown table,
job-report fallback kept. Seeded `calibracion` jobs (develop seeded none → empty modal).
Made mock `PORT` + e2e `MOCK_SERVER_PORT` env-configurable. New e2e
`e2e/calibration-download.spec.ts` (history → picker → streamed download >100KB).

**Verify:** in-process HTTP proof (chunked, ~2.2MB/50 chunks), `/tables` 200×6, Playwright
`1 passed`, vitest 74/0 + tsc + eslint clean. Separate skeptical evaluator re-ran all → ac1–ac4 PASS.

**Result:** worktree `../ms_process_app-download-streaming`, branch `fix/calibration-download-streaming`
(off `ado/develop`), commit `026a16e`, pushed, **PR #515582 → develop**. Backend follow-up
**JAA-376** (implement the two 501 stubs w/ StreamingResponse). `public/config.js` left untouched
(the :5000 switch is local-only). Cleanup: `git worktree remove ../ms_process_app-download-streaming`
after merge.

**Gotchas learned:** `pkill -f vite`/`server.js` self-matches the running Bash command and kills
its own shell → exit 144 (use `kill $PID`). Mock hard-coded port 5000 (now honors `PORT`).

## 2026-06-15 — JAA-360 (eligibility card action row clip) — webapp

**What:** In `EligibilityCountryCard.tsx` the `results_ready` action row packed 3 items
(Re-ejecutar + `flex-1` "Revisar resultados" note + Ver detalle) into a non-wrapping
`flex gap-2`, overflowing the card and clipping "Ver detalle". Fix: `flex gap-2` →
`flex flex-wrap gap-2` (general fix; no-op for the ≤2-item states). Added e2e regression
test `results_ready action row does not clip 'Ver detalle' (JAA-360)` asserting the button's
bounding box is within the card right edge + a normal `.click()` opens the modal; converted the
old `dispatchEvent` workaround in the lifecycle test to a real click.

**Verify:** `npm test` 74✓, `npm run lint` ✓, `npx tsc -b` ✓. Playwright eligibility **5/5 PASS**
(clean run). Evaluator (ux-ui-reviewer, separate ctx) ALL PASS — measured CARD_RIGHT=493px vs
BTN_RIGHT=412px (81px inside, not clipped).

**Findings captured (capture-don't-chase):**
- JAA-371 — `jsonwebtoken` imported by `mock-server/routes/auth.js` but not declared in
  package.json → `npm run mock` crashes on clean install (unblocked locally via `--no-save`).

**Harness friction logged:** AGENTS.md e2e recipe omits `VITE_AUTH_BYPASS=true`; without it the
app loads MSAL and role-gated nav (Elegibilidad) never renders → e2e fail at navigateTo.

**Next:** commit → push to ado (needs AZURE_DEVOPS_EXT_PAT) → PR to develop → Linear In Review.

## weighting-history-modal-width (2026-06-18) — ad-hoc UI bug

**What:** "Historial de Pesaje" dialog table was too narrow → annoying horizontal scroll.
Root cause: shadcn `DialogContent` base ends with `sm:max-w-lg` (512px); the modal passed bare
`max-w-2xl`, which tailwind-merge does NOT treat as conflicting with the `sm:`-prefixed base, so
`sm:max-w-lg` won and capped the dialog at 512px while the fixed-px grid (80/100/140/80) overflowed.

**Fix (`WeightingHistoryModal.tsx`):** dialog → `sm:max-w-3xl` (tailwind-merge DOES strip the
conflicting `sm:max-w-lg` → 768px); grid columns → `minmax()` with Resumen `minmax(0,1fr)` +
truncate so it's fluid. Live dialog now offsetWidth=768, overflow=0, cols `64 80 110 52 303 53`.

**Verify:** npm test 92✓, npm run lint ✓, npx tsc -b ✓. Playwright weighting.spec.ts **4/4 PASS**
(added regression test "history modal table fits without horizontal scroll"). Evaluator confirmed
code + generated CSS + ac3.

**Harness friction:** evaluator false-FAILed twice — mock runs on **port 5000** (not the
public/config.js 8000), and **`rtk proxy` drops env vars** so PLAYWRIGHT_BASE_URL was lost →
browser hit stale sibling worktree on :5173 (OLD code). Use plain `npx playwright` when the env var
matters. Updated memory `reference-rtk-playwright-mangles-output`.

**Next:** commit → push ado → PR to develop.

## history-view-horizontal-scroll (2026-06-18) — extend pesaje fix to JAA-424 views

**What:** JAA-424 unified the history grid into Precios/Calibración/Elegibilidad but copied the OLD
layout (dialog `max-w-2xl` → capped at 512px by shadcn `sm:max-w-lg`; fixed-px grid), so all three
got the horizontal-scroll bug. Applied the same fix as pesaje: each `GRID` const → `minmax()` fluid
columns (Resumen `minmax(0,1fr)`, already truncates); `DialogContent` `max-w-2xl` → `sm:max-w-3xl`.
Extended e2e `history-unify.spec.ts` assertGrid to assert `scrollWidth-clientWidth <= 1`.

**Verify:** npm test 131✓, lint ✓, tsc ✓. Playwright history-unify.spec.ts 3/3 PASS. Probe: all
three dialogs offsetWidth=768, overflow=0. Evaluator (separate ctx) ALL PASS.

## pesaje-card-dialog-ux (2026-06-18)
- WHAT: Pesaje card UX. Whole card is now clickable → opens the detail dialog, which is the
  single place to configure params + run/iterate ("Ejecutar" first run / "Re-ejecutar" after).
  Removed the redundant "Marcar como listo" button (close stays on the status badge) and the
  oversized "Configurar parametros" button. Deleted the now-dead WeightingConfigDialog + test.
- WHY: User feedback — mark-as-ready duplicated the badge close; the config button was too big
  and the flow unintuitive. Iterate-from-the-dialog matches the mental model.
- VERIFY: vitest 124/124, eslint + tsc -b clean; headless Playwright walkthrough of /pesaje PASS.
  Separate skeptical evaluator: all 7 ACs PASS.
- NEXT: push branch feat/pesaje-card-dialog-ux + open PR to ado/develop (awaiting user go-ahead;
  ad-hoc slug, no Linear ticket).

## JAA-429 (2026-06-18) — Telemetry: errors/crashes + usage analytics

**What:** New frontend telemetry. `src/lib/telemetry.ts` (standalone fetch + sendBeacon): queued,
debounced, capped batch flush that NEVER throws/blocks; carries sessionId + appVersion + user email.
Events: session_start, session_end(durationMs, beaconed on pagehide), page_view(path+dwellMs),
interaction (declarative `data-telemetry` OR auto-captured from any button/a/[role=button]).
Errors: window.onerror + unhandledrejection + React `ErrorBoundary` → captureError payload
{message,stack,kind,path,appVersion,userAgent,occurredAt,sessionId,user}. Flush to
POST /telemetry/{events,errors}. Mock `routes/telemetry.js` → 202 {accepted,count}. Wired in
main.tsx (initTelemetry) + App.tsx (ErrorBoundary wrap + TelemetryRouteListener) + nav data-telemetry
tags. Privacy doc: specs/SPEC-telemetry.md.

**Verify:** vitest 135✓ (added telemetry.test.ts 9 + ErrorBoundary.test.tsx 2), lint ✓, tsc ✓.
Playwright telemetry.spec.ts (smoke) 2/2 PASS (nav→events 202, forced error→errors 202). curl both
endpoints → 202. Separate skeptical evaluator (ux-ui-reviewer, fresh ctx): ALL 7 ACs + wiring PASS.

**Harness friction:** dev vite binds IPv6 `[::1]` only — curl/PLAYWRIGHT_BASE_URL must use [::1],
not 127.0.0.1 (already in memory). Used dev:5273 + mock:8000 to avoid sibling-worktree collisions.

**Next:** commit → push ado → PR to develop → auto-merge when policies green.

## 2026-06-24 — JAA-558 (silence telemetry/events 405 + processes/status 404 console errors) — DONE (PR open)
**Fix:** runtime feature guard `window.__APP_CONFIG__.features` ({telemetry, processStatus}), read via new
`src/lib/feature-flags.ts` (default ON). `initTelemetry()` early-returns when off; `useProcessStatus`
gets `enabled: isProcessStatusEnabled()`. `main.tsx` passes `features` through from Tauri config.json.
Real-API deploys (`deploy/config.{dev,prod}.js`) set both OFF → zero such calls → zero 405/404 console
errors; `public/config.js` keeps them ON (mock supports both). Reversible: flip on when backend implements.
**Root-cause gotcha:** Chromium ran the `type=module` main.tsx BEFORE the classic `defer config.js`, so
`initTelemetry()` read the flag before `__APP_CONFIG__` existed (defaulted ON → still posted). Fixed by also
gating the single network chokepoint `post()` (re-checks flag at send time, after config has loaded) — belt
+ suspenders. processStatus was unaffected (React renders after load).
**Verify:** vitest 191✓ (+7: feature-flags.test.ts, useProcessStatus.test.tsx), lint ✓, tsc ✓.
Playwright e2e feature-flags.spec.ts smoke 2/2 (off→0 calls/0 errors; on→202+200, no errors); existing
telemetry.spec.ts smoke still green. Separate evaluator (ux-ui-reviewer, fresh ctx, independent Playwright
cross-check): ac1-ac5 + overall ALL PASS → .harness/eval_feedback/JAA-558.json.
**Harness friction:** background `rtk proxy npx playwright … | grep` lost stdout to the .output file
(0B) — run playwright e2e in the FOREGROUND to capture pass/fail. Used isolated ports dev:5274 mock:5074
(5173/5000 taken by sibling worktree); symlinked node_modules from main checkout (same commit, same lockfile).
