#!/usr/bin/env python3
# /// script
# dependencies = [
#   "pyyaml",
#   "skillopt @ git+https://github.com/microsoft/SkillOpt",
# ]
# ///
"""Nightly automated runner for SkillOpt consolidation across all RHL agent skills.

Designed to be executed via crontab every night.
Harvests sessions from the past 24 hours, tests against held-out validation gates,
and stages improvements for review without breaking changes.
"""
from __future__ import annotations

import argparse
import datetime
import os
import subprocess
import sys

LOGS_DIR = os.path.expanduser("~/.skillopt/logs")
RHL_SCRIPT = "/Users/joe/dotfiles/_agent/skills/skillopt-helper/scripts/rhl_skillopt.py"

def main():
    parser = argparse.ArgumentParser(description="Nightly SkillOpt consolidation for RHL skills.")
    parser.add_argument("--backend", default="agy", choices=["agy", "omp", "mock"], help="Backend LLM engine (default: agy)")
    parser.add_argument("--source", default="agy", choices=["agy", "omp"], help="Session harvest source (default: agy)")
    parser.add_argument("--lookback-hours", type=int, default=24, help="Hours of session history to harvest (default: 24)")
    parser.add_argument("--dry-run", action="store_true", help="Perform a dry run without staging changes")
    parser.add_argument("--auto-adopt", action="store_true", help="Automatically adopt changes that pass validation")
    args = parser.parse_args()

    os.makedirs(LOGS_DIR, exist_ok=True)
    today = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    log_file = os.path.join(LOGS_DIR, f"nightly_{today}.log")

    cmd = [
        "uv", "run", RHL_SCRIPT,
        "dry-run" if args.dry_run else "run",
        "--backend", args.backend,
        "--source", args.source,
        "--lookback-hours", str(args.lookback_hours),
    ]

    print(f"[{datetime.datetime.now().isoformat()}] Starting nightly SkillOpt consolidation...")
    print(f"Log output: {log_file}")
    print(f"Executing: {' '.join(cmd)}")

    with open(log_file, "w", encoding="utf-8") as f:
        f.write(f"=== Nightly SkillOpt Run: {today} ===\n")
        f.write(f"Command: {' '.join(cmd)}\n\n")
        f.flush()

        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
        )
        f.write(proc.stdout)
        f.write(f"\nExit Code: {proc.returncode}\n")

    print(proc.stdout)

    if proc.returncode == 0:
        print(f"[{datetime.datetime.now().isoformat()}] Nightly SkillOpt completed successfully.")
        if args.auto_adopt:
            print("Auto-adopt enabled: adopting staged proposals...")
            adopt_cmd = ["uv", "run", RHL_SCRIPT, "adopt", "--all"]
            subprocess.run(adopt_cmd)
    else:
        print(f"[{datetime.datetime.now().isoformat()}] Nightly SkillOpt exited with code {proc.returncode}. See log: {log_file}")

    return proc.returncode

if __name__ == "__main__":
    sys.exit(main())
