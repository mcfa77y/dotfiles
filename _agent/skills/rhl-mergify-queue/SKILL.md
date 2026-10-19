---
name: rhl-mergify-queue
description: >-
  Inspects open pull requests in Empo Health repositories against Mergify merge protections,
  CI check status, review approvals, and PR formatting standards. Generates structured readiness reports
  and queues eligible PRs to Mergify.
---

# RHL Mergify Queue

This skill provides utilities to audit open pull requests in Empo Health repositories (e.g., `EmpoHealth/core`), assess their readiness for Mergify squash merging according to repository merge protections, and queue eligible PRs via `@mergifyio queue` or the `queued` label.

---

## Readiness Criteria

A PR is considered **READY** to enter the Mergify merge queue when:
1. **Non-Draft**: PR is not in draft state.
2. **Mergeable**: GitHub indicates `MERGEABLE` with no merge conflicts against `main`.
3. **Approvals**: `reviewDecision` is `APPROVED` with 0 change requests, including any required code owner approvals (e.g., QA for frontend/backend/qa changes, Eric/Anuj for SAAS/repo config).
4. **CI Checks**:
   - `Mergify Merge Protections` check passes (`SUCCESS`).
   - All required build, test, and lint workflow checks pass (`SUCCESS`).
5. **PR Title & Body Format**:
   - Conventional commit title (`feat:`, `fix:`, etc.) $\le$ 72 characters with no trailing period.
   - Setext level 2 headings for `Detailed Description`, `Relevant Linear Tickets`, and `Reviews and Merging`.
   - Linear ticket reference matching `This change contributes to RHL-XXXX.`.
   - `Reviews and Merging` section left completely blank (auto-filled on merge).

---

## Bundled CLI Tool

The primary tool is located at:
`~/.gemini/config/skills/rhl-mergify-queue/scripts/queue_prs.ts`

### 1. Inspect PR Readiness
Audit open PRs for a specific author or repository:
```bash
# Audit open PRs for the current user
bun run ~/.gemini/config/skills/rhl-mergify-queue/scripts/queue_prs.ts

# Audit open PRs for a specific author and repository
bun run ~/.gemini/config/skills/rhl-mergify-queue/scripts/queue_prs.ts --repo EmpoHealth/core --author mcfa77y

# Output Markdown report table (ideal for agent responses)
bun run ~/.gemini/config/skills/rhl-mergify-queue/scripts/queue_prs.ts --format markdown

# Output structured JSON
bun run ~/.gemini/config/skills/rhl-mergify-queue/scripts/queue_prs.ts --format json
```

### 2. Queue a Pull Request
Queue a specific PR or all verified ready PRs:
```bash
# Queue a specific PR by number
bun run ~/.gemini/config/skills/rhl-mergify-queue/scripts/queue_prs.ts --queue 3003

# Automatically queue all PRs verified as READY
bun run ~/.gemini/config/skills/rhl-mergify-queue/scripts/queue_prs.ts --queue-all-ready
```

---

## Testing

The skill includes automated tests executed via `bun test`:
```bash
bun test ~/.gemini/config/skills/rhl-mergify-queue/scripts/queue_prs.spec.ts
```
