# Progress — ms_process_app

_Session notes: what / why / next. Newest on top._

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
