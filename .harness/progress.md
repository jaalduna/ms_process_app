# Progress — ms_process_app

_Session notes: what / why / next. Newest on top._

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
