#!/usr/bin/env bash
# =============================================================================
# deploy-spa.sh — build the ms-process-app SPA and update ONLY the frontend on
# an App Service, via a Kudu zip-deploy into its same-origin SPA mount.
# =============================================================================
# Each App Service hosts backend + frontend together; the backend is the
# container image, the frontend is static files served from SPA_DIR=/home/site/spa
# (same-origin, so the SPA talks to /api/v1 on its own host). This script touches
# ONLY that SPA mount — it never redeploys the backend container.
#
# Surfaces:
#   dev → app-cl-prd-nmr-wp-msproc-dev   real ms-process-api, IP-locked
#   prd → app-cl-prd-nmr-wp-msproc-01    mock demo backend (ms-process-mock)
#
# NOT covered here: the separate "prod" SPA that the ADO pipeline
# `ms-process-app-deploy` builds (real Entra auth) and uploads to a Storage
# static website ($web) on push to `main`. See docs/DEPLOY.md.
#
# Usage:
#   scripts/deploy-spa.sh dev                 build + deploy to dev
#   scripts/deploy-spa.sh prd --yes           build + deploy to prd (guarded)
#   scripts/deploy-spa.sh dev --dry-run       build + zip, print plan, no upload
#   scripts/deploy-spa.sh --help
#
# Requires: node/npm, az (logged in), zip, curl.
set -euo pipefail

# --- locate repo root (script lives in <repo>/scripts) ----------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- per-environment configuration ------------------------------------------
# Build env differs by environment:
#   dev → auth BYPASSED (DevAuthProvider), so the IP-locked dev env opens without
#         a login screen.
#   prd → REAL Entra login (azure-builtin / App Service Easy Auth), matching the
#         ms-process-app-deploy pipeline — the public demo shows a Microsoft login.
# Both serve the SPA same-origin, so the API is always /api/v1.
BUILD_API_URL="/api/v1"

resolve_env() {
  # Sets, per env: APP_NAME, CONFIG_SRC, REQUIRE_YES, and the build vars
  # BUILD_AUTH_BYPASS / BUILD_AUTH_PROVIDER (empty provider = decided by bypass).
  BUILD_AUTH_PROVIDER=""
  case "$1" in
    dev)
      APP_NAME="app-cl-prd-nmr-wp-msproc-dev"
      CONFIG_SRC="${REPO_ROOT}/deploy/config.dev.js"
      REQUIRE_YES="false"
      BUILD_AUTH_BYPASS="true"
      ;;
    prd|prod)
      APP_NAME="app-cl-prd-nmr-wp-msproc-01"
      CONFIG_SRC="${REPO_ROOT}/deploy/config.prod.js"
      REQUIRE_YES="true"
      BUILD_AUTH_BYPASS="false"
      BUILD_AUTH_PROVIDER="azure-builtin"
      ;;
    *)
      echo "ERROR: unknown environment '$1' (expected: dev | prd)" >&2
      return 1
      ;;
  esac
}

usage() {
  cat >&2 <<'EOF'
Usage: scripts/deploy-spa.sh <dev|prd> [--yes] [--dry-run]

  dev        deploy the SPA to app-cl-prd-nmr-wp-msproc-dev (real API)
  prd        deploy the SPA to app-cl-prd-nmr-wp-msproc-01  (mock demo)

  --yes      required to actually upload to prd (no-op for dev)
  --dry-run  build + zip and print the plan, but do NOT upload
  --help     show this help

The frontend SPA is uploaded to /home/site/spa via Kudu zip-deploy. The backend
container is never touched. Needs `az login` with rights on the App Service.
EOF
}

# --- parse args -------------------------------------------------------------
ENV_ARG=""
ASSUME_YES="false"
DRY_RUN="false"
for arg in "$@"; do
  case "$arg" in
    --help|-h) usage; exit 1 ;;
    --yes|-y)  ASSUME_YES="true" ;;
    --dry-run) DRY_RUN="true" ;;
    dev|prd|prod) ENV_ARG="$arg" ;;
    *) echo "ERROR: unknown argument '$arg'" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$ENV_ARG" ]]; then
  echo "ERROR: missing environment argument" >&2
  usage
  exit 1
