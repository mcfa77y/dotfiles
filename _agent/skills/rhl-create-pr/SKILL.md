---
name: rhl-create-pr
description: Creates a GitHub Pull Request describing changes on the current branch with specified reviewers.
---

# Git Create Pull Request

1. **Identify Base**: Base branch is `origin/main`.
2. **Analyze Changes**: `git diff --name-only origin/main...HEAD`
3. **Reviewers**:
   - Baseline: `pm-pp`, `simon57b`, `singhmadhurima123`
   - If `*.tf`, `*.yml`, or `*.yaml` files changed, add `edahlseng`
4. **Generate Content**:
   - Read `git log origin/main..HEAD --oneline`
   - Extract Linear ticket from branch name (`git branch --show-current`). If it matches `rhl-\d+`, suffix the PR title with `(RHL-1234)`.
5. **Create PR**:
   ```bash
   gh pr create --title "<Title>" --body "<Description>" --reviewer "<Reviewers>"
   ```
   *(Or use the `github-mcp-server/create_pull_request` tool)*