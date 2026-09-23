#!/usr/bin/env python3
# /// script
# dependencies = [
#   "skillopt @ git+https://github.com/microsoft/SkillOpt",
# ]
# ///
"""Generate a SkillOpt tasks.json benchmark for PR creation and formatting rules.

Usage:
    uv run generate_pr_tasks.py [--output tasks.json] [--skill-path /path/to/SKILL.md]
"""
from __future__ import annotations

import argparse
import json
import os
import sys

DEFAULT_SKILL_PATH = "/Users/joe/.gemini/config/skills/rhl-pr-helper/SKILL.md"
DEFAULT_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "pr_helper_eval_tasks.json")

def build_pr_tasks(project_dir: str, skill_path: str) -> dict:
    tasks = [
        {
            "id": "pr-task-feat-single-ticket",
            "project": project_dir,
            "intent": "Generate a compliant PR title and body for adding heart-rate telemetry streaming to the RHL backend. Ticket: RHL-4100.",
            "context_excerpt": "Feature branch adding WebSocket streaming for heart rate telemetry.",
            "system": "",
            "attempted_solution": "",
            "outcome": "",
            "reference_kind": "spec",
            "reference": "feat: add heart-rate telemetry streaming endpoint\n\nDetailed Description\n--------------------\n\nStreams real-time heart rate telemetry over WebSocket connection.\n\nRelevant Linear Tickets\n-----------------------\n\nThis change contributes to RHL-4100.\n\nReviews and Merging\n-------------------\n",
            "judge": {
                "checks": [
                    {"op": "contains", "arg": "Detailed Description\n--------------------"},
                    {"op": "contains", "arg": "Relevant Linear Tickets\n-----------------------"},
                    {"op": "contains", "arg": "Reviews and Merging\n-------------------"},
                    {"op": "contains", "arg": "This change contributes to RHL-4100."},
                    {"op": "regex", "arg": r"(?m)^feat: .+"},
                    {"op": "not_contains", "arg": "## Detailed Description"},
                    {"op": "not_contains", "arg": "### Reviews and Merging"},
                ]
            },
            "tags": ["pr-format", "setext", "tickets"],
            "source_sessions": [],
            "split": "train",
            "origin": "synthetic",
            "derived_from": "rhl-pr-helper",
            "skill_hint": "rhl-pr-helper",
        },
        {
            "id": "pr-task-fix-multi-tickets",
            "project": project_dir,
            "intent": "Format a PR for fixing the OAuth token refresh bug when network drops. Tickets: RHL-5201, FP-1044.",
            "context_excerpt": "Fixing silent failure on token refresh retry loop.",
            "system": "",
            "attempted_solution": "",
            "outcome": "",
            "reference_kind": "spec",
            "reference": "fix: retry OAuth token refresh on network drops\n\nDetailed Description\n--------------------\n\nAdds exponential backoff retry on transient token refresh failures.\n\nRelevant Linear Tickets\n-----------------------\n\nThis change contributes to RHL-5201, FP-1044.\n\nReviews and Merging\n-------------------\n",
            "judge": {
                "checks": [
                    {"op": "contains", "arg": "Detailed Description\n--------------------"},
                    {"op": "contains", "arg": "Relevant Linear Tickets\n-----------------------"},
                    {"op": "contains", "arg": "Reviews and Merging\n-------------------"},
                    {"op": "contains", "arg": "This change contributes to RHL-5201, FP-1044."},
                    {"op": "regex", "arg": r"(?m)^fix: .+"},
                    {"op": "not_contains", "arg": "## "},
                ]
            },
            "tags": ["pr-format", "multi-ticket"],
            "source_sessions": [],
            "split": "train",
            "origin": "synthetic",
            "derived_from": "rhl-pr-helper",
            "skill_hint": "rhl-pr-helper",
        },
        {
            "id": "pr-task-val-chore-deps",
            "project": project_dir,
            "intent": "Format a PR for bumping yarn packages and updating node types across all packages. Ticket: RHL-6300.",
            "context_excerpt": "Dependency maintenance bumping typescript and @types/node.",
            "system": "",
            "attempted_solution": "",
            "outcome": "",
            "reference_kind": "spec",
            "reference": "chore: bump dependencies and update node types\n\nDetailed Description\n--------------------\n\nUpgrades typescript and @types/node across root and workspaces.\n\nRelevant Linear Tickets\n-----------------------\n\nThis change contributes to RHL-6300.\n\nReviews and Merging\n-------------------\n",
            "judge": {
                "checks": [
                    {"op": "contains", "arg": "Detailed Description\n--------------------"},
                    {"op": "contains", "arg": "Relevant Linear Tickets\n-----------------------"},
                    {"op": "contains", "arg": "Reviews and Merging\n-------------------"},
                    {"op": "contains", "arg": "This change contributes to RHL-6300."},
                    {"op": "regex", "arg": r"(?m)^chore: .+"},
                    {"op": "not_contains", "arg": "## "},
                ]
            },
            "tags": ["pr-format", "held-out-validation"],
            "source_sessions": [],
            "split": "val",
            "origin": "synthetic",
            "derived_from": "rhl-pr-helper",
            "skill_hint": "rhl-pr-helper",
        },
        {
            "id": "pr-task-val-long-title-truncation",
            "project": project_dir,
            "intent": "Format a PR title and description for a complex change: 'Add automatic failover detection mechanism for primary PostgreSQL database cluster when replication lag exceeds threshold'. Ticket: RHL-7711.",
            "context_excerpt": "Ensure title is strictly <= 72 chars and does not end with a period.",
            "system": "",
            "attempted_solution": "",
            "outcome": "",
            "reference_kind": "spec",
            "reference": "feat: add automatic failover detection for PostgreSQL cluster\n\nDetailed Description\n--------------------\n\nTriggers alert and failover sequence when replication lag exceeds threshold.\n\nRelevant Linear Tickets\n-----------------------\n\nThis change contributes to RHL-7711.\n\nReviews and Merging\n-------------------\n",
            "judge": {
                "checks": [
                    {"op": "contains", "arg": "Detailed Description\n--------------------"},
                    {"op": "contains", "arg": "Relevant Linear Tickets\n-----------------------"},
                    {"op": "contains", "arg": "Reviews and Merging\n-------------------"},
                    {"op": "contains", "arg": "This change contributes to RHL-7711."},
                    {"op": "regex", "arg": r"(?m)^(feat|fix|chore|refactor): [^\n.]{10,66}$"},
                    {"op": "not_contains", "arg": "## "},
                ]
            },
            "tags": ["pr-format", "title-length", "held-out-validation"],
            "source_sessions": [],
            "split": "val",
            "origin": "synthetic",
            "derived_from": "rhl-pr-helper",
            "skill_hint": "rhl-pr-helper",
        },
    ]

    payload = {
        "format": "skillopt_sleep.tasks.v1",
        "project": project_dir,
        "transcript_source": "synthetic_benchmark",
        "n_sessions": len(tasks),
        "target_skill_path": skill_path,
        "reviewed": True,
        "tasks": tasks,
    }
    return payload

def main():
    parser = argparse.ArgumentParser(description="Generate SkillOpt PR helper benchmark tasks.")
    parser.add_argument("--output", default=DEFAULT_OUTPUT_PATH, help="Output path for tasks.json")
    parser.add_argument("--project", default="/Users/joe/Projects/empo_health/remote-health-link", help="Project dir")
    parser.add_argument("--skill-path", default=DEFAULT_SKILL_PATH, help="Path to SKILL.md")

    args = parser.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    payload = build_pr_tasks(args.project, args.skill_path)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    print(f"Generated {len(payload['tasks'])} tasks ({sum(1 for t in payload['tasks'] if t['split'] == 'train')} train, {sum(1 for t in payload['tasks'] if t['split'] == 'val')} val)")
    print(f"Saved to: {args.output}")

if __name__ == "__main__":
    main()
