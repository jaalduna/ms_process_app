"""Unit tests for register_weighting_jobs.py.

All subprocess and HTTP calls are mocked — no live Databricks or API access needed.
"""

import importlib.util
import json
import sys
from pathlib import Path
from subprocess import CalledProcessError
from unittest.mock import MagicMock, patch, call

import pytest

# Load the script as a module from its path so it is importable without
# installing it as a package.
_SCRIPT = Path(__file__).parent.parent / "register_weighting_jobs.py"
spec = importlib.util.spec_from_file_location("register_weighting_jobs", _SCRIPT)
rwj = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rwj)

COUNTRIES = rwj.COUNTRIES
PROCESS = rwj.PROCESS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_bundle_summary(country_ids: dict[str, int]) -> str:
    """Build a fake databricks bundle summary JSON for the given countries."""
    jobs = {}
    for country, job_id in country_ids.items():
        jobs[f"{PROCESS}_{country}"] = {"id": str(job_id), "name": f"[prod] {PROCESS}_{country}"}
    return json.dumps({"resources": {"jobs": jobs}})


# ---------------------------------------------------------------------------
# get_bundle_job_ids
# ---------------------------------------------------------------------------

def test_get_bundle_job_ids_all_countries():
    expected = {c: 100 + i for i, c in enumerate(COUNTRIES)}
    summary_json = _make_bundle_summary(expected)

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout=summary_json, returncode=0)
        result = rwj.get_bundle_job_ids(Path("/fake/bundle"), target="prod")

    assert result == expected


def test_get_bundle_job_ids_partial_countries():
    """Only some countries deployed — returns those, omits the rest."""
    partial = {"chile": 111111, "mexico": 222222}
    summary_json = _make_bundle_summary(partial)

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout=summary_json, returncode=0)
        result = rwj.get_bundle_job_ids(Path("/fake/bundle"), target="prod")

    assert result == partial


def test_get_bundle_job_ids_job_id_as_string():
    """Databricks returns IDs as strings; script must coerce to int."""
    summary_json = json.dumps({
        "resources": {"jobs": {"pesaje_chile": {"id": "987654321"}}}
    })

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout=summary_json, returncode=0)
        result = rwj.get_bundle_job_ids(Path("/fake/bundle"), target="prod")

    assert result["chile"] == 987654321
    assert isinstance(result["chile"], int)


def test_get_bundle_job_ids_passes_profile():
    """--profile flag is forwarded to the CLI command."""
    summary_json = _make_bundle_summary({"chile": 555})

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout=summary_json, returncode=0)
        rwj.get_bundle_job_ids(Path("/fake/bundle"), target="prod", profile="prd")

    cmd = mock_run.call_args[0][0]
    assert "--profile" in cmd
    assert "prd" in cmd


def test_get_bundle_job_ids_empty_bundle():
    """Bundle with no pesaje jobs returns empty dict."""
    summary_json = json.dumps({"resources": {"jobs": {}}})

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout=summary_json, returncode=0)
        result = rwj.get_bundle_job_ids(Path("/fake/bundle"), target="prod")

    assert result == {}


def test_get_bundle_job_ids_propagates_subprocess_error():
    """CalledProcessError from subprocess (e.g. auth failure) propagates."""
    with patch("subprocess.run") as mock_run:
        mock_run.side_effect = CalledProcessError(1, "databricks")
        with pytest.raises(CalledProcessError):
            rwj.get_bundle_job_ids(Path("/fake/bundle"), target="prod")


# ---------------------------------------------------------------------------
# register_jobs
# ---------------------------------------------------------------------------

def test_register_jobs_puts_all_countries():
    country_ids = {c: 1000 + i for i, c in enumerate(COUNTRIES)}

    with patch("requests.put") as mock_put:
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_put.return_value = mock_resp

        rwj.register_jobs(country_ids, "http://localhost:8000/api/v1")

    assert mock_put.call_count == len(COUNTRIES)
    for country in COUNTRIES:
        url = f"http://localhost:8000/api/v1/admin/jobs/{PROCESS}/{country}"
        mock_put.assert_any_call(url, json={"job_id": country_ids[country]}, timeout=30)


def test_register_jobs_skips_missing_countries():
    """Countries not in country_ids are silently skipped."""
    country_ids = {"chile": 111, "mexico": 222}

    with patch("requests.put") as mock_put:
        mock_resp = MagicMock()
        mock_resp.raise_for_status.return_value = None
        mock_put.return_value = mock_resp

        rwj.register_jobs(country_ids, "http://localhost:8000/api/v1")

    assert mock_put.call_count == 2


def test_register_jobs_raises_on_http_error():
    """HTTP 4xx/5xx raises (no silent swallowing)."""
    country_ids = {"chile": 111}

    with patch("requests.put") as mock_put:
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = Exception("HTTP 403")
        mock_put.return_value = mock_resp

        with pytest.raises(Exception, match="HTTP 403"):
            rwj.register_jobs(country_ids, "http://localhost:8000/api/v1")


# ---------------------------------------------------------------------------
# dry-run
# ---------------------------------------------------------------------------

def test_dry_run_no_http(capsys):
    country_ids = {"chile": 12345, "mexico": 67890}

    with patch("requests.put") as mock_put:
        rwj.register_jobs(country_ids, "http://localhost:8000/api/v1", dry_run=True)
        assert mock_put.call_count == 0

    out = capsys.readouterr().out
    assert "[dry-run]" in out
    assert "chile" in out
    assert "mexico" in out


def test_dry_run_prints_correct_url(capsys):
    country_ids = {"argentina": 99999}
    rwj.register_jobs(country_ids, "http://api.test/api/v1", dry_run=True)
    out = capsys.readouterr().out
    assert f"http://api.test/api/v1/admin/jobs/{PROCESS}/argentina" in out


# ---------------------------------------------------------------------------
# constants
# ---------------------------------------------------------------------------

def test_countries_constant_has_nine_entries():
    assert len(COUNTRIES) == 9


def test_process_constant_is_pesaje():
    assert PROCESS == "pesaje"


def test_all_expected_countries_present():
    expected = {"argentina", "bolivia", "brasil", "cam", "chile", "colombia", "ecuador", "mexico", "peru"}
    assert set(COUNTRIES) == expected
