# Progress — ms_process_app

_Session notes: what / why / next. Newest on top._

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