fi

resolve_env "$ENV_ARG" || { usage; exit 1; }

# --- prd guard: refuse a real upload without --yes --------------------------
if [[ "$REQUIRE_YES" == "true" && "$ASSUME_YES" != "true" && "$DRY_RUN" != "true" ]]; then
  echo "REFUSING: '$ENV_ARG' is a guarded environment ($APP_NAME)." >&2
  echo "Re-run with --yes to confirm the upload, or --dry-run to preview." >&2
  exit 1
fi

if [[ ! -f "$CONFIG_SRC" ]]; then
  echo "ERROR: runtime config not found: $CONFIG_SRC" >&2
  exit 1
fi

SCM_HOST="${APP_NAME}.scm.azurewebsites.net"
APP_HOST="${APP_NAME}.azurewebsites.net"

echo "==> Target env : $ENV_ARG"
echo "==> App Service: $APP_NAME"
echo "==> Config     : ${CONFIG_SRC#"${REPO_ROOT}/"}"
echo "==> Dry run    : $DRY_RUN"

# --- build (same-origin) ----------------------------------------------------
echo "==> Building SPA (VITE_AUTH_BYPASS=$BUILD_AUTH_BYPASS, VITE_AUTH_PROVIDER=${BUILD_AUTH_PROVIDER:-<bypass>}, VITE_BRIDGE_API_URL=$BUILD_API_URL)"
(
  cd "$REPO_ROOT"
  export VITE_AUTH_BYPASS="$BUILD_AUTH_BYPASS" VITE_BRIDGE_API_URL="$BUILD_API_URL"
  # Only set the provider for real-auth builds (dev relies on the bypass).
  [[ -n "$BUILD_AUTH_PROVIDER" ]] && export VITE_AUTH_PROVIDER="$BUILD_AUTH_PROVIDER"
  npm run build
)

# `vite build` copies public/config.js (localhost dev config) into dist/. Replace
# it with the target environment's runtime config so the SPA talks to the right API.
echo "==> Injecting runtime config.js for '$ENV_ARG'"
cp "$CONFIG_SRC" "${REPO_ROOT}/dist/config.js"

# --- package ----------------------------------------------------------------
ZIP_DIR="$(mktemp -d -t spa-XXXXXX)"
ZIP_PATH="${ZIP_DIR}/spa.zip"
trap 'rm -rf "$ZIP_DIR"' EXIT
( cd "${REPO_ROOT}/dist" && zip -qr "$ZIP_PATH" . )
echo "==> Packaged $(unzip -l "$ZIP_PATH" | tail -1 | awk '{print $2}') files -> $ZIP_PATH"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "==> DRY RUN: would PUT the zip to https://${SCM_HOST}/api/zip/site/spa/ — skipping upload."
  exit 0
fi

# --- upload via Kudu zip-deploy ---------------------------------------------
echo "==> Acquiring AAD token for Kudu"
TOKEN="$(az account get-access-token --resource https://management.core.windows.net/ --query accessToken -o tsv)"
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: could not obtain AAD token (run 'az login')" >&2
  exit 1
fi

echo "==> Uploading SPA to https://${SCM_HOST}/api/zip/site/spa/"
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/zip" \
  --data-binary "@${ZIP_PATH}" \
  "https://${SCM_HOST}/api/zip/site/spa/")"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: Kudu upload failed (HTTP ${HTTP_CODE})" >&2
  exit 1
fi
echo "==> Upload OK (HTTP 200)"

# --- verify the live deployment ---------------------------------------------
echo "==> Verifying https://${APP_HOST}/"
INDEX_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://${APP_HOST}/" || echo "000")"
echo "    index.html  -> HTTP ${INDEX_CODE}"
CONFIG_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://${APP_HOST}/config.js" || echo "000")"
echo "    config.js   -> HTTP ${CONFIG_CODE}"

if [[ "$INDEX_CODE" != "200" ]]; then
  echo "WARNING: app did not return 200 (it may be IP-locked from this host)." >&2
  echo "Upload succeeded; verify manually from an allow-listed network." >&2
fi

echo "==> Done: '$ENV_ARG' SPA deployed to $APP_NAME."
