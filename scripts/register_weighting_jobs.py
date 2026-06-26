#!/usr/bin/env python3
"""
Idempotent script: read KWP-pesaje prod job IDs from the Databricks bundle
summary and register them in the App Service dev via the admin API.

Prerequisites:
  - Authenticated Databricks CLI with a profile pointing to the prod workspace
    (e.g. --profile prd), or DATABRICKS_CONFIG_PROFILE=prd.
  - The App Service dev must be reachable from the host machine (VPN / IP allow-list).
  - Auth on the App Service is disabled for allow-listed IPs (AUTH_ENABLED=false).

Usage:
    python scripts/register_weighting_jobs.py
    python scripts/register_weighting_jobs.py --dry-run
    python scripts/register_weighting_jobs.py --api-url https://app-cl-prd-nmr-wp-msproc-dev.azurewebsites.net/api/v1
    python scripts/register_weighting_jobs.py --bundle-dir ~/Documents/projects/KWP-pesaje/databricks --profile prd
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import requests

COUNTRIES = [
    "argentina",
    "bolivia",
    "brasil",
    "cam",
    "chile",
    "colombia",
    "ecuador",
    "mexico",
    "peru",
]

PROCESS = "pesaje"

DEFAULT_BUNDLE_DIR = Path.home() / "Documents/projects/KWP-pesaje/databricks"
DEFAULT_API_URL = (
    "https://app-cl-prd-nmr-wp-msproc-dev.azurewebsites.net/api/v1"
)


def get_bundle_job_ids(
    bundle_dir: Path,
    target: str = "prod",
    profile: str | None = None,
) -> dict[str, int]:
    """Run databricks bundle summary and extract pesaje_<country> job IDs.

    Returns a mapping {country: job_id} for countries found in the bundle.
    Countries not deployed to the target are silently omitted (caller warns).
    """
    cmd = ["databricks", "bundle", "summary", "-t", target, "--output", "json"]
    if profile:
        cmd += ["--profile", profile]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=True,
        cwd=bundle_dir,
    )

    summary = json.loads(result.stdout)
    jobs: dict[str, dict] = summary.get("resources", {}).get("jobs", {})

    country_ids: dict[str, int] = {}
    for country in COUNTRIES:
        job_key = f"{PROCESS}_{country}"
        job = jobs.get(job_key)
        if job is None:
            continue
        raw_id = job.get("id")
        if raw_id is None:
            continue
        country_ids[country] = int(raw_id)

    return country_ids


def register_jobs(
    country_ids: dict[str, int],
    api_url: str,
    dry_run: bool = False,
) -> None:
    """PUT each country's job_id to the admin API (idempotent)."""
    base = api_url.rstrip("/")
    for country in COUNTRIES:
        job_id = country_ids.get(country)
        if job_id is None:
            continue
        url = f"{base}/admin/jobs/{PROCESS}/{country}"
        if dry_run:
            print(f"[dry-run] PUT {url}  body={{'job_id': {job_id}}}")
            continue
        resp = requests.put(url, json={"job_id": job_id}, timeout=30)
        resp.raise_for_status()
        print(f"Registered {PROCESS}/{country} -> job_id={job_id}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Register KWP-pesaje prod job IDs in the App Service admin API"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print PUT calls without executing them",
    )
    parser.add_argument(
        "--api-url",
        default=DEFAULT_API_URL,
        help="Base API URL ending in /api/v1 (default: App Service dev)",
    )
    parser.add_argument(
        "--bundle-dir",
        type=Path,
        default=DEFAULT_BUNDLE_DIR,
        help="Path to the KWP-pesaje/databricks directory containing databricks.yml",
    )
    parser.add_argument(
        "--target",
        default="prod",
        help="Databricks bundle target (default: prod)",
    )
    parser.add_argument(
        "--profile",
        default=None,
        help="Databricks CLI profile to use (e.g. prd). Required when multiple profiles match the target host.",
    )
    args = parser.parse_args()

    bundle_dir = Path(args.bundle_dir).expanduser()
    if not bundle_dir.exists():
        print(f"ERROR: bundle-dir not found: {bundle_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Reading bundle summary from {bundle_dir} (target={args.target})...")
    country_ids = get_bundle_job_ids(bundle_dir, args.target, args.profile)

    missing = [c for c in COUNTRIES if c not in country_ids]
    if missing:
        print(
            f"WARNING: no job ID found for countries: {missing}",
            file=sys.stderr,
        )

    if not country_ids:
        print(
            "No job IDs found. Is the bundle deployed to the target?",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Found {len(country_ids)}/{len(COUNTRIES)} job IDs.")
    register_jobs(country_ids, args.api_url, dry_run=args.dry_run)

    if not args.dry_run:
        print("Done. Verify with: GET /api/v1/admin/jobs")


if __name__ == "__main__":
    main()
