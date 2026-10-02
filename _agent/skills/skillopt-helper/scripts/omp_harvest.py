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

def _load_json_lines(path: str) -> list[dict]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]
    except Exception:
        return []

    records = []
    for line in lines:
        try:
            records.append(json.loads(line))
        except Exception:
            continue
    return records


def _extract_session_header(records: list[dict]) -> tuple[str, str]:
    for r in records[:3]:
        if r.get("type") == "session":
            return r.get("cwd", ""), r.get("timestamp", "")
    return "", ""


def _extract_text_content(content: str | list | None) -> list[str]:
    if isinstance(content, str) and content.strip():
        return [content.strip()]
    if isinstance(content, list):
        return [
            block.get("text", "").strip()
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
    return []


def _extract_tool_calls(content: list | None) -> list[str]:
    if not isinstance(content, list):
        return []
    return [
        block.get("name", "")
        for block in content
        if isinstance(block, dict) and block.get("type") == "toolCall"
    ]


def _process_records(records: list[dict], started: str) -> tuple[str, list[str], list[str], list[str]]:
    user_prompts: list[str] = []
    assistant_finals: list[str] = []
    tools: list[str] = []
    ended = started

    for r in records:
        ts = r.get("timestamp")
        if ts:
            ended = ts
        if r.get("type") != "message":
            continue

        msg = r.get("message", {})
        role = msg.get("role")
        content = msg.get("content")

        if role == "user":
            user_prompts.extend(_extract_text_content(content))
        elif role == "assistant":
            assistant_finals.extend(_extract_text_content(content))
            tools.extend(_extract_tool_calls(content))

    return ended, user_prompts, assistant_finals, tools


def _parse_session_file(path: str, project: str) -> SessionDigest | None:
    if os.path.basename(path).startswith("."):
        return None

    records = _load_json_lines(path)
    if not records:
        return None

    session_cwd, started = _extract_session_header(records)
    if project and session_cwd and project not in session_cwd:
        return None

    ended, user_prompts, assistant_finals, tools = _process_records(records, started)
    if not user_prompts:
        return None

    session_id = os.path.splitext(os.path.basename(path))[0]
    return SessionDigest(
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


def harvest_omp_sessions(sessions_dir: str, project: str = "", limit: int = 40) -> list[SessionDigest]:
    digests = []
    files = sorted(
        glob.glob(os.path.join(sessions_dir, "**", "*.jsonl"), recursive=True),
        key=os.path.getmtime,
        reverse=True,
    )

    for path in files:
        digest = _parse_session_file(path, project)
        if digest is None:
            continue
        digests.append(digest)
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
