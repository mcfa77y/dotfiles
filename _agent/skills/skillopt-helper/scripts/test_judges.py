#!/usr/bin/env python3
# /// script
# dependencies = [
#   "skillopt @ git+https://github.com/microsoft/SkillOpt",
# ]
# ///
"""Verify rule judge checks and benchmark scoring offline (0 LLM cost).

Usage:
    uv run test_judges.py [--tasks-file tasks.json]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from skillopt_sleep.judges import score_rule_judge, validate_checks

DEFAULT_TASKS_FILE = os.path.join(os.path.dirname(__file__), "pr_helper_eval_tasks.json")

def main():
    parser = argparse.ArgumentParser(description="Test and verify benchmark judge rules.")
    parser.add_argument("--tasks-file", default=DEFAULT_TASKS_FILE, help="Path to tasks.json")
    args = parser.parse_args()

    if not os.path.exists(args.tasks_file):
        print(f"Error: {args.tasks_file} not found.")
        sys.exit(1)

    with open(args.tasks_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    tasks = data.get("tasks", [])
    print(f"Loaded {len(tasks)} benchmark tasks from {args.tasks_file}\n")

    passed_all = True
    for task in tasks:
        task_id = task["id"]
        judge = task.get("judge", {})
        ref = task.get("reference", "")

        errors, warnings = validate_checks(judge)
        if errors:
            print(f"❌ [{task_id}] Judge syntax errors: {errors}")
            passed_all = False
            continue
        if warnings:
            print(f"⚠️  [{task_id}] Warnings: {warnings}")

        # Golden Case
        hard, soft, rationale = score_rule_judge(judge, ref)
        status = "✅ PASS" if hard == 1.0 else "❌ FAIL"
        if hard < 1.0:
            passed_all = False
        print(f"{status} [{task_id}] Golden reference score: hard={hard:.2f}, soft={soft:.2f}")
        if hard < 1.0:
            print(f"   Rationale: {rationale}")

        # Negative Check
        bad_output = ref.replace("Detailed Description\n--------------------", "## Detailed Description")
        bad_hard, bad_soft, bad_rationale = score_rule_judge(judge, bad_output)
        neg_status = "✅ CORRECTLY CAUGHT" if bad_hard < 1.0 else "❌ MISSED FAILURE"
        if bad_hard == 1.0:
            passed_all = False
        print(f"   Negative check (ATX header): {neg_status} -> {bad_rationale}\n")

    sys.exit(0 if passed_all else 1)

if __name__ == "__main__":
    main()
