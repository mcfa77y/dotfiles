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
If multiple jobs failed (✗), investigate each one:
```bash
gh run view <RUN_ID> --log-failed --repo EmpoHealth/core
```
The `--log-failed` flag returns logs for all failed jobs, prefixed by job name. Parse the output to separate failures by job. For each failed job:
- Identify the failing step.
- Extract error messages, stack traces, and assertion details.
- Classify the failure independently.

### 4. Fetch Additional Job Details (if needed)
For structured job data or when `--log-failed` output is truncated:
```bash
gh api repos/EmpoHealth/core/actions/runs/<RUN_ID>/jobs
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

### 6. Trace Root Cause
- Read the failing test file and its helpers/imports in the local worktree.
- Trace mock data generation (faker usage, random seeds).
- Compare the test's expected-value computation path vs the actual component's rendering path.
- Check if the failure is reproducible by running the test locally.
- Grep for all call sites of any helper function involved in the failure.
- For each failed job, trace independently — different jobs may have different root causes.

### 7. Write Investigation Report
Write to `docs/investigation-<RUN_ID>.md` (e.g., `docs/investigation-31422240846.md`).

This skill only documents findings — it does not auto-fix or create tickets.

#### Report Structure

```markdown
# GitHub Action Pipeline Failure Investigation

## Pipeline Overview
- Repository, PR, workflow, run ID, run URL.
- List all jobs with pass/fail status.

## Failure Details
For each failed job:
- Job name, job ID, failing step name.
- Summary (X passed, Y failed out of N total).
- Failed test case (file, line, test title, browser env).
- Failure log excerpt (expected vs actual, stack trace).

## Root Cause Analysis
For each failure:
- Nature (deterministic vs flaky).
- Chain of events (step-by-step trace from data generation to assertion).
- Why it manifests (which specific condition triggers the mismatch).

## Recommended Remediation
- 2-3 concrete options ranked by safety/simplicity.
- Verification steps.
```

### 8. Verify Findings
- Read the actual source files referenced in the logs to confirm line numbers and logic.
- Grep for duplicate call sites or shared helpers that may need the same fix.
- Do NOT claim a fix without running the test locally.
- This skill produces documentation only — no code changes, no ticket creation.

## Key Tools & Helper Scripts
- `gh run view <ID>` — run overview with job statuses.
- `gh run view <ID> --log-failed` — failed step logs for all failed jobs.
- `gh run view <ID> --log` — full logs (use sparingly, very large).
- `gh api repos/EmpoHealth/core/actions/runs/<ID>/jobs` — structured job data.
- `scripts/inspect_cache.py` — inspect repo cache quota (10 GiB limit), active entries by category/ref, and diagnose `actions/cache` key version conflicts (e.g. `scripts/inspect_cache.py --key node-modules`).
- `scripts/validate_yaml.py` — validate workflow YAML syntax and basic GitHub Actions schema (e.g. `scripts/validate_yaml.py .github/workflows/`).
- Local `grep`/`read` — trace source files in the worktree.

## Common RHL CI Patterns
- **Frontend tests:** Vitest + Playwright browser mode in `workspaces/frontend-app`. Run with `yarn test`.
- **Backend tests:** Jest in `workspaces/backend-api`. Run with `yarn test`.
- **E2E tests:** Jest with `test:e2e` script, Docker-based. Run with `yarn test:e2e`.
- **Secrets:** Infisical CLI injects env vars at runtime. Missing secret = check Infisical project ID and identity.
- **Dependency & Cache Management:**
  - `actions/cache` scopes keys by runner OS, workspace prefix, and lockfile hash (`${{ runner.os }}-<workspace>-node-modules-${{ hashFiles('yarn.lock') }}`).
  - Each workspace must namespace its cache keys because GitHub Actions computes a hidden `version` hash from the cached `path` list. Sharing identical keys across different path sets results in silent cache misses.
  - Push workflows to `main` should seed the primary cache so PR branches get immediate hits.
  - Quota is 10 GiB per repo; exceeding it triggers aggressive LRU eviction.
- **Ephemeral environments:** PR-triggered deployments to `*.staging.empohealth.com`. Webhook management via `manage-linear-ephemeral-webhook.ts`.
- **Flaky test sources:** `faker.phone.number()`, `faker.helpers.arrayElement()`, `faker.date.*` — any faker call without a fixed seed can produce non-deterministic failures.
- **Workflow coverage:** The skill handles any workflow the user provides via GitHub URL — frontend, backend, E2E, deploy, or custom workflows.
