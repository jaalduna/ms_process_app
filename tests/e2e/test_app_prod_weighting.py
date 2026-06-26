"""
E2E test: full weighting run against the dev App Service (real Databricks backend).

This test exercises the complete path:
  POST /weighting/runs → POST /execute → poll GET /weighting/runs/{id}
  until completed (verifying step progression) → GET /download (real artifact).

Prerequisites:
  - IP allowlisting / VPN access to the App Service
  - Dev Databricks workspace with pesaje_<country> jobs registered (JAA-568)

Required env vars:
  WEIGHTING_E2E_API_URL   Base URL of the API, e.g.
                          https://app-cl-prd-nmr-wp-msproc-dev.azurewebsites.net/api/v1

Optional env vars:
  WEIGHTING_E2E_COUNTRY   Country slug (default: bolivia)
  WEIGHTING_E2E_PERIOD    Period as YYYYMM int (default: 202604)
  WEIGHTING_E2E_TIMEOUT   Poll timeout in seconds (default: 3600)

Run:
  WEIGHTING_E2E_API_URL=https://app-cl-prd-nmr-wp-msproc-dev.azurewebsites.net/api/v1 \\
    pytest tests/e2e/test_app_prod_weighting.py -v -s
"""

import os
import time

import httpx
import pytest

API_URL = os.environ.get("WEIGHTING_E2E_API_URL", "").rstrip("/")
COUNTRY = os.environ.get("WEIGHTING_E2E_COUNTRY", "bolivia")
PERIOD = int(os.environ.get("WEIGHTING_E2E_PERIOD", "202604"))
TIMEOUT = int(os.environ.get("WEIGHTING_E2E_TIMEOUT", "3600"))
POLL_INTERVAL = 30

# Step progression defined in ms-process-api/routes/weighting.py STEPS constant
STEPS_ORDER = [
    "load_eligible",
    "calculate_weights",
    "validate_distributions",
    "export_results",
    "complete",
]

# Gold output column schema from JAA-564 OUTPUT_CONTRACT / JAA-569 fixture
EXPECTED_CSV_COLS = {"Periodo", "Ano", "Mes", "iddomicilio", "Peso"}

pytestmark = pytest.mark.skipif(
    not API_URL,
    reason="Set WEIGHTING_E2E_API_URL to run against real backend (requires VPN/IP allowlist)",
)


@pytest.fixture(scope="module")
def client() -> httpx.Client:
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        yield c


