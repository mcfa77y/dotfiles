---
name: rhl-reviewer-pr-status
description: "Check open PRs for updates, reviews, comments, and blocking rules from a specific reviewer (e.g., edahlseng)."
---

# Reviewer PR Status & Feedback Tracker

Use this skill to inspect open PRs authored by a developer, find reviews, comments, and change requests from a target reviewer, and determine which PRs are blocked by reviewer requirements.

## Bundled CLI Tool

The skill includes an automated TypeScript CLI script running via Bun:
`~/.omp/agent/skills/rhl-reviewer-pr-status/scripts/reviewer_prs.ts`

### Usage Examples

```bash
# Audit all open PRs and group by reviewer
bun run ~/.omp/agent/skills/rhl-reviewer-pr-status/scripts/reviewer_prs.ts

# Audit feedback, changes requested, and status for a specific reviewer (e.g. edahlseng)
bun run ~/.omp/agent/skills/rhl-reviewer-pr-status/scripts/reviewer_prs.ts --reviewer edahlseng

# Generate a ready-to-paste Slack digest for reviewers
bun run ~/.omp/agent/skills/rhl-reviewer-pr-status/scripts/reviewer_prs.ts --format slack

# Generate Slack digest with critical unfreeze PR highlighted
bun run ~/.omp/agent/skills/rhl-reviewer-pr-status/scripts/reviewer_prs.ts --format slack --unfreeze-pr 3146

# Output structured JSON for automation or subagents
bun run ~/.omp/agent/skills/rhl-reviewer-pr-status/scripts/reviewer_prs.ts --format json
```

### Testing
Run unit test suite:
```bash
bun test ~/.omp/agent/skills/rhl-reviewer-pr-status/scripts/reviewer_prs.spec.ts
```

## Inputs
- `repo`: GitHub repository in `owner/repo` format (defaults to `EmpoHealth/core` if in this workspace).
- `author`: GitHub username of the PR author (e.g., `mcfa77y`).
- `reviewer`: GitHub username of the target reviewer (e.g., `edahlseng`).

---

## Procedure

### Step 1: List Author's Open PRs
Query all open PRs authored by the user:

```bash
gh pr list --repo <repo> --author <author> --state open --limit 50 --json number,title,url,createdAt,updatedAt,headRefName
```

### Step 2: Query Reviews and Comments for Each PR
For each PR number returned from Step 1, retrieve:
1. **PR Details & Top-Level Data**:
   ```bash
   gh pr view <number> --repo <repo> --json number,title,url,createdAt,updatedAt,reviewRequests,reviews,comments,latestReviews
   ```
2. **Inline Review Comments**:
   ```bash
   gh api repos/<repo>/pulls/<number>/comments --paginate
   ```

### Step 3: Check Merge Protection & Mergify Rules
1. Inspect `comments` on the PR for comments authored by `mergify[bot]` or `mergify`.
2. Check whether the latest Mergify evaluation requires approval from `<reviewer>`:
   - Search for rules like `Require <Name>'s review on ...` or `approved-reviews-by = <reviewer>`.
   - Check if `<reviewer>` is listed in `reviewRequests`.

### Step 4: Categorize PRs
Group all queried PRs into three distinct buckets:

1. **PRs with Recent Feedback from Reviewer**:
   - Contains reviews, comments, or inline comments authored by `<reviewer>`.
   - Extract review state (`CHANGES_REQUESTED`, `COMMENTED`, `APPROVED`).
   - Extract the latest comment/review snippet, timestamp, and referenced files/lines.
   - Note if changes are requested or action items remain.

2. **PRs Awaiting Review from Reviewer (No Comments Yet)**:
   - `<reviewer>` is in `reviewRequests` or required by Mergify merge protections, but has not submitted a review or comment yet.

3. **PRs with No Reviewer Involvement**:
   - `<reviewer>` is neither requested nor required by merge protections, and has left no comments.

---

## Output Format

Present the summary clearly to the user:

```markdown
### 1. PRs with Recent Updates / Comments from `<reviewer>`
- **[#<number>: <title>](<url>)**
  - **Status / Review Decision**: `CHANGES_REQUESTED` | `COMMENTED` | `APPROVED`
  - **Required by Mergify**: Yes / No
  - **Latest Review / Comment (<timestamp>)**:
    > "<snippet of comment / feedback>"
  - **Action Items**: <concrete items to address or whether already resolved>

### 2. PRs Awaiting Review from `<reviewer>`
| PR | Title | Review Requirement |
| :--- | :--- | :--- |
| [#<number>](<url>) | <title> | Required / Requested |

### 3. PRs with No `<reviewer>` Involvement
- [#<number>](<url>) - <title>
```

---

## Common Follow-up Actions

### Resolving Review Feedback
When addressing reviewer comments and pushing updates:
1. Make necessary code/hook adjustments.
2. Verify git diff against `origin/main` (`git diff origin/main -- <file>`).
3. Commit adhering to commitlint rules (`feat:`, `fix:`, `chore:`, etc. with ticket ID).
4. Push branch to remote (`git push`).
5. Post resolution comment to the PR:
   ```bash
   gh pr comment <number> --repo <repo> --body "@<reviewer> resolved in <commit-hash>"
   ```
