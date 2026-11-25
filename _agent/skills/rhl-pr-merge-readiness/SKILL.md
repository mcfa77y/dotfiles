---
name: rhl-pr-merge-readiness
description: "Inspect open PRs for an author, audit CI checks, reviews, and Mergify status, and rank them by distance to merge."
---

# PR Merge Readiness & Proximity Tracker

Use this skill to inspect open PRs authored by a developer, evaluate CI checks, review approvals, and Mergify queue/protections, and rank them by proximity to being merged.

## Bundled CLI Tool

The skill includes an automated TypeScript CLI script running via Bun:
`~/.omp/agent/skills/rhl-pr-merge-readiness/scripts/pr_merge_readiness.ts`

### Usage Examples

```bash
# Rank all open PRs for mcfa77y on EmpoHealth/core by distance to merge
bun run ~/.omp/agent/skills/rhl-pr-merge-readiness/scripts/pr_merge_readiness.ts

# Inspect another author or repository
bun run ~/.omp/agent/skills/rhl-pr-merge-readiness/scripts/pr_merge_readiness.ts --author <username> --repo EmpoHealth/core

# Output structured JSON for automation or subagents
bun run ~/.omp/agent/skills/rhl-pr-merge-readiness/scripts/pr_merge_readiness.ts --format json
```

### Testing

Run the unit test suite:
```bash
bun test ~/.omp/agent/skills/rhl-pr-merge-readiness/scripts/pr_merge_readiness.spec.ts
```

## Readiness Tiers

1. **`QUEUED`**: Already inside Mergify merge queue undergoing speculative builds or queue checks.
2. **`READY_TO_QUEUE`**: Fully approved, green CI, no conflicts; ready to queue via `@mergifyio queue`.
3. **`CHECKS_PENDING`**: Approved, but awaiting in-progress workflows (e.g. deployments, E2E tests).
4. **`REQUEUE_NEEDED`**: Approved and checks green, but queue was cancelled by a newly pushed commit.
5. **`AWAITING_REVIEW`**: CI is passing, but awaiting peer/QA review approval.
6. **`CI_FAILING`**: CI checks failed and must be resolved before proceeding.
7. **`BLOCKED_OR_CONFLICTING`**: Merge conflicts with base branch or changes requested by reviewer.
8. **`DRAFT`**: Marked as draft / work-in-progress.