def test_weighting_e2e_create_execute_poll_download(client: httpx.Client) -> None:
    """
    Full E2E: create → execute → poll until completed → download artifact.

    AC1 (JAA-570): test runs verde with a real Databricks run (run_id logged).
    AC2 (JAA-570): app run ↔ Databricks workspace run are 1:1 (run_id cited for cross-check).
    AC3 (JAA-570): download delivers the real gold Pesos CSV (non-empty, correct schema).
    """
    # ── 1. Create run ──────────────────────────────────────────────────────────
    resp = client.post("/weighting/runs", json={"country": COUNTRY, "period": PERIOD})
    assert resp.status_code == 201, f"POST /weighting/runs failed ({resp.status_code}): {resp.text}"
    run = resp.json()
    run_id: str = run["run_id"]
    assert run["status"] == "pending", f"Expected pending after create, got: {run['status']}"
    print(f"\n[JAA-570] Created run: run_id={run_id!r} country={COUNTRY!r} period={PERIOD}")

    # ── 2. Execute — triggers the pesaje_<country> Databricks job ──────────────
    resp = client.post(f"/weighting/runs/{run_id}/execute")
    assert resp.status_code == 200, (
        f"POST /weighting/runs/{run_id}/execute failed ({resp.status_code}): {resp.text}"
    )
    run = resp.json()
    assert run["status"] in ("running", "pending"), (
        f"Unexpected status immediately after execute: {run['status']}"
    )
    print(f"[JAA-570] Execute accepted — status={run['status']!r}")

    # ── 3. Poll until completed ────────────────────────────────────────────────
    deadline = time.monotonic() + TIMEOUT
    seen_steps: set[str] = set()

    while time.monotonic() < deadline:
        resp = client.get(f"/weighting/runs/{run_id}")
        assert resp.status_code == 200, (
            f"GET /weighting/runs/{run_id} failed ({resp.status_code}): {resp.text}"
        )
        run = resp.json()
        status: str = run["status"]
        current_step = run.get("current_step")

        for step in run.get("steps", []):
            if step.get("status") in ("running", "completed"):
                seen_steps.add(step["name"])

        print(
            f"[JAA-570] poll  status={status!r:12}  current_step={current_step!r:25}"
            f"  seen={sorted(seen_steps)}"
        )

        if status == "completed":
            break
        if status in ("failed", "cancelled"):
            pytest.fail(
                f"Run {run_id!r} ended with status={status!r}. "
                f"error_message={run.get('error_message')!r}"
            )

        time.sleep(POLL_INTERVAL)
    else:
        pytest.fail(
            f"Run {run_id!r} did not reach 'completed' within {TIMEOUT}s. "
            f"Last status={run.get('status')!r}"
        )

    # ── 4. Verify all steps completed in order ─────────────────────────────────
    assert "load_eligible" in seen_steps, (
        f"Step 'load_eligible' was never observed running/completed; seen={seen_steps}"
    )
    steps_by_name = {s["name"]: s for s in run["steps"]}
    for step_name in STEPS_ORDER:
        assert step_name in steps_by_name, (
            f"Step {step_name!r} missing from completed run; present={list(steps_by_name)}"
        )
        assert steps_by_name[step_name]["status"] == "completed", (
            f"Step {step_name!r} not completed: {steps_by_name[step_name]}"
        )

    assert run.get("completed_at") is not None, "completed_at must be set on completed run"

    # ── 5. Verify real Databricks run (AC2: 1:1 cross-check) ──────────────────
    summary = run.get("summary_stats")
    assert summary is not None, (
        f"summary_stats is None on completed run {run_id!r} — real run expected to populate it"
    )
    total_hh = summary.get("total_households")
    assert total_hh is not None and total_hh > 0, (
        f"summary_stats.total_households={total_hh!r} — expected > 0 for a real weighting result"
    )
    print(
        f"\n[JAA-570] COMPLETED  run_id={run_id!r}  country={COUNTRY!r}  period={PERIOD}"
        f"\n          summary: total_households={total_hh}"
        f"  mean_weight={summary.get('mean_weight')}"
    )
    print(
        f"[JAA-570] Cross-check (AC2): databricks jobs list-runs --job-name pesaje_{COUNTRY}"
        f" | look for run matching run_id={run_id!r} or started_at≈{run.get('started_at')!r}"
    )

    # ── 6. Download the real artifact (AC3) ────────────────────────────────────
    resp = client.get(f"/weighting/runs/{run_id}/download", timeout=120.0)
    assert resp.status_code == 200, (
        f"GET /weighting/runs/{run_id}/download failed ({resp.status_code}): {resp.text[:200]}"
    )
    content_type = resp.headers.get("content-type", "")
    assert "text/csv" in content_type, (
        f"Expected text/csv content-type, got: {content_type!r}"
    )

    csv_text = resp.text
    assert csv_text.strip(), f"Downloaded CSV is empty for run {run_id!r}"

    lines = [ln for ln in csv_text.split("\n") if ln.strip()]
    assert len(lines) >= 2, f"CSV has fewer than 2 lines (header + 1 data row): {len(lines)} lines"

    header_cols = {col.strip() for col in lines[0].split(",")}
    assert EXPECTED_CSV_COLS.issubset(header_cols), (
        f"CSV header missing expected gold columns. "
        f"Expected subset {EXPECTED_CSV_COLS}, got: {header_cols}"
    )

    row_count = len(lines) - 1
    assert row_count > 0, f"CSV has header but no data rows for run {run_id!r}"

    print(
        f"[JAA-570] Downloaded CSV: {row_count} rows  header={lines[0][:120]}"
        f"\n=== JAA-570 E2E PASS: run_id={run_id!r}  country={COUNTRY!r}"
        f"  period={PERIOD}  households={total_hh}  rows={row_count} ==="
    )
