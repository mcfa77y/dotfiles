#!/usr/bin/env python3
"""
Fetch and parse logs for failed jobs in a GitHub Actions workflow run.
Works even while the workflow run is still in progress.

Usage:
    python3 fetch_failed_logs.py --run-id 35910923024
    python3 fetch_failed_logs.py --run-id "https://github.com/EmpoHealth/core/actions/runs/35910923024/job/107357575748?pr=2754"
    python3 fetch_failed_logs.py --job-id 107357575748
    python3 fetch_failed_logs.py --run-id 35910923024 --download-artifacts
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

DEFAULT_REPO = "EmpoHealth/core"


def run_cmd(cmd: List[str], check: bool = True) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=check,
        )
    except subprocess.CalledProcessError as e:
        print(f"Error running {' '.join(cmd)}: {e.stderr.strip()}", file=sys.stderr)
        raise


def run_gh_api(endpoint: str, paginate: bool = False, raw: bool = False) -> Any:
    cmd = ["gh", "api"]
    if paginate:
        cmd.append("--paginate")
    if raw:
        cmd.append("--allow-escape-sequences")
    cmd.append(endpoint)

    res = run_cmd(cmd, check=True)
    if raw:
        return res.stdout

    output = res.stdout.strip()
    if not output:
        return {}

    try:
        return json.loads(output)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        items = []
        pos = 0
        while pos < len(output):
            output_slice = output[pos:].lstrip()
            if not output_slice:
                break
            obj, consumed = decoder.raw_decode(output_slice)
            items.append(obj)
            pos += (len(output[pos:]) - len(output_slice)) + consumed
        return items


def parse_url_or_id(input_str: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Parses a string that could be a full URL, run ID, or job ID.
    Returns (repo, run_id, job_id).
    """
    repo = None
    run_id = None
    job_id = None

    if "github.com" in input_str:
        parsed = urlparse(input_str)
        parts = [p for p in parsed.path.split("/") if p]
        # Format: /<owner>/<repo>/actions/runs/<run_id>(/job/<job_id>)?
        if len(parts) >= 2:
            repo = f"{parts[0]}/{parts[1]}"
        if "runs" in parts:
            idx = parts.index("runs")
            if idx + 1 < len(parts):
                run_id = parts[idx + 1]
        if "job" in parts:
            idx = parts.index("job")
            if idx + 1 < len(parts):
                job_id = parts[idx + 1]
    elif input_str.isdigit():
        run_id = input_str

    return repo, run_id, job_id


def sanitize_filename(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_\-\.]", "_", name).strip("_")


def strip_ansi(text: str) -> str:
    ansi_regex = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
    return ansi_regex.sub("", text)


