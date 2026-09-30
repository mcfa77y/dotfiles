---
name: promote-script
description: WHEN harvesting ad-hoc commands or scripts from recent turns; WHEN promoting throwaway automation into reusable scripts or skills.
---

# Script & Tool Promoter

Evaluate ad-hoc commands, throwaway scripts, and multi-step terminal pipelines from recent conversation turns, then parameterize and promote them into reusable, well-tested scripts within repository workspaces or agent skills.

## When to Use

1. **On-Demand**: When the user requests evaluating, harvesting, or promoting scripts used in recent work.
2. **Proactive**: When an ad-hoc script or complex terminal pipeline was created/executed during a task and exhibits clear multi-turn, multi-developer, or CI utility.

---

## Promotion Workflow

```
[Harvest Candidate] ──> [Evaluate & Tier] ──> [Parameterize & Harden] ──> [Target Placement] ──> [Verify & Document]
```

### Step 1: Harvest Candidate
Inspect the recent conversation transcript or modified files for:
- One-off scripts (e.g., node, ts-node, bash, python).
- Multi-command shell pipelines chained across turns (e.g., Infisical secret fetching + db queries + API cleanup).
- Data migration, resource cleanup, or environment sync logic.

### Step 2: Evaluate & Select Tier
Assess candidate against the tiered promotion criteria:

| Tier | When to Choose | Requirements |
|---|---|---|
| **Tier 1: Lightweight Automation** | Agent-specific tasks, developer diagnostics, local helpers | Self-contained, positional args or env vars, clear usage docstring, zero unnecessary dependencies. |
| **Tier 2: Production Tooling & CI** | Shared team use, CI workflows, destructive/cleanup operations | CLI parser (`commander`), `--dry-run` flag, environment guards (protected tag/branch rejection), error handling, and unit test suite (`*.spec.ts`). |


### Language Preference
When promoting scripts, prefer the following language order:

1. **TypeScript (with Bun)**: First choice for all new scripts. Use `bun` runtime, `bun test` for testing, and `commander` for CLI parsing. Leverage Bun's built-in APIs (SQLite, Redis, WebSocket, file I/O) instead of Node.js equivalents.
2. **Python**: Second choice when TypeScript/Bun is not suitable (e.g., data science, ML workflows, or existing Python ecosystem dependencies).
3. **Shell**: Last resort, only for trivial one-liners or when no runtime dependencies are needed. Prefer TypeScript for anything beyond simple command chaining.

**Rationale**: TypeScript with Bun provides type safety, fast execution, and built-in tooling, reducing long-term maintenance burden. Python offers strong ecosystem support for specialized domains. Shell scripts are fragile and hard to test; reserve for truly simple cases.
### Step 3: Parameterize & Harden
Refactor hardcoded values into configurable options (following language preference above):
1. **TypeScript (Bun)**: Use `commander` for CLI parsing, `bun test` for unit tests, and Bun's built-in APIs (e.g., `bun:sqlite`, `Bun.file`) instead of Node.js equivalents.
2. **Python**: Use `argparse` or `click` for CLI parsing, `pytest` for unit tests.
3. **Shell**: Use `getopts` or positional args; avoid complex parsing in shell.

Common hardening requirements (apply to all languages):
1. **Inputs**: Replace hardcoded IDs, PR numbers, URLs, and tags with CLI flags/arguments.
2. **Destructive Actions**: Add `--dry-run` flag so users can preview affected resources before mutations.
3. **Safety Guards**: Guard against running on production, staging, or default environments unless explicitly overridden.
4. **Environment Fallbacks**: Prefer CLI flags with fallbacks to environment variables (e.g. `--api-key` falling back to `LINEAR_API_KEY`).
5. **No Blind Any**: Use typed interfaces or explicit type narrowing in TypeScript; avoid unchecked casts.

### Step 4: Determine Target Placement
Choose placement based on target consumers:

- **Repository Workspace** (`workspaces/<package>/scripts/` or `scripts/`):
  - Target: Team developers, CI workflows, or build/deploy pipelines.
  - Also register npm/yarn script shortcut in `package.json` if common.
- **Skill Bundle** (`~/.omp/agent/managed-skills/<skill-name>/scripts/` or inline in `SKILL.md`):
  - Target: Agent-specific automations, harnesses, code review helpers, or diagnostic routines.
  - Update or create the corresponding skill using `manage_skill`.

### Step 5: Verify & Document
1. Run automated tests (or author unit test spec for Tier 2 scripts).
2. Execute a smoke run with `--dry-run` or `--help` to confirm CLI interface.
3. Document invocation commands, options, and prerequisite secrets in the target skill's `SKILL.md` or repository `README.md`.
