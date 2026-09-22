---
name: empo-ai-diagnostics
description: "Diagnose Empo AI provider authentication, API connectivity, model health, and replay failed HTTP requests. Use when empo-ai models fail with 400/401/403/502 errors or when checking token expiration."
---

# Empo AI Diagnostics

Use this skill to diagnose and troubleshoot `empo-ai` provider authentication, model availability, upstream Cloudflare Access connectivity, and proxy routing in Oh My Pi (`omp`).

## Diagnostic Scripts

The skill bundles two diagnostic CLI utilities in its `scripts/` directory:

### 1. Provider Health Check & Token Diagnostic
Checks credentials in `~/.omp/agent/agent.db` and legacy stores, verifies expiry, queries available models from `https://ai.empohealth.com/v1/models`, and tests completion endpoints.

```bash
# Run full diagnostic
~/.agents/skills/empo-ai-diagnostics/scripts/diagnose-empo-ai

# Test a specific model
~/.agents/skills/empo-ai-diagnostics/scripts/diagnose-empo-ai --model anthropic/claude-opus-5
```

### 2. HTTP 400 Request Replayer
Replays captured failed requests from `~/.omp/logs/http-400-requests/` against the target proxy or upstream endpoint to inspect raw error messages and Cloudflare WAF / Access responses.

```bash
# Replay the most recent failed request log
~/.agents/skills/empo-ai-diagnostics/scripts/replay-400-request

# Replay a specific request log
~/.agents/skills/empo-ai-diagnostics/scripts/replay-400-request --file ~/.omp/logs/http-400-requests/<filename>.json

# Replay against a different URL (e.g. bypassing headroom proxy)
~/.agents/skills/empo-ai-diagnostics/scripts/replay-400-request --url https://ai.empohealth.com/v1/chat/completions
```

### 3. Model Completion & Tool Calling Matrix
Tests all registered models across direct gateway and Headroom proxy targets for both basic text generation and multi-turn tool calling (checking for `thought_signature` errors).

```bash
# Test all models against direct gateway and Headroom proxy
~/.agents/skills/empo-ai-diagnostics/scripts/test-model-matrix --target both

# Test a specific model
~/.agents/skills/empo-ai-diagnostics/scripts/test-model-matrix --model google/gemini-2.5-pro
```

### 4. Thought Signature & Proxy Inspector
Analyzes captured 400 error logs to inspect tool call payloads, thought signatures, and directly tests whether failures originate in Headroom proxy or upstream gateway.

```bash
# Inspect and replay the latest failed 400 log against both direct and headroom targets
~/.agents/skills/empo-ai-diagnostics/scripts/inspect-thought-signature

# Inspect a specific log file
~/.agents/skills/empo-ai-diagnostics/scripts/inspect-thought-signature --log-file ~/.omp/logs/http-400-requests/<filename>.json
```

### 5. Headless OAuth Token Refresher
Headlessly refreshes expired `empo-ai` OAuth tokens in `~/.omp/agent/agent.db` without needing an interactive browser session.

```bash
~/.agents/skills/empo-ai-diagnostics/scripts/refresh-token
```

### 6. Model Usage & Pricing Inspector
Inspects live token rates from `https://ai.empohealth.com/v1/models`, local Oh My Pi request telemetry from `~/.omp/agent/agent.db`, and estimates spend.

```bash
# View model pricing, request counts, output token volume, and estimated spend
~/.agents/skills/empo-ai-diagnostics/scripts/get-model-usage

# Filter session logs for current week (Monday to today) or last N days
~/.agents/skills/empo-ai-diagnostics/scripts/get-model-usage --week
~/.agents/skills/empo-ai-diagnostics/scripts/get-model-usage --days 7

# Inspect gateway spend limits (Rule 09d3d265: $40/24h), headroom, and derived token capacities
~/.agents/skills/empo-ai-diagnostics/scripts/get-model-usage --capacity

# Filter session logs for a specific month
~/.agents/skills/empo-ai-diagnostics/scripts/get-model-usage --month 2026-08

# Probe live API completion usage reporting (non-streaming and streaming)
~/.agents/skills/empo-ai-diagnostics/scripts/get-model-usage --test-api --model google/gemini-3.8-flash
```

### 7. Remaining Daily Quota Checker
Quickly checks your remaining daily budget against the Cloudflare AI Gateway $40/day spend limit (Rule `09d3d265`), shows a progress bar, and calculates the exact remaining token and turn capacity for today.

```bash
# Formatted report with progress bar and remaining tokens
~/.agents/skills/empo-ai-diagnostics/scripts/check-remaining-quota

# One-line summary for statuslines or quick checks
~/.agents/skills/empo-ai-diagnostics/scripts/check-remaining-quota --quiet

# Machine-readable JSON output
~/.agents/skills/empo-ai-diagnostics/scripts/check-remaining-quota --json
```

## Common Symptoms and Fixes

| Symptom | Probable Cause | Action |
| :--- | :--- | :--- |
| `400 Function call is missing a thought_signature` | Gemini 3.x enforces thought signatures on tool use, but upstream gateway dropped the signature during OpenAI translation | Switch `omp` models to `google/gemini-2.5-pro` or `google/gemini-2.5-flash` in `~/.omp/agent/config.yml.empo-ai`. |
| `invalid_grant: Grant not found` or `Refresh token has expired` | OAuth token expired and refresh token was revoked by Cloudflare Access | Run `/login empo-ai` in your `omp` session or run `refresh-token`. |
| `Error: 400 Request body is not valid JSON` | Cloudflare Access returned an HTML 401/403 error page which the JSON parser rejected | Check auth status with `diagnose-empo-ai`; re-login with `/login empo-ai`. |
| `Cloudflare Error 1010 (Access denied)` | Blocked by Cloudflare WAF due to missing/flagged `User-Agent` header | Ensure requests include a valid standard browser / curl User-Agent. |
| `502 Bad Gateway` on `127.0.0.1:8787` | Headroom proxy received an upstream error from `ai.empohealth.com` | Run `diagnose-empo-ai` to check if the upstream token or route is failing. |

## Auth Storage Architecture

- **Primary Store**: `~/.omp/agent/agent.db` (SQLite table `auth_credentials` with provider `empo-ai`).
- **Legacy Store**: `~/.pi/agent/auth.json`.
- **Issuer URL**: `https://ai.empohealth.com`.
- **OAuth Discovery & Token Endpoint**: `https://empohealth.cloudflareaccess.com`.
