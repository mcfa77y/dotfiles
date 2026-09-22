---
name: rhl-post-pr-review
description: Post structured inline review comments and top-level review summaries to GitHub Pull Requests in RHL repositories.
---

# RHL Post PR Review Skill

Use this workflow to publish code review findings and inline diff comments directly to GitHub Pull Requests in RHL repositories.

## Prerequisites

- Active GitHub authentication via `gh auth status` or GitHub MCP tools.
- PR number / URL and review report (e.g., from `rhl-review-pr` output in `docs/` or session findings).

## Recommended: Automated Submission via Helper Script

The skill includes a dedicated helper script `scripts/post-review.py` that:
1. Automatically resolves the PR's target `headRefOid` commit SHA.
2. Validates that inline comment line numbers belong to valid diff hunks (preventing GitHub `422 Unprocessable Entity` rejections by safely falling back out-of-hunk notes to the review summary).
3. Submits the unified review via `POST /repos/{owner}/{repo}/pulls/{pr}/reviews`.
4. Verifies posted comments and outputs the direct review URL.

### Usage Examples

#### Option 1: CLI Flags with Comments File / String
```bash
python3 scripts/post-review.py \
  --repo <OWNER>/<REPO> \
  --pr <PR_NUMBER_OR_URL> \
  --event APPROVE \
  --body "Executive summary..." \
  --comments '[{"path": "path/to/file.ts", "line": 42, "body": "🟡 **Medium**: Description..."}]'
```

Or using separate markdown summary and JSON comments files:
```bash
python3 scripts/post-review.py \
  --pr <PR_NUMBER> \
  --event REQUEST_CHANGES \
  --body-file docs/pr_review_summary.md \
  --comments-file docs/inline_comments.json
```

#### Option 2: Full JSON via Stdin or `--input`
```bash
cat << 'EOF' | python3 scripts/post-review.py --pr <PR_NUMBER>
{
  "event": "APPROVE",
  "body": "Executive summary markdown...",
  "comments": [
    {
      "path": "workspaces/backend-api/sources/app.ts",
      "line": 15,
      "side": "RIGHT",
      "body": "ℹ️ **Note**: Actionable note here..."
    }
  ]
}
EOF
```

#### Option 3: Pre-flight Dry Run
Validate line numbers and inspect the assembled payload without posting to GitHub:
```bash
python3 scripts/post-review.py --pr <PR_NUMBER> --body "Summary" --comments-file comments.json --dry-run
```

---

## Manual Procedure (Fallback)

If running without the script, follow these manual steps:

### 1. Fetch PR & Commit Details
Retrieve the latest commit SHA (`headRefOid`) and PR metadata:
```bash
gh pr view <PR_NUMBER> --repo <OWNER>/<REPO> --json headRefOid,headRefName,title
```

### 2. Map Findings to Diff Lines
Ensure line numbers match diff hunk positions on the current HEAD commit:
- Read PR diffs via `pr://<owner>/<repo>/<PR>/diff/<index>` or `git diff origin/main...HEAD <path>`.
- Target modified/added lines on the `RIGHT` side (new version).
- For deletions, reference the line adjacent to the deleted hunk on `RIGHT`, or specify `side: "LEFT"` when anchoring directly to the removed line.

### 3. Draft Review Comments
Structure each inline comment with:
- **Severity Indicator**: `🔴 High`, `🟡 Medium`, `🟢 Low`, or `ℹ️ Note`.
- **Problem Statement**: Concise explanation of the bug, vulnerability, performance issue, or regression.
- **Actionable Recommendation**: Suggested replacement code using standard markdown or GitHub suggestion blocks.

### 4. Build and Submit Unified Review
Always submit inline comments as part of a single unified review rather than creating loose standalone comments:
- Use the GitHub Reviews API endpoint: `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`
- Include:
  - `commit_id`: The target `headRefOid`.
  - `event`: `REQUEST_CHANGES` (blocking bugs/regressions), `COMMENT` (suggestions/questions), or `APPROVE`.
  - `body`: Executive summary and high-level breakdown.
  - `comments`: Array of `{ path, line, side: "RIGHT", body }`.

Example submission via `gh api`:
```bash
gh api --method POST /repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews --input /tmp/pr_review_payload.json
```

### 5. Verify & Provide Link
- Verify comment creation:
  ```bash
  gh api /repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews/<REVIEW_ID>/comments --jq '.[].path'
  ```
- Clean up any temporary payload files.
- Provide the user with the direct link to the submitted GitHub PR review.
