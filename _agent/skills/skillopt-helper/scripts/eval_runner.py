#!/usr/bin/env python3
# /// script
# dependencies = [
#   "skillopt @ git+https://github.com/microsoft/SkillOpt",
# ]
# ///
"""SkillOpt Evaluation & Evolution Runner.

Executes SkillOpt-Sleep consolidation loops, benchmarks, and validation gates
for agent skills across various agent backends (mock, claude, codex, pi, etc.).

Usage:
    uv run eval_runner.py [--backend mock|claude|codex|pi] [--dry-run|--run] [--skill-path /path/to/SKILL.md]
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys

DEFAULT_SKILL_PATH = "/Users/joe/.gemini/config/skills/empo-pr-helper/SKILL.md"
DEFAULT_TASKS_FILE = os.path.join(os.path.dirname(__file__), "pr_helper_eval_tasks.json")
DEFAULT_PROJECT = "/Users/joe/Projects/empo_health/remote-health-link"

def run_eval(
    skill_path: str = DEFAULT_SKILL_PATH,
    tasks_file: str | None = None,
    project_dir: str = DEFAULT_PROJECT,
    backend: str = "mock",
    dry_run: bool = True,
    source: str = "auto",
    lookback_hours: int = 0,
    model: str | None = None,
    preferences: str | None = None,
    json_output: bool = False,
) -> int:
    cmd = [
        "skillopt-sleep",
        "dry-run" if dry_run else "run",
        "--backend", backend,
        "--target-skill-path", skill_path,
        "--project", project_dir,
        "--progress",
    ]

    if tasks_file and os.path.exists(tasks_file):
        cmd.extend(["--tasks-file", tasks_file])
    else:
        cmd.extend(["--source", source, "--lookback-hours", str(lookback_hours)])

    if model:
        cmd.extend(["--model", model])
    if preferences:
        cmd.extend(["--preferences", preferences])
    if json_output:
        cmd.append("--json")

    print("=" * 60)
    print("SkillOpt Evaluation Runner")
    print("=" * 60)
    print(f"Target Skill : {skill_path}")
    print(f"Tasks Source : {tasks_file if tasks_file else f'Sessions ({source}, lookback: {lookback_hours}h)'}")
    print(f"Project Dir  : {project_dir}")
    print(f"Backend      : {backend}")
    print(f"Mode         : {'Dry Run (Report Only)' if dry_run else 'Live Run (Stage Proposal)'}")
    print(f"Command      : {' '.join(cmd)}")
    print("=" * 60)
    print()

    proc = subprocess.run(cmd)
    return proc.returncode

def main():
    parser = argparse.ArgumentParser(description="SkillOpt Skill Evaluation & Evolution Runner.")
    parser.add_argument("--skill-path", default=DEFAULT_SKILL_PATH, help="Path to target SKILL.md")
    parser.add_argument("--tasks-file", default=DEFAULT_TASKS_FILE, help="Path to tasks.json benchmark file (optional)")
    parser.add_argument("--project", default=DEFAULT_PROJECT, help="Associated project directory")
    parser.add_argument("--backend", default="mock", choices=["mock", "claude", "codex", "copilot", "cursor", "pi", "opencode", "handoff", "azure_openai"], help="Evaluation backend")
    parser.add_argument("--source", default="auto", choices=["auto", "pi", "claude", "codex", "copilot", "cursor", "opencode"], help="Session harvest source if no tasks-file")
    parser.add_argument("--lookback-hours", type=int, default=0, help="Session lookback hours (0 = all history)")
    parser.add_argument("--run", action="store_true", help="Perform live run to stage proposal (default is dry-run)")
    parser.add_argument("--model", default=None, help="Model override for the backend")
    parser.add_argument("--preferences", default=None, help="Additional optimization preferences/guidelines")
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")

    args = parser.parse_args()

    # If default tasks file is requested but missing, generate it
    if args.tasks_file == DEFAULT_TASKS_FILE and not os.path.exists(DEFAULT_TASKS_FILE):
        print(f"Generating default benchmark tasks file: {DEFAULT_TASKS_FILE}...")
        gen_script = os.path.join(os.path.dirname(__file__), "generate_pr_tasks.py")
        subprocess.run([sys.executable, gen_script, "--output", DEFAULT_TASKS_FILE, "--skill-path", args.skill_path], check=True)

    tasks_file = args.tasks_file if os.path.exists(args.tasks_file) else None

    rc = run_eval(
        skill_path=args.skill_path,
        tasks_file=tasks_file,
        project_dir=args.project,
        backend=args.backend,
        dry_run=not args.run,
        source=args.source,
        lookback_hours=args.lookback_hours,
        model=args.model,
        preferences=args.preferences,
        json_output=args.json,
    )
    sys.exit(rc)

if __name__ == "__main__":
    main()
