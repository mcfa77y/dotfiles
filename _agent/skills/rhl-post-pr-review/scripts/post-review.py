#!/usr/bin/env python3
"""
Post a unified pull request review with inline comments to GitHub via gh CLI.

Supports diff-hunk line validation to prevent GitHub 422 errors, auto-resolves
the PR's current head commit SHA, and can read review payloads from CLI flags
or JSON via stdin/file.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from typing import Any, Dict, List, Optional, Set, Tuple


def run_cmd(cmd: List[str]) -> str:
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Command failed ({' '.join(cmd)}): {res.stderr.strip()}")
    return res.stdout.strip()


def parse_pr_target(target: str) -> Tuple[Optional[str], int]:
    """Parse PR number and optional repo from a PR number or full URL."""
    target = target.strip()
    url_match = re.search(r"github\.com/([^/]+/[^/]+)/pull/(\d+)", target)
    if url_match:
        return url_match.group(1), int(url_match.group(2))

    if target.isdigit():
        return None, int(target)

    # Check for #1234 or repo#1234
    if "#" in target:
        parts = target.split("#", 1)
        repo = parts[0].strip() or None
        if parts[1].strip().isdigit():
            return repo, int(parts[1].strip())

    raise ValueError(f"Could not parse PR number from '{target}'. Expected PR number or GitHub pull URL.")


def detect_repo() -> str:
    """Detect current GitHub repository via gh CLI."""
    out = run_cmd(["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"])
    if not out:
        raise RuntimeError("Could not detect repository. Provide --repo <owner>/<repo> explicitly.")
    return out


def get_pr_metadata(repo: str, pr: int) -> Tuple[str, str]:
    """Retrieve head commit SHA and HTML URL for the PR."""
    out = run_cmd(["gh", "pr", "view", str(pr), "--repo", repo, "--json", "headRefOid,url"])
    data = json.loads(out)
    return data["headRefOid"], data["url"]


def get_diff_valid_lines(repo: str, pr: int) -> Dict[str, Set[int]]:
    """Parse PR files to find valid line numbers in diff hunks (RIGHT side)."""
    out = run_cmd(["gh", "api", f"/repos/{repo}/pulls/{pr}/files", "--paginate"])
    files = json.loads(out)
    valid_lines: Dict[str, Set[int]] = {}

    hunk_header_re = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")

    for f in files:
        filename = f.get("filename")
        patch = f.get("patch", "")
        if not filename or not patch:
            continue

        lines = set()
        current_right_line = 0

        for patch_line in patch.splitlines():
            header_match = hunk_header_re.match(patch_line)
            if header_match:
                current_right_line = int(header_match.group(1))
                continue

            if patch_line.startswith("+"):
                lines.add(current_right_line)
                current_right_line += 1
            elif patch_line.startswith(" "):
                lines.add(current_right_line)
                current_right_line += 1
            elif patch_line.startswith("-"):
                # Deleted line on left side; right line counter does not advance
                continue

        valid_lines[filename] = lines

    return valid_lines


def post_review(
    repo: str,
    pr: int,
    event: str,
    body: str,
    comments: List[Dict[str, Any]],
    commit_id: Optional[str] = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    head_oid, pr_url = get_pr_metadata(repo, pr)
    target_commit = commit_id or head_oid

    # Validate comment lines against diff hunks
    valid_lines_by_file = get_diff_valid_lines(repo, pr)
    adjusted_comments = []
    fallback_body_comments = []

    for c in comments:
        path = c.get("path")
        line = c.get("line")
        comment_body = c.get("body", "")
        side = c.get("side", "RIGHT")

        if path in valid_lines_by_file and line in valid_lines_by_file[path]:
            comment_entry = {
                "path": path,
                "line": int(line),
                "side": side,
                "body": comment_body,
            }
            if "start_line" in c and c["start_line"] is not None:
                comment_entry["start_line"] = int(c["start_line"])
                comment_entry["start_side"] = c.get("start_side", side)
            adjusted_comments.append(comment_entry)
        else:
            print(
                f"⚠️  Warning: {path}:{line} not in PR diff hunks. Moving comment to review body.",
                file=sys.stderr,
            )
            fallback_body_comments.append(f"### Note on `{path}:{line}`\n\n{comment_body}")

    final_body = body.strip()
    if fallback_body_comments:
        final_body += "\n\n---\n\n" + "\n\n".join(fallback_body_comments)

    payload = {
        "commit_id": target_commit,
        "event": event.upper(),
        "body": final_body,
        "comments": adjusted_comments,
    }

    if dry_run:
        return {
            "status": "dry_run",
            "repo": repo,
            "pr": pr,
            "url": pr_url,
            "commit_id": target_commit,
            "inline_comment_count": len(adjusted_comments),
            "fallback_comment_count": len(fallback_body_comments),
            "payload": payload,
        }

    p = subprocess.Popen(
        ["gh", "api", "--method", "POST", f"/repos/{repo}/pulls/{pr}/reviews", "--input", "-"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    stdout, stderr = p.communicate(input=json.dumps(payload))
    if p.returncode != 0:
        raise RuntimeError(f"GitHub review creation failed: {stderr.strip()}")

    res = json.loads(stdout)
    review_id = res["id"]
    review_url = f"{pr_url}#pullrequestreview-{review_id}"

    # Verify posted comments
    comments_out = run_cmd(
        ["gh", "api", f"/repos/{repo}/pulls/{pr}/reviews/{review_id}/comments", "--jq", ".[].path"]
    )
    verified_paths = [path for path in comments_out.splitlines() if path]

    return {
        "status": "published",
        "review_id": review_id,
        "review_url": review_url,
        "commit_id": target_commit,
        "verified_comments": len(verified_paths),
        "fallback_comments": len(fallback_body_comments),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Post a unified GitHub PR review with inline comments and diff hunk validation."
    )
    parser.add_argument("--repo", help="Repository in 'owner/repo' format (auto-detected if omitted)")
    parser.add_argument("--pr", help="Pull request number or GitHub PR URL (e.g., 2709 or https://github.com/...)")
    parser.add_argument(
        "--event",
        choices=["APPROVE", "REQUEST_CHANGES", "COMMENT"],
        default="COMMENT",
        help="Review action (default: COMMENT)",
    )
    parser.add_argument("--body", help="Markdown summary for the review")
    parser.add_argument("--body-file", help="Path to markdown file containing review summary")
    parser.add_argument("--comments", help="JSON string representing array of inline comments")
    parser.add_argument("--comments-file", help="Path to JSON file containing array of inline comments")
    parser.add_argument(
        "--input",
        help="Path to full JSON payload file containing event, body, comments (or '-' for stdin)",
    )
    parser.add_argument("--commit", help="Commit SHA to anchor review to (defaults to current PR headRefOid)")
    parser.add_argument("--dry-run", action="store_true", help="Validate and output payload without posting to GitHub")
    parser.add_argument("--json", action="store_true", help="Output result as JSON")

    args = parser.parse_args()

    repo = args.repo
    pr_number = None
    event = args.event
    body = args.body or ""
    comments = []
    commit_id = args.commit

    # Read from input file/stdin if specified, or if stdin is piped without conflicting args
    input_data = None
    if args.input:
        if args.input == "-":
            input_data = json.load(sys.stdin)
        else:
            with open(args.input, "r") as f:
                input_data = json.load(f)
    elif not sys.stdin.isatty() and not (args.pr and (args.body or args.body_file)):
        try:
            stdin_content = sys.stdin.read().strip()
            if stdin_content:
                input_data = json.loads(stdin_content)
        except Exception:
            pass

    if input_data:
        if "repo" in input_data and not repo:
            repo = input_data["repo"]
        if "pr" in input_data and not args.pr:
            args.pr = str(input_data["pr"])
        if "event" in input_data and args.event == "COMMENT":
            event = input_data["event"]
        if "body" in input_data and not body:
            body = input_data["body"]
        if "comments" in input_data:
            comments = input_data["comments"]
        if "commit_id" in input_data and not commit_id:
            commit_id = input_data["commit_id"]

    if not args.pr:
        parser.error("--pr is required (pass PR number, URL, or JSON payload with 'pr').")

    parsed_repo, pr_number = parse_pr_target(args.pr)
    if not repo and parsed_repo:
        repo = parsed_repo
    if not repo:
        repo = detect_repo()

    if args.body_file:
        with open(args.body_file, "r") as f:
            body = f.read()

    if args.comments_file:
        with open(args.comments_file, "r") as f:
            comments = json.load(f)
    elif args.comments:
        comments = json.loads(args.comments)

    if not body:
        body = "Code review submitted via automated workflow."

    try:
        result = post_review(
            repo=repo,
            pr=pr_number,
            event=event,
            body=body,
            comments=comments,
            commit_id=commit_id,
            dry_run=args.dry_run,
        )

        if args.json:
            print(json.dumps(result, indent=2))
        else:
            if result.get("status") == "dry_run":
                print("🔍 Dry Run Succeeded:")
                print(f"Target PR: {result['url']}")
                print(f"Target Commit: {result['commit_id']}")
                print(f"Inline Comments: {result['inline_comment_count']}")
                print(f"Fallback Comments: {result['fallback_comment_count']}")
                print("\nPayload:")
                print(json.dumps(result["payload"], indent=2))
            else:
                print("✅ Review successfully published!")
                print(f"URL: {result['review_url']}")
                print(f"Review ID: {result['review_id']}")
                print(f"Commit: {result['commit_id']}")
                print(f"Inline comments posted: {result['verified_comments']}")
                if result['fallback_comments'] > 0:
                    print(f"Comments moved to summary: {result['fallback_comments']}")

    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
