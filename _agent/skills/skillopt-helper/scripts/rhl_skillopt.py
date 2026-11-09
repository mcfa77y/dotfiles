#!/usr/bin/env python3
# /// script
# dependencies = [
#   "pyyaml",
#   "skillopt @ git+https://github.com/microsoft/SkillOpt",
# ]
# ///
"""SkillOpt Manager for all RHL (Remote Health Link) agent skills.

Supports oh-my-pi (omp) and Antigravity (agy) backends and transcript harvesting.

Usage:
    uv run rhl_skillopt.py list
    uv run rhl_skillopt.py audit
    uv run rhl_skillopt.py dry-run [--skill rhl-commit-push] [--backend agy|omp|mock] [--source agy|omp]
    uv run rhl_skillopt.py run [--skill rhl-commit-push] [--backend agy|omp] [--source agy|omp]
    uv run rhl_skillopt.py status
    uv run rhl_skillopt.py adopt [--skill rhl-commit-push | --all]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import yaml

from skillopt_sleep.backend import CliBackend, Backend
import skillopt_sleep.backend as backend_module
from skillopt_sleep.types import SessionDigest
from skillopt_sleep.tasks_file import load_tasks_file

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
SKILLS_ROOT = "/Users/joe/dotfiles/_agent/skills"
PROJECT_DIR = "/Users/joe/Projects/empo_health/remote-health-link"
OMP_SESSIONS_DIR = os.path.expanduser("~/.omp/agent/sessions")
AGY_BRAIN_DIR = os.path.expanduser("~/.gemini/antigravity-cli/brain")
HELP_RHL_PROJECT = "RHL project directory"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from omp_harvest import harvest_omp_sessions
except ImportError:
    from .omp_harvest import harvest_omp_sessions
class OmpBackend(CliBackend):
    name = "omp"

    def __init__(self, model: str = "", timeout: int = 180):
        super().__init__(model=model, timeout=timeout)
        self.omp_path = shutil.which("omp") or "/opt/homebrew/bin/omp"

    def _call(self, prompt: str, *, max_tokens: int = 1024) -> str:
        cmd = [self.omp_path, "-p", prompt, "--allow-home", "--no-tools", "--no-lsp"]
        if self.model:
            cmd.extend(["--model", self.model])
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=self.timeout,
        )
        out = proc.stdout.strip()
        lines = [line for line in out.splitlines() if not line.startswith(("Warning:", "Working..."))]
        return "\n".join(lines).strip()

class AgyBackend(CliBackend):
    name = "agy"

    def __init__(self, model: str = "", timeout: int = 180):
        super().__init__(model=model, timeout=timeout)
        self.agy_path = shutil.which("agy") or "/Users/joe/.local/bin/agy"

    def _call(self, prompt: str, *, max_tokens: int = 1024) -> str:
        cmd = [self.agy_path, "-p", prompt, "--dangerously-skip-permissions", "--disable-slash-commands"]
        if self.model:
            cmd.extend(["--model", self.model])
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=self.timeout,
        )
        return proc.stdout.strip()

# Patch get_backend to support 'omp' and 'agy'
_orig_get_backend = backend_module.get_backend

def patched_get_backend(name: str, **kwargs) -> Backend:
    n = (name or "").strip().lower()
    if n in {"omp", "oh-my-pi", "oh_my_pi"}:
        return OmpBackend(model=kwargs.get("model", ""))
    if n in {"agy", "antigravity"}:
        return AgyBackend(model=kwargs.get("model", ""))
    return _orig_get_backend(name, **kwargs)

backend_module.get_backend = patched_get_backend

def harvest_omp_digests(project: str = "", limit: int = 40, target_skill: str | None = None) -> list[SessionDigest]:
    return harvest_omp_sessions(OMP_SESSIONS_DIR, project=project, limit=limit, target_skill=target_skill)


def find_curated_tasks_file(skill_name: str) -> str | None:
    candidates = [
        os.path.join(SCRIPTS_DIR, f"{skill_name}_eval_tasks.json"),
        os.path.join(SCRIPTS_DIR, f"{skill_name.replace('-', '_')}_eval_tasks.json"),
    ]
    if skill_name == "rhl-pr-helper":
        candidates.insert(0, os.path.join(SCRIPTS_DIR, "pr_helper_eval_tasks.json"))
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def extract_skill_rule_checks(skill_path: str) -> list[dict]:
    """Auto-extract rule checks from SKILL.md when no curated task suite exists."""
    checks = []
    if not os.path.isfile(skill_path):
        return checks
    with open(skill_path, "r", encoding="utf-8") as f:
        raw_text = f.read()
    text = raw_text.replace("**", "")

    # Negative checks: bullet items under 'Do not stage / NEVER / exclude'
    for block in re.findall(r"(?i)(?:do not|never|exclude)\s+[^\n]*:\s*\n((?:\s*-\s*`[^`]+`\s*\n?)+)", text):
        for item in re.findall(r"`([^`]+)`", block):
            if item not in [c["arg"] for c in checks]:
                checks.append({"op": "not_contains", "arg": item})

    # Positive checks: commands backticked in the skill
    for code in re.findall(r"`([a-z0-9_-]+ [a-z0-9_ -]+)`", raw_text):
        if any(code.startswith(k) for k in ["git ", "bun ", "uv ", "wt ", "gh "]):
            if code not in [c["arg"] for c in checks]:
                checks.append({"op": "contains", "arg": code})

    # Explicit MUST / NEVER
    for m in re.finditer(r"\bMUST\s+(?:use\s+|run\s+|include\s+|have\s+)?([`'\"A-Za-z0-9_-]{3,30})", raw_text):
        val = m.group(1).strip("`'\" ").strip()
        if val and len(val) >= 3 and not val.isupper() and val not in [c["arg"] for c in checks]:
            checks.append({"op": "contains", "arg": val})

    for m in re.finditer(r"\bNEVER\s+(?:use\s+|run\s+|include\s+|do\s+)?([`'\"A-Za-z0-9_-]{3,30})", raw_text):
        val = m.group(1).strip("`'\" ").strip()
        if val and len(val) >= 3 and not val.isupper() and val not in [c["arg"] for c in checks]:
            checks.append({"op": "not_contains", "arg": val})

    return checks[:6]

def _parse_agy_entry(entry: dict, user_prompts: list[str], assistant_finals: list[str], tools: list[str]) -> None:
    stype = entry.get("type")
    if stype == "USER_INPUT":
        clean = re.sub(r"<[^>]+>", "", entry.get("content", "")).strip()
        if clean:
            user_prompts.append(clean)
    elif stype == "PLANNER_RESPONSE":
        content = entry.get("content", "")
        if content:
            assistant_finals.append(content.strip())
        for call in entry.get("tool_calls", []):
            tools.append(call.get("name", ""))


def _process_agy_transcript_lines(f) -> tuple[str, str, list[str], list[str], list[str]]:
    user_prompts: list[str] = []
    assistant_finals: list[str] = []
    tools: list[str] = []
    started = ""
    ended = ""

    for line in f:
        if not line.strip():
            continue
        entry = json.loads(line)
        created_at = entry.get("created_at", "")
        if created_at:
            if not started:
                started = created_at
            ended = created_at
        _parse_agy_entry(entry, user_prompts, assistant_finals, tools)

    return started, ended, user_prompts, assistant_finals, tools


def _parse_agy_transcript(path: str, project: str) -> SessionDigest | None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            started, ended, user_prompts, assistant_finals, tools = _process_agy_transcript_lines(f)
    except Exception:
        return None

    if not user_prompts:
        return None

    conv_id = path.split("/")[-4]
    return SessionDigest(
        session_id=conv_id,
        project=project or "antigravity",
        started_at=started,
        ended_at=ended,
        user_prompts=user_prompts,
        assistant_finals=assistant_finals[-5:],
        tools_used=list(dict.fromkeys(tools)),
        files_touched=[],
        feedback_signals=[],
        n_user_turns=len(user_prompts),
        n_assistant_turns=len(assistant_finals),
        raw_path=path,
    )


def harvest_agy_digests(project: str = "", limit: int = 40) -> list[SessionDigest]:
    transcripts = sorted(
        glob.glob(os.path.join(AGY_BRAIN_DIR, "*", ".system_generated", "logs", "transcript.jsonl")),
        key=os.path.getmtime,
        reverse=True,
    )

    digests = []
    for path in transcripts:
        digest = _parse_agy_transcript(path, project)
        if digest is None:
            continue
        digests.append(digest)
        if len(digests) >= limit:
            break

    return digests

COMMON_SKILLS = [
    "graphify",
    "cmux",
    "worktrunk",
    "grilling",
    "cloudflare",
    "whiteboard",
    "promote-script",
    "ponytail",
]

def get_rhl_skills(include_common: bool = False, target: str | None = None) -> dict[str, str]:
    skills = {}
    pattern = os.path.join(SKILLS_ROOT, "rhl-*", "SKILL.md")
    for p in sorted(glob.glob(pattern)):
        dir_name = os.path.basename(os.path.dirname(p))
        skills[dir_name] = p
    if include_common:
        for name in COMMON_SKILLS:
            p = os.path.join(SKILLS_ROOT, name, "SKILL.md")
            if os.path.exists(p):
                skills[name] = p
    if target and target not in skills:
        p = os.path.join(SKILLS_ROOT, target, "SKILL.md")
        if os.path.exists(p):
            skills[target] = p
    return skills

def cmd_list(args: argparse.Namespace) -> int:
    skills = get_rhl_skills(include_common=getattr(args, "include_common", False))
    print("=" * 60)
    print(f"Agent Skills ({len(skills)} found in {SKILLS_ROOT})")
    print("=" * 60)
    for name, path in skills.items():
        print(f"  • {name:<26} -> {path}")
    print()
    return 0

def cmd_audit(args: argparse.Namespace) -> int:
    skills = get_rhl_skills(include_common=getattr(args, "include_common", False))
    print("=" * 80)
    print(f"Auditing {len(skills)} Skills")
    print("=" * 80)
    print(f"{'Skill Name':<28} | {'Lines':<6} | {'Words':<6} | {'Chars':<7} | {'Scripts':<7}")
    print("-" * 80)

    for name, path in skills.items():
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        has_scripts = "Yes" if os.path.isdir(os.path.join(os.path.dirname(path), "scripts")) else "No"
        print(f"{name:<28} | {len(content.splitlines()):<6} | {len(content.split()):<6} | {len(content):<7} | {has_scripts:<7}")

    print("=" * 80)
    return 0

def run_sleep_cycle(args: argparse.Namespace, dry_run: bool) -> int:
    skills = get_rhl_skills(include_common=getattr(args, "include_common", False), target=args.skill)
    if args.skill:
        if args.skill not in skills:
            print(f"Error: Unknown skill '{args.skill}'. Available skills:\n  " + "\n  ".join(skills.keys()))
            return 1
        target_skills = {args.skill: skills[args.skill]}
    else:
        target_skills = skills

    import skillopt_sleep.cycle as cycle_module
    import skillopt_sleep.mine as mine_module

    backend_instance = patched_get_backend(args.backend, model=args.model or "")

    print("=" * 60)
    print(f"RHL SkillOpt {'Dry Run' if dry_run else 'Live Run'}")
    print(f"Target Skill : {args.skill or f'All RHL Skills ({len(target_skills)} skills fan-out)'}")
    print(f"Backend      : {args.backend} ({backend_instance.__class__.__name__})")
    print(f"Source       : {args.source}")
    print(f"Project      : {args.project}")
    print("=" * 60)
    print()

    digests = []
    if args.source == "omp":
        digests = harvest_omp_digests(project=args.project, limit=args.max_sessions)
        print(f"[omp-harvest] Harvested {len(digests)} sessions from ~/.omp/agent/sessions")
    elif args.source == "agy":
        digests = harvest_agy_digests(project=args.project, limit=args.max_sessions)
        print(f"[agy-harvest] Harvested {len(digests)} sessions from ~/.gemini/antigravity-cli/brain")

    for skill_name, skill_path in target_skills.items():
        curated_file = find_curated_tasks_file(skill_name)
        if curated_file:
            seed_tasks, _ = load_tasks_file(curated_file)
            print(f"\n--- Optimizing {skill_name} ({len(seed_tasks)} curated benchmark tasks from {os.path.basename(curated_file)}) ---")
        else:
            skill_digests = harvest_omp_digests(project=args.project, limit=args.max_sessions, target_skill=skill_name) if args.source == "omp" else digests
            if not skill_digests:
                skill_digests = digests
            seed_tasks = mine_module.mine(
                skill_digests,
                max_tasks=40,
                target_skill_path=skill_path,
            )
            rule_checks = extract_skill_rule_checks(skill_path)
            if seed_tasks and rule_checks:
                for t in seed_tasks:
                    if not t.judge.get("checks"):
                        t.judge["checks"] = list(rule_checks)
                print(f"\n--- Optimizing {skill_name} ({len(seed_tasks)} mined tasks + {len(rule_checks)} auto-derived rule checks) ---")
            else:
                print(f"\n--- Optimizing {skill_name} ({len(seed_tasks)} mined tasks) ---")

        if not seed_tasks:
            continue
        overrides = {
            "invoked_project": args.project,
            "backend": args.backend,
            "model": args.model or "",
            "target_skill_path": skill_path,
            "skill_roots": [SKILLS_ROOT],
            "lookback_hours": args.lookback_hours,
            "transcript_source": "pi" if args.source in {"omp", "agy"} else args.source,
            "pi_home": os.path.expanduser("~/.omp") if args.source == "omp" else os.path.expanduser("~/.pi"),
            "progress": True,
        }
        if args.preferences:
            overrides["preferences"] = args.preferences

        cfg = cycle_module.load_config(**overrides)
        outcome = cycle_module.run_sleep_cycle(
            cfg,
            dry_run=dry_run,
            seed_tasks=seed_tasks,
            backend=backend_instance,
        )
        print(f"[{skill_name}] Outcome: accepted={outcome.report.accepted} score={outcome.report.baseline_score:.3f}->{outcome.report.candidate_score:.3f} gate_action={outcome.report.gate_action}")
    return 0

def cmd_dry_run(args: argparse.Namespace) -> int:
    return run_sleep_cycle(args, dry_run=True)

def cmd_run(args: argparse.Namespace) -> int:
    return run_sleep_cycle(args, dry_run=False)

def cmd_status(args: argparse.Namespace) -> int:
    cmd = ["skillopt-sleep", "status", "--project", args.project]
    proc = subprocess.run(cmd)
    return proc.returncode

def cmd_adopt(args: argparse.Namespace) -> int:
    cmd = ["skillopt-sleep", "adopt", "--project", args.project]
    if args.all:
        cmd.append("--all-skills")
    elif args.skill:
        cmd.extend(["--skill", args.skill])
    else:
        print("Please specify either --skill <NAME> or --all to adopt staged proposals.")
        return 1
    proc = subprocess.run(cmd)
    return proc.returncode

def main():
    parser = argparse.ArgumentParser(description="SkillOpt Manager for RHL Agent Skills (OMP & AGY enabled).")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_list = subparsers.add_parser("list", help="List all discovered skills.")
    p_list.add_argument("--include-common", action="store_true", help="Include frequently-used non-RHL skills")
    p_audit = subparsers.add_parser("audit", help="Audit lines, words, character counts of skills.")
    p_audit.add_argument("--include-common", action="store_true", help="Include frequently-used non-RHL skills")

    for sub in ["dry-run", "run"]:
        p = subparsers.add_parser(sub, help="Preview (dry-run) or stage (run) skill optimization.")
        p.add_argument("--skill", default=None, help="Target specific skill directory name (e.g. rhl-*, graphify)")
        p.add_argument("--backend", default="omp", choices=["agy", "omp", "mock", "claude", "codex"], help="Execution backend (default: omp)")
        p.add_argument("--include-common", action="store_true", help="Include frequently-used non-RHL skills")
        p.add_argument("--source", default="omp", choices=["agy", "omp", "pi", "claude", "codex"], help="Transcript source (default: omp)")
        p.add_argument("--project", default=PROJECT_DIR, help=HELP_RHL_PROJECT)
        p.add_argument("--lookback-hours", type=int, default=0, help="Transcript lookback hours (0 = all history)")
        p.add_argument("--max-sessions", type=int, default=40, help="Max sessions to harvest")
        p.add_argument("--model", default=None, help="Model override")
        p.add_argument("--preferences", default=None, help="House rules / preferences for optimizer")

    p_status = subparsers.add_parser("status", help="Show current state and latest staged proposals.")
    p_status.add_argument("--project", default=PROJECT_DIR, help=HELP_RHL_PROJECT)

    p_adopt = subparsers.add_parser("adopt", help="Adopt staged proposals.")
    p_adopt.add_argument("--skill", default=None, help="Adopt a specific staged skill proposal")
    p_adopt.add_argument("--all", action="store_true", help="Adopt all staged skill proposals")
    p_adopt.add_argument("--project", default=PROJECT_DIR, help=HELP_RHL_PROJECT)

    args = parser.parse_args()
    handlers = {
        "list": cmd_list,
        "audit": cmd_audit,
        "dry-run": cmd_dry_run,
        "run": cmd_run,
        "status": cmd_status,
        "adopt": cmd_adopt,
    }
    sys.exit(handlers[args.command](args))

if __name__ == "__main__":
    main()
