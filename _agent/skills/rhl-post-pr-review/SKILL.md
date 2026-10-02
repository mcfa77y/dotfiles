---
name: rhl-post-pr-review
description: Post structured inline review comments and top-level review summaries to GitHub Pull Requests in RHL repositories.
---

# RHL Post PR Review Skill

Use this workflow to publish code review findings and inline diff comments directly to GitHub Pull Requests in RHL repositories.

## Prerequisites
- Active GitHub authentication via `gh auth status` or GitHub MCP tools.
- PR number / URL and review report (e.g., from `rhl-review-pr` output in `docs/` or session findings).

## Locating Exact Diff Lines via Helper Script
To find the exact line numbers inside PR diff hunks and ensure comments target valid reviewable lines, use `scripts/find-diff-line.ts`:
```bash
# Search for a pattern or keyword in a changed file
bun run scripts/find-diff-line.ts <PR_NUMBER_OR_URL> -f <FILENAME> -p "<PATTERN>"

# Search deletions on LEFT side
bun run scripts/find-diff-line.ts <PR_NUMBER> -f <FILENAME> -p "<PATTERN>" -s LEFT

# Output machine-readable JSON for automated review payload construction
bun run scripts/find-diff-line.ts <PR_NUMBER> -f <FILENAME> -p "<PATTERN>" --json
```

## Recommended: Automated Submission via Helper Script

The skill includes a dedicated TypeScript helper script `scripts/post-review.ts` that:
1. Automatically resolves the PR's target `headRefOid` commit SHA.
2. Validates that inline comment line numbers belong to valid diff hunks (preventing GitHub `422 Unprocessable Entity` rejections by safely falling back out-of-hunk notes into the review summary).
3. Submits the unified review via `POST /repos/{owner}/{repo}/pulls/{pr}/reviews`.
4. Verifies posted comments and outputs the direct review URL.

### Usage Options

#### Option 1: CLI Flags
```bash
bun run scripts/post-review.ts \
  --repo <OWNER>/<REPO> \
  --pr <PR_NUMBER_OR_URL> \
  --event APPROVE \
  --body "### Code Review Summary\n\nApproved: looks great!" \
  --comments '[{"path": "workspaces/backend-api/sources/app.ts", "line": 42, "body": "Great simplification here."}]'
```

Or with summary / comments from files:
```bash
bun run scripts/post-review.ts \
  --pr <PR_NUMBER> \
  --event REQUEST_CHANGES \
  --body-file docs/pr_review_summary.md \
  --comments-file docs/inline_comments.json
```

#### Option 2: JSON Payload via stdin or `--input`
```bash
cat << 'EOF' | bun run scripts/post-review.ts --pr <PR_NUMBER>
{
  "event": "APPROVE",
  "body": "### Code Review Summary\n\nVerified and approved.",
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
bun run scripts/post-review.ts --pr <PR_NUMBER> --body "Summary" --comments-file comments.json --dry-run
```

---

## Direct Workflow (Fallback via gh CLI)

If submitting directly without `scripts/post-review.ts`:

### 1. Resolve Target Commit SHA (`headRefOid`)
```bash
COMMIT_ID=$(gh pr view <PR_NUMBER> --json headRefOid -q .headRefOid)
```

### 2. Verify Valid Diff Lines
Comments on lines outside unified diff hunks will fail with HTTP 422. Use `find-diff-line.ts` or verify via:
```bash
gh api /repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/files --paginate
```

### 3. Assemble JSON Payload
Construct the review payload:
```json
{
  "commit_id": "<HEAD_REF_OID>",
  "event": "APPROVE",
  "body": "### Code Review: Summary\n\n- Verdict: APPROVE\n- Confidence: 0.95",
  "comments": [
    {
      "path": "workspaces/qa/sources/utils/PageUtils.ts",
      "line": 65,
      "side": "RIGHT",
      "body": "Added selected class assertion ensures reliable test synchronization."
    }
  ]
}
```

### 4. Submit Review via GitHub API
```bash
gh api --method POST /repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews --input /tmp/pr_review_payload.json
```

### 5. Verify & Provide Link
- Verify comment creation:
```bash
gh api /repos/<OWNER>/<REPO>/pulls/<PR_NUMBER>/reviews/<REVIEW_ID>/comments --jq '.[].path'
```
- Provide the user with the direct link to the submitted GitHub PR review.
