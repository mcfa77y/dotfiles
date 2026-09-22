#!/usr/bin/env python3
# /// script
# dependencies = []
# ///
"""Safely inspects and updates the user's crontab with the nightly SkillOpt consolidation job."""
import subprocess
import sys

CRON_JOB = "0 2 * * * uv run /Users/joe/dotfiles/_agent/skills/skillopt-helper/scripts/nightly_runner.py >> /Users/joe/.skillopt/logs/cron.log 2>&1"
REQUIRED_PATH = "/Users/joe/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

def get_current_crontab() -> str:
    proc = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    if proc.returncode != 0:
        return ""
    return proc.stdout

def install_cron():
    current = get_current_crontab().strip()
    lines = current.splitlines() if current else []

    # Filter out existing skillopt entries or old PATH lines
    new_lines = []
    has_path = False
    for line in lines:
        if "nightly_runner.py" in line or "rhl_skillopt" in line:
            continue
        if line.startswith("PATH="):
            # Replace PATH with comprehensive PATH
            new_lines.append(f"PATH={REQUIRED_PATH}")
            has_path = True
        else:
            new_lines.append(line)

    if not has_path:
        new_lines.insert(0, f"PATH={REQUIRED_PATH}")

    # Add the nightly SkillOpt job
    new_lines.append(f"\n# Nightly SkillOpt consolidation across RHL agent skills (2:00 AM)")
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

if __name__ == "__main__":
    sys.exit(install_cron())
