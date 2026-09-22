#!/usr/bin/env python3
# /// script
# dependencies = [
#   "skillopt @ git+https://github.com/microsoft/SkillOpt",
# ]
# ///
"""Harvester adapter for oh-my-pi (omp) and Antigravity (agy) session formats."""
from __future__ import annotations

import json
import os
import glob
from skillopt_sleep.types import SessionDigest

def harvest_omp_sessions(sessions_dir: str, project: str = "", limit: int = 40) -> list[SessionDigest]:
    digests = []
    # Find all .jsonl files in sessions_dir
    files = sorted(glob.glob(os.path.join(sessions_dir, "**", "*.jsonl"), recursive=True), key=os.path.getmtime, reverse=True)
    
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

        # Look for header in first 3 lines
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

if __name__ == "__main__":
    omp_sessions = os.path.expanduser("~/.omp/agent/sessions")
    project = "/Users/joe/Projects/empo_health/remote-health-link"
    digests = harvest_omp_sessions(omp_sessions, project=project, limit=5)
    print(f"Harvested {len(digests)} sessions from {omp_sessions} matching {project}:")
    for d in digests:
        print(f"\n[Session {d.session_id}] ({d.n_user_turns} user turns)")
        for prompt in d.user_prompts[:2]:
            print(f"  > {prompt[:100]}...")
