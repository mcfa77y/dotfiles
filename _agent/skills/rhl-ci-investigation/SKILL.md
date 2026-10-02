---
name: rhl-ci-investigation
description: "Investigate failing GitHub Actions CI pipelines in RHL/EmpoHealth repositories. Use when a GitHub Actions run fails and you need to diagnose the root cause, extract failing test details, and produce a structured investigation report. Covers gh CLI log retrieval, multi-job failure handling, failure classification (test regression, flaky test, infra/secret issue), and standardized docs/investigation-RUN_ID.md output. Documentation only — no auto-fix or ticket creation."
---

# RHL CI Pipeline Investigation

## When to Use
- A GitHub Actions run fails in an `EmpoHealth/core` (or `rhl-*`) repository.
- You need to diagnose the root cause and produce a structured report.
- The user provides a GitHub Actions run URL or run ID.

## Prerequisites
- `gh` CLI authenticated with access to `EmpoHealth/core`.
- Working directory is an RHL worktree or the core repo checkout.

## Step-by-Step Protocol

### 1. Extract Run ID from User Input
The user provides a GitHub Actions URL like:
```
https://github.com/EmpoHealth/core/actions/runs/<RUN_ID>/job/<JOB_ID>
```
Extract the run ID from the URL path. The job ID is optional — the skill handles all failed jobs in the run.

### 2. Fetch Run Overview
```bash
gh run view <RUN_ID> --repo EmpoHealth/core
```
Identify:
- Workflow name, PR number, trigger event.
- Which jobs passed (✓) vs failed (✗).
- All failing jobs (not just the first one).

### 3. Handle Multi-Job Failures
If multiple jobs failed (✗), investigate each one.

> [!TIP]
> **Preferred Method:** Use `scripts/fetch_failed_logs.ts`.
> Unlike `gh run view --log-failed` (which fails with `"run is still in progress"` if any matrix or teardown jobs are still active), `fetch_failed_logs.ts` queries `gh api` per job and works immediately even on in-progress runs, separates logs by job into clean files, and parses Playwright assertion errors automatically:
> ```bash
> # Fetch and parse all failed jobs for a run:
> bun run scripts/fetch_failed_logs.ts --run-id <RUN_ID>
>
> # Target a single job or URL:
> bun run scripts/fetch_failed_logs.ts --run-id "<URL>"
>
> # Also download qa-pr-report artifacts (with error-context.md page snapshots):
> bun run scripts/fetch_failed_logs.ts --run-id <RUN_ID> --download-artifacts
> ```

**Alternative CLI fallback (completed runs only):**
```bash
gh run view <RUN_ID> --log-failed --repo EmpoHealth/core
```

### 4. Additional Diagnostic Tools
```bash
# Decompress and parse Vitest HTML metadata report:
bun run scripts/parse_vitest_results.ts

# Inspect cache quotas, collisions, and sizes:
bun run scripts/inspect_cache.ts --details

# Validate workflow YAML syntax:
bun run scripts/validate_yaml.ts .github/workflows/
```

### 5. Classify Each Failure
Determine which category each failure falls into:

| Category | Indicators |
|---|---|
| **Test Regression** | A specific test assertion fails with a deterministic expected-vs-actual mismatch. Reproducible on every run. |
| **Flaky Test** | Failure involves random data generation (faker, Math.random), timing issues, or "Matcher did not succeed in time". Passes on re-run. |
| **Build/Compile Error** | TypeScript compilation errors, missing imports, webpack/vite build failures. |
| **Infrastructure/Secret** | Missing env vars, Infisical injection failures, AWS credential errors, `Forbidden` API errors. |
| **Cache Miss / Quota** | `actions/cache` misses despite matching keys (path version hash mismatch), "Unable to reserve cache", or LRU eviction due to exceeding 10 GiB limit. |
| **Timeout/OOM** | Job killed by GitHub runner, "The operation was canceled", excessive memory usage. |

### 6. Produce Investigation Report
Save the final report in `docs/investigation-<RUN_ID>.md`.
