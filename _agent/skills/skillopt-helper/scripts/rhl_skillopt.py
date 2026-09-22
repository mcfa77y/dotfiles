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

SKILLS_ROOT = "/Users/joe/dotfiles/_agent/skills"
PROJECT_DIR = "/Users/joe/Projects/empo_health/remote-health-link"
OMP_SESSIONS_DIR = os.path.expanduser("~/.omp/agent/sessions")
AGY_BRAIN_DIR = os.path.expanduser("~/.gemini/antigravity-cli/brain")

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
        lines = [line for line in out.splitlines() if not (line.startswith("Warning:") or line.startswith("Working..."))]
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

def harvest_omp_digests(project: str = "", limit: int = 40) -> list[SessionDigest]:
    digests = []
    files = sorted(glob.glob(os.path.join(OMP_SESSIONS_DIR, "**", "*.jsonl"), recursive=True), key=os.path.getmtime, reverse=True)
    for path in files:
        if os.path.basename(path).startswith("."):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f if line.strip()]
        except Exception:
            continue
        if not lines:
            continue
        records = []
        for line in lines:
            try:
                records.append(json.loads(line))
            except Exception:
                continue
        session_cwd = ""
        started = ""
        ended = ""
        session_id = os.path.splitext(os.path.basename(path))[0]
        for r in records[:3]:
            if r.get("type") == "session":
                session_cwd = r.get("cwd", "")
                started = r.get("timestamp", "")
                ended = started
                break
        if project and session_cwd and project not in session_cwd:
            continue
        user_prompts = []
        assistant_finals = []
        tools = []
        for r in records:
            ts = r.get("timestamp")
            if ts:
                ended = ts
            rtype = r.get("type")
            if rtype == "message":
                msg = r.get("message", {})
                role = msg.get("role")
                content = msg.get("content")
                if role == "user":
                    if isinstance(content, str) and content.strip():
                        user_prompts.append(content.strip())
                    elif isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                user_prompts.append(block.get("text", "").strip())
                elif role == "assistant":
                    if isinstance(content, str) and content.strip():
                        assistant_finals.append(content.strip())
                    elif isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                assistant_finals.append(block.get("text", "").strip())
                            elif isinstance(block, dict) and block.get("type") == "toolCall":
                                tools.append(block.get("name", ""))
        if not user_prompts:
            continue
        d = SessionDigest(
            session_id=session_id,
            project=session_cwd or project,
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
        digests.append(d)
        if len(digests) >= limit:
            break
    return digests

def harvest_agy_digests(project: str = "", limit: int = 40) -> list[SessionDigest]:
    transcripts = sorted(
        glob.glob(os.path.join(AGY_BRAIN_DIR, "*", ".system_generated", "logs", "transcript.jsonl")),
        key=os.path.getmtime,
        reverse=True,
    )
    digests = []
    for path in transcripts:
        user_prompts = []
        assistant_finals = []
        tools = []
        started = ""
        ended = ""
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    entry = json.loads(line)
                    created_at = entry.get("created_at", "")
                    if created_at:
                        if not started:
                            started = created_at
                        ended = created_at
                    
                    stype = entry.get("type")
                    if stype == "USER_INPUT":
                        content = entry.get("content", "")
                        clean = re.sub(r"<[^>]+>", "", content).strip()
                        if clean:
                            user_prompts.append(clean)
                    elif stype == "PLANNER_RESPONSE":
                        content = entry.get("content", "")
                        if content:
                            assistant_finals.append(content.strip())
                        for call in entry.get("tool_calls", []):
                            tools.append(call.get("name", ""))
        except Exception:
            continue

        if not user_prompts:
            continue

        conv_id = path.split("/")[-4]
        d = SessionDigest(
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
        digests.append(d)
        if len(digests) >= limit:
            break
    return digests

def get_rhl_skills() -> dict[str, str]:
    skills = {}
    pattern = os.path.join(SKILLS_ROOT, "rhl-*", "SKILL.md")
    for p in sorted(glob.glob(pattern)):
        dir_name = os.path.basename(os.path.dirname(p))
        skills[dir_name] = p
    return skills

def cmd_list(args: argparse.Namespace) -> int:
    skills = get_rhl_skills()
    print("=" * 60)
    print(f"RHL Agent Skills ({len(skills)} found in {SKILLS_ROOT})")
    print("=" * 60)
    for name, path in skills.items():
        print(f"  • {name:<26} -> {path}")
    print()
    return 0

def cmd_audit(args: argparse.Namespace) -> int:
    skills = get_rhl_skills()
    print("=" * 80)
    print(f"Auditing {len(skills)} RHL Skills")
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
    skills = get_rhl_skills()
    target_skill = None
    if args.skill:
        if args.skill not in skills:
            print(f"Error: Unknown skill '{args.skill}'. Available skills:\n  " + "\n  ".join(skills.keys()))
            return 1
        target_skill = skills[args.skill]

    import skillopt_sleep.cycle as cycle_module
    import skillopt_sleep.mine as mine_module

    backend_instance = patched_get_backend(args.backend, model=args.model or "")

    overrides = {
        "invoked_project": args.project,
        "backend": args.backend,
        "model": args.model or "",
        "target_skill_path": target_skill or "",
        "skill_roots": [SKILLS_ROOT],
        "lookback_hours": args.lookback_hours,
        "transcript_source": "pi" if args.source in {"omp", "agy"} else args.source,
        "pi_home": os.path.expanduser("~/.omp") if args.source == "omp" else os.path.expanduser("~/.pi"),
        "progress": True,
    }
    if args.preferences:
        overrides["preferences"] = args.preferences

    cfg = cycle_module.load_config(**overrides)

    print("=" * 60)
    print(f"RHL SkillOpt {'Dry Run' if dry_run else 'Live Run'}")
    print(f"Target Skill : {args.skill or 'All RHL Skills (multi-skill fan-out)'}")
    print(f"Backend      : {args.backend} ({backend_instance.__class__.__name__})")
    print(f"Source       : {args.source}")
    print(f"Project      : {args.project}")
    print("=" * 60)
    print()

    seed_tasks = None
    if args.source == "omp":
        digests = harvest_omp_digests(project=args.project, limit=args.max_sessions)
        print(f"[omp-harvest] Harvested {len(digests)} sessions from ~/.omp/agent/sessions")
        seed_tasks = mine_module.mine(
            digests,
            max_tasks=40,
            target_skill_path=target_skill or "",
        )
        print(f"[omp-mine] Extracted {len(seed_tasks)} tasks from sessions")
    elif args.source == "agy":
        digests = harvest_agy_digests(project=args.project, limit=args.max_sessions)
        print(f"[agy-harvest] Harvested {len(digests)} sessions from ~/.gemini/antigravity-cli/brain")
        seed_tasks = mine_module.mine(
            digests,
            max_tasks=40,
            target_skill_path=target_skill or "",
        )
        print(f"[agy-mine] Extracted {len(seed_tasks)} tasks from sessions")

    outcome = cycle_module.run_sleep_cycle(
        cfg,
        dry_run=dry_run,
        seed_tasks=seed_tasks,
        backend=backend_instance,
    )
    print(f"[sleep] Outcome: accepted={outcome.report.accepted} score={outcome.report.baseline_score:.3f}->{outcome.report.candidate_score:.3f} gate_action={outcome.report.gate_action}")
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

    subparsers.add_parser("list", help="List all discovered rhl-* skills.")
    subparsers.add_parser("audit", help="Audit lines, words, character counts of rhl-* skills.")

    for sub in ["dry-run", "run"]:
        p = subparsers.add_parser(sub, help="Preview (dry-run) or stage (run) skill optimization.")
        p.add_argument("--skill", default=None, help="Target specific rhl-* skill directory name")
        p.add_argument("--backend", default="agy", choices=["agy", "omp", "mock", "claude", "codex"], help="Execution backend (default: agy)")
        p.add_argument("--source", default="agy", choices=["agy", "omp", "pi", "claude", "codex"], help="Transcript source (default: agy)")
        p.add_argument("--project", default=PROJECT_DIR, help="RHL project directory")
        p.add_argument("--lookback-hours", type=int, default=0, help="Transcript lookback hours (0 = all history)")
        p.add_argument("--max-sessions", type=int, default=40, help="Max sessions to harvest")
        p.add_argument("--model", default=None, help="Model override")
        p.add_argument("--preferences", default=None, help="House rules / preferences for optimizer")

    p_status = subparsers.add_parser("status", help="Show current state and latest staged proposals.")
    p_status.add_argument("--project", default=PROJECT_DIR, help="RHL project directory")

    p_adopt = subparsers.add_parser("adopt", help="Adopt staged proposals.")
    p_adopt.add_argument("--skill", default=None, help="Adopt a specific staged skill proposal")
    p_adopt.add_argument("--all", action="store_true", help="Adopt all staged skill proposals")
    p_adopt.add_argument("--project", default=PROJECT_DIR, help="RHL project directory")

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
