#!/usr/bin/env python3
# /// script
# dependencies = []
# ///
"""Safely inspects and updates the user's crontab with the nightly SkillOpt consolidation job."""

import argparse
import subprocess
import sys

CRON_COMMENT = "# Nightly SkillOpt consolidation across RHL agent skills (2:00 AM)"
CRON_JOB = "0 2 * * * uv run /Users/joe/dotfiles/_agent/skills/skillopt-helper/scripts/nightly_runner.py >> /Users/joe/.skillopt/logs/cron.log 2>&1"
REQUIRED_PATH = "/Users/joe/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"


def get_current_crontab() -> str:
    proc = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    if proc.returncode != 0:
        return ""
    return proc.stdout


def clean_skillopt_lines(lines: list[str]) -> list[str]:
    cleaned = []
    for line in lines:
        if (
            "nightly_runner.py" in line
            or "rhl_skillopt" in line
            or "Nightly SkillOpt consolidation" in line
        ):
            continue
        cleaned.append(line)
    # Collapse multiple blank lines
    result = []
    prev_blank = False
    for line in cleaned:
        is_blank = not line.strip()
        if is_blank and prev_blank:
            continue
        result.append(line)
        prev_blank = is_blank
    return result


def status_cron() -> int:
    crontab = get_current_crontab()
    installed = "nightly_runner.py" in crontab or "rhl_skillopt" in crontab
    print(f"SkillOpt Cron Status: {'INSTALLED' if installed else 'NOT INSTALLED'}")
    print("=" * 60)
    print(crontab if crontab else "(no crontab)")
    print("=" * 60)
    return 0


def uninstall_cron() -> int:
    current = get_current_crontab().strip()
    if not current:
        print("No crontab found; nothing to uninstall.")
        return 0
    cleaned = clean_skillopt_lines(current.splitlines())
    new_crontab = "\n".join(cleaned).strip() + "\n" if cleaned else ""
    if not new_crontab.strip():
        proc = subprocess.run(["crontab", "-r"], capture_output=True, text=True)
    else:
        proc = subprocess.run(["crontab", "-"], input=new_crontab, text=True, capture_output=True)
    if proc.returncode != 0:
        print(f"Error removing crontab entry: {proc.stderr}", file=sys.stderr)
        return 1
    print("Successfully removed SkillOpt cron job.")
    return 0


def install_cron() -> int:
    current = get_current_crontab().strip()
    lines = current.splitlines() if current else []

    cleaned = clean_skillopt_lines(lines)

    new_lines = []
    has_path = False
    for line in cleaned:
        if line.startswith("PATH="):
            new_lines.append(f"PATH={REQUIRED_PATH}")
            has_path = True
        else:
            new_lines.append(line)

    if not has_path:
        new_lines.insert(0, f"PATH={REQUIRED_PATH}")

    new_lines.append(f"\n{CRON_COMMENT}")
    new_lines.append(CRON_JOB)

    new_crontab = "\n".join(new_lines).strip() + "\n"
    proc = subprocess.run(["crontab", "-"], input=new_crontab, text=True, capture_output=True)
    if proc.returncode != 0:
        print(f"Error setting crontab: {proc.stderr}", file=sys.stderr)
        return 1

    print("Crontab successfully updated:")
    print("=" * 60)
    print(new_crontab)
    print("=" * 60)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect or configure SkillOpt nightly crontab.")
    parser.add_argument(
        "--status", action="store_true", help="Show current crontab and SkillOpt status"
    )
    parser.add_argument(
        "--uninstall", action="store_true", help="Remove SkillOpt job from crontab"
    )
    parser.add_argument(
        "--install", action="store_true", default=False, help="Install SkillOpt job into crontab"
    )
    args = parser.parse_args()

    if args.status:
        return status_cron()
    if args.uninstall:
        return uninstall_cron()
    # Default to install if no action specified or if --install passed
    return install_cron()


if __name__ == "__main__":
    sys.exit(main())
