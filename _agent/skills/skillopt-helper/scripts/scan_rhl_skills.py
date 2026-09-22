#!/usr/bin/env python3
# /// script
# dependencies = [
#   "pyyaml",
#   "skillopt @ git+https://github.com/microsoft/SkillOpt",
# ]
# ///
"""Scan and audit all rhl-* skills in dotfiles.

Usage:
    uv run scan_rhl_skills.py [--skills-dir /path/to/skills]
"""
from __future__ import annotations

import argparse
import glob
import os
import re
import yaml

DEFAULT_SKILLS_DIR = "/Users/joe/dotfiles/_agent/skills"

def parse_skill(skill_md_path: str) -> dict:
    with open(skill_md_path, "r", encoding="utf-8") as f:
        content = f.read()

    frontmatter = {}
    body = content
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", content, re.DOTALL)
    if match:
        try:
            frontmatter = yaml.safe_load(match.group(1)) or {}
        except Exception:
            frontmatter = {}
        body = match.group(2)

    return {
        "path": skill_md_path,
        "name": frontmatter.get("name", os.path.basename(os.path.dirname(skill_md_path))),
        "description": frontmatter.get("description", "").strip(),
        "total_lines": len(content.splitlines()),
        "total_chars": len(content),
        "total_words": len(content.split()),
        "has_scripts": os.path.isdir(os.path.join(os.path.dirname(skill_md_path), "scripts")),
    }

def main():
    parser = argparse.ArgumentParser(description="Scan and audit all rhl-* skills.")
    parser.add_argument("--skills-dir", default=DEFAULT_SKILLS_DIR, help="Skills root dir")
    args = parser.parse_args()

    pattern = os.path.join(args.skills_dir, "rhl-*", "SKILL.md")
    paths = sorted(glob.glob(pattern))

    print("=" * 80)
    print(f"Discovered {len(paths)} 'rhl-*' Skills in {args.skills_dir}")
    print("=" * 80)
    print(f"{'Skill Name':<28} | {'Lines':<6} | {'Words':<6} | {'Chars':<7} | {'Scripts':<7}")
    print("-" * 80)

    for p in paths:
        info = parse_skill(p)
        scripts_str = "Yes" if info["has_scripts"] else "No"
        print(f"{info['name']:<28} | {info['total_lines']:<6} | {info['total_words']:<6} | {info['total_chars']:<7} | {scripts_str:<7}")

    print("=" * 80)
    print("\nSkill Descriptions:")
    for p in paths:
        info = parse_skill(p)
        desc = info["description"].replace("\n", " ")
        print(f"• {info['name']}: {desc}")

if __name__ == "__main__":
    main()