def extract_playwright_errors(log_text: str) -> List[Dict[str, str]]:
    """
    Extracts failed Playwright test cases and assertion messages from raw log text.
    """
    errors: List[Dict[str, str]] = []
    clean_text = strip_ansi(log_text)

    # Strip timestamps from each line for clean multi-line matching
    no_ts = re.sub(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*", "", clean_text, flags=re.MULTILINE)

    # 1. Match failed test headers in Playwright summary:
    # e.g. "  1) sources/tests/regression/enrollment-pending.test.ts:176:2 › Enrollment Pending Feature Suite ... › [RHLQA-330] ..."
    # or "  ✘  1 [chromium] › sources/tests/...:176:2 › Title"
    test_pattern = re.compile(
        r"(?:✘|\d+\))\s+([^\s›]+(?:\.test|\.spec)\.ts:\d+:\d+)\s+›\s+([^\n]+)",
        re.MULTILINE,
    )

    matches = list(test_pattern.finditer(no_ts))
    if matches:
        for idx, m in enumerate(matches):
            location = m.group(1).strip()
            title = m.group(2).strip()
            start_pos = m.end()
            end_pos = matches[idx + 1].start() if idx + 1 < len(matches) else min(len(no_ts), start_pos + 4000)
            test_section = no_ts[start_pos:end_pos]

            # Look for Error: ... block up to stack trace / divider
            err_m = re.search(
                r"^\s*(Error:[\s\S]+?)(?=\n\s*(?:at\s+|\d+\s*\|\s*|───|\n\n|$))",
                test_section,
                re.MULTILINE,
            )
            message = err_m.group(1).strip() if err_m else "Assertion or step failed."

            errors.append({
                "location": location,
                "title": title,
                "message": message[:800],
            })
    else:
        # Fallback: search for explicit Error: lines in step output
        error_lines = []
        for line in no_ts.splitlines():
            line_stripped = line.strip()
            if line_stripped.startswith("Error:") or line_stripped.startswith("##[error]"):
                error_lines.append(line_stripped)
        if error_lines:
            errors.append({
                "location": "unknown",
                "title": "General Step Failure",
                "message": "\n".join(error_lines[:4]),
            })

    return errors


def fetch_all_jobs(repo: str, run_id: str, attempt: Optional[int] = None) -> List[Dict[str, Any]]:
    if attempt:
        endpoint = f"repos/{repo}/actions/runs/{run_id}/attempts/{attempt}/jobs"
    else:
        endpoint = f"repos/{repo}/actions/runs/{run_id}/jobs"
    data = run_gh_api(endpoint, paginate=True)
    if isinstance(data, dict) and "jobs" in data:
        return data["jobs"]
    elif isinstance(data, list):
        jobs = []
        for item in data:
            if isinstance(item, dict) and "jobs" in item:
                jobs.extend(item["jobs"])
            elif isinstance(item, dict):
                jobs.append(item)
        return jobs
    return []


def main():
    parser = argparse.ArgumentParser(
        description="Fetch and parse logs for failed jobs in a GitHub Actions workflow run."
    )
    parser.add_argument(
        "--run-id",
        help="Run ID or full GitHub Actions URL (e.g. https://github.com/EmpoHealth/core/actions/runs/35910923024)",
    )
    parser.add_argument(
        "--job-id",
        help="Optional specific job ID to fetch",
    )
    parser.add_argument(
        "--attempt",
        type=int,
        help="Optional specific run attempt number (defaults to latest attempt)",
    )
    parser.add_argument(
        "--repo",
        default=DEFAULT_REPO,
        help=f"Target GitHub repository (default: {DEFAULT_REPO})",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        help="Directory to save downloaded log files (default: /tmp/gh-logs-<RUN_ID>)",
    )
    parser.add_argument(
        "--download-artifacts",
        action="store_true",
        help="Download and extract qa-pr-report artifacts for failed jobs",
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Only display failure summaries without writing full log files to disk",
    )

    args = parser.parse_args()

    target_repo = args.repo
    target_run_id = args.run_id
    target_job_id = args.job_id

    if target_run_id:
        url_repo, url_run, url_job = parse_url_or_id(target_run_id)
        if url_repo:
            target_repo = url_repo
        if url_run:
            target_run_id = url_run
        if url_job and not target_job_id:
            target_job_id = url_job

    if not target_run_id and not target_job_id:
        parser.error("Must provide either --run-id or --job-id")

    # If only job-id is provided, fetch job info to get run_id
    if target_job_id and not target_run_id:
        job_info = run_gh_api(f"repos/{target_repo}/actions/jobs/{target_job_id}")
        target_run_id = str(job_info.get("run_id", ""))

    print(f"Target Repository: {target_repo}")
    print(f"Target Run ID:     {target_run_id}")
    if target_job_id:
        print(f"Target Job ID:     {target_job_id}")

    output_dir = Path(args.output_dir or f"/tmp/gh-logs-{target_run_id}")
    if not args.summary_only:
        output_dir.mkdir(parents=True, exist_ok=True)
        print(f"Output Directory:  {output_dir}")

    # Determine jobs to inspect
    if target_job_id and not target_run_id:
        job_info = run_gh_api(f"repos/{target_repo}/actions/jobs/{target_job_id}")
        failed_jobs = [job_info]
        all_jobs_count = 1
    elif target_job_id and target_run_id and not args.run_id:
        job_info = run_gh_api(f"repos/{target_repo}/actions/jobs/{target_job_id}")
        failed_jobs = [job_info]
        all_jobs_count = 1
    else:
        all_jobs = fetch_all_jobs(target_repo, target_run_id, attempt=args.attempt)
        all_jobs_count = len(all_jobs)
        if target_job_id:
            failed_jobs = [j for j in all_jobs if str(j.get("id")) == str(target_job_id)]
            if not failed_jobs:
                # Direct fetch fallback
                job_info = run_gh_api(f"repos/{target_repo}/actions/jobs/{target_job_id}")
                failed_jobs = [job_info]
        else:
            failed_jobs = [j for j in all_jobs if j.get("conclusion") == "failure"]

    print(f"\nTotal jobs considered: {all_jobs_count}")
    print(f"Target jobs to inspect: {len(failed_jobs)}")

    if not failed_jobs:
        print("\nNo failed jobs found.")
        return 0

    print("\n" + "=" * 80)
    print("FAILED JOBS SUMMARY")
    print("=" * 80)

    for job in failed_jobs:
        job_id = str(job.get("id"))
        job_name = job.get("name", "Unknown Job")
        failing_step = "Unknown Step"
        for step in job.get("steps", []):
            if step.get("conclusion") == "failure":
                failing_step = step.get("name", failing_step)
                break

        print(f"\n▶ [{job_id}] {job_name}")
        print(f"  Failing Step: {failing_step}")

        try:
            raw_log = run_gh_api(f"repos/{target_repo}/actions/jobs/{job_id}/logs", raw=True)
        except Exception as e:
            print(f"  Failed to fetch log: {e}")
            continue

        if not args.summary_only:
            log_filename = f"{sanitize_filename(job_name)}-{job_id}.log"
            log_path = output_dir / log_filename
            with open(log_path, "w", encoding="utf-8") as f:
                f.write(raw_log)
            print(f"  Saved log:    {log_path}")

        pw_errors = extract_playwright_errors(raw_log)
        if pw_errors:
            print("  Extracted Failures:")
            for err in pw_errors:
                print(f"    - Test:     {err['title']}")
                print(f"      Location: {err['location']}")
                indented_msg = "\n        ".join(err["message"].splitlines()[:6])
                print(f"      Details:\n        {indented_msg}")
        else:
            print("  No Playwright-specific failure blocks detected (check raw log).")

    if args.download_artifacts and not args.summary_only:
        print("\n" + "=" * 80)
        print("DOWNLOADING ARTIFACTS")
        print("=" * 80)
        artifacts_data = run_gh_api(f"repos/{target_repo}/actions/runs/{target_run_id}/artifacts")
        artifacts = artifacts_data.get("artifacts", []) if isinstance(artifacts_data, dict) else []

        artifacts_dir = output_dir / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)

        for art in artifacts:
            art_name = art.get("name", "")
            art_id = art.get("id")
            if "qa-pr-report" in art_name or "report" in art_name:
                print(f"Downloading artifact: {art_name} (ID: {art_id})...")
                art_target = artifacts_dir / art_name
                art_target.mkdir(parents=True, exist_ok=True)
                cmd = [
                    "gh", "run", "download", target_run_id,
                    "--name", art_name,
                    "--dir", str(art_target),
                    "--repo", target_repo,
                ]
                run_cmd(cmd, check=False)

        print(f"Artifacts saved to: {artifacts_dir}")

    print("\n" + "=" * 80)
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
