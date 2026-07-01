#!/usr/bin/env bash
# register_weighting_jobs.sh — idempotent registration of pesaje Databricks job IDs
# on the App Service dev backend (PUT /api/v1/admin/jobs/pesaje/<country>).
#
# Usage:
#   ./scripts/register_weighting_jobs.sh [APP_SERVICE_URL]
#
# Default URL: https://app-cl-prd-nmr-wp-msproc-dev.azurewebsites.net
# Requires: curl, VPN / IP allow-list for the App Service.
#
# The App Service dev authenticates to the PROD Databricks workspace
# (adb-2125673683576002.2.azuredatabricks.net), so these are the PROD job IDs
# from `databricks jobs list` (default profile → prd workspace).

set -euo pipefail

APP_URL="${1:-https://app-cl-prd-nmr-wp-msproc-dev.azurewebsites.net}"
BASE="${APP_URL}/api/v1/admin/jobs/pesaje"

# PROD Databricks workspace job IDs (from `databricks jobs list`).
# Refresh with: databricks jobs list | grep pesaje_
declare -A JOBS=(
  [chile]=1037089833892412
  [argentina]=1077805433135468
  [bolivia]=546009806831618
  [brasil]=772813989070829
  [peru]=479341064124353
  [cam]=970445574834742
  [colombia]=965498528798311
  [mexico]=625045735583974
  [ecuador]=344719626231906
)

echo "Registering weighting job IDs on ${APP_URL}..."
ALL_OK=true
for country in "${!JOBS[@]}"; do
  JOB_ID="${JOBS[$country]}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "${BASE}/${country}" \
    -H "Content-Type: application/json" \
    -d "{\"job_id\": ${JOB_ID}}")
  if [[ "$STATUS" == "200" ]]; then
    echo "  ✓ ${country} → ${JOB_ID}"
  else
    echo "  ✗ ${country} → HTTP ${STATUS}" >&2
    ALL_OK=false
  fi
done

if $ALL_OK; then
  echo "All job IDs registered. Flushing API config cache..."
  RELOAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/v1/admin/reload" \
    -H "Content-Type: application/json")
  if [[ "$RELOAD" == "200" ]]; then
    echo "Cache reloaded. Execute endpoints are now live."
  else
    echo "Warning: cache reload returned HTTP ${RELOAD}. Try POST /api/v1/admin/reload manually." >&2
  fi
else
  echo "Some registrations failed — check VPN/IP allow-list." >&2
  exit 1
fi
