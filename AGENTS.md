# AGENTS.md — ms_process_app (frontend)

> Map for the /harness workflow. ~100 lines, a map not an encyclopedia. Archetype: **webapp**.

## What this repo is
`ms_process_app` — Vite + React 19 + TypeScript + Tauri desktop frontend for the MS process
pipeline (prices / weighting / traceability / MTR / eligibility modules). Auth via Azure AD (MSAL).
Routed under basename `/ms-process-app/`. **This is the repo I work from day-to-day.**

**Done = `npm test` + `npm run lint` + typecheck pass AND a Playwright e2e walkthrough passes
against the running app.** Backend-green is not done.

## Backend (sibling repo — usually NOT touched from here)
- API lives at `~/Documents/projects/ms-process-api` (the "Bridge API", FastAPI/Python).
- Frontend talks to it via `VITE_BRIDGE_API_URL` (default `http://localhost:8000/api/v1`).
- **Local verification does NOT require the real backend** — use the in-repo **mock-server**
  (`npm run mock`, or `npm run mock:hybrid` to proxy some calls to a live API). Default to the mock
  so the harness can grade from this repo alone.

## Cross-repo features (frontend + backend)
A feature that needs both this repo and `ms-process-api` is NOT one session over two repos. Split it:
1. Linear: one parent issue + two sub-issues (API + UI) via `/track-linear`.
2. **Contract first** — agree the endpoint shape and encode it in BOTH `mock-server/` (here) and the
   API's acceptance criteria. The `mock-server/` is the seam: it lets the UI be built + Playwright-
   tested **without the real backend running**.
3. Two worktrees in two repos (`../ms-process-api-<API-ID>`, `../ms_process_app-<UI-ID>`), each its
   own `/harness` run, VERIFY_CMD and PR to its own integration branch.
4. Integration check at the end: `npm run mock:hybrid` (proxy to a live API) or point
   `VITE_BRIDGE_API_URL` at the running API. Mock vs real divergence = a new ticket.
   Full pattern: `~/.claude/skills/harness/SKILL.md` → "Cross-repo tickets".

## Git / integration (the PR target that counts)
- **INTEGRATION_REMOTE = `ado`** (Azure DevOps — the official one). `origin` (GitHub
  `jaalduna/ms_process_app`) is a personal mirror, NOT the PR target.
- **INTEGRATION_BRANCH = `develop`** (local `develop` tracks `ado/develop`).
- **Branch naming:** `feat/<LINEAR-ID>-<slug>` (feature) / `fix/<LINEAR-ID>-<slug>` (bug), Linear IDs
  like `JAA-237`. Base every branch on freshly-fetched `ado/develop`.
- **Auth:** ADO fetch/push needs `AZURE_DEVOPS_EXT_PAT` (user:pat form) — see global memory
  `feedback_ado_git_push_pat`. AAD alone gives 401.
- **PR:** `az repos pr create --target-branch develop --source-branch feat/<ID>-<slug>`. Branch
  policies (`/cicd`) enforce reviewers/checks. Never push to `develop` directly; never auto-merge.
- Start-of-ticket sync: `git fetch ado develop` (do NOT `git pull` onto the checked-out branch).

## VERIFY_CMD
```
npm test && npm run lint && npx tsc -b
```
(`npm test` = vitest run; `npm run lint` = eslint; `npx tsc -b` = typecheck via project refs.)
THEN the decisive UI gate — Playwright e2e:
```
# terminal A: npm run mock        (mock backend)
# terminal B: npm run dev         (vite on 5173, base /ms-process-app/)
npx playwright test               # testDir e2e/, baseURL http://[::1]:5173/ms-process-app/
```
Playwright e2e is the gate the evaluator (`ux-ui-reviewer`) runs — agents mark UI done without
testing it, so this is mandatory, not optional. Note: e2e timeouts are 5 min (syncs are slow);
servers are started manually (config `webServer: undefined`).

## Run / init
- Dev server: `npm run dev` → http://[::1]:5173/ms-process-app/
- Mock backend: `npm run mock` (fixtures in `mock-server/fixtures/`, routes in `mock-server/routes/`)
- Tauri desktop: `npm run tauri:dev` (rarely needed for feature work)
- Env: copy `.env.example` → `.env.local`; mock-server may need its own `.env` (GitHub OAuth, JWT).

## Acceptance-criteria style (derive from specs/, make testable)
The `specs/` dir is the source of truth: `PRD-ms-process-app.md` + per-module `SPEC-*.md`
(prices, weighting, traceability, mtr, pipeline-deps, module-registry) and `SPEC-e2e-tests.md` /
`SPEC-mock-server.md`. Each criterion must be a concrete Playwright assertion — e.g. "triggering a
Chile sync shows the in-progress state then the complete state" — never "looks good".

## House rules (enforced by evaluator)
- No placeholder components, no mocked-out handlers left in product code.
- Errors surface to the user (sonner toasts); no swallowed exceptions.
- New UI must be reachable from existing navigation — no orphan routes.
- Respect the `/ms-process-app/` basename in routes and Playwright URLs.

## Where things live
- Pages/routes: `src/pages/`   Modules: `src/modules/`   Components: `src/components/`
- Hooks: `src/hooks/`   API/clients: `src/lib/`   Types: `src/types/`
- Unit tests: `src/__tests__/` (vitest)   E2E: `e2e/*.spec.ts` (Playwright)
- Mock backend: `mock-server/`   Specs: `specs/`   Design docs: `docs/design/`
