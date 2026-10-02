---
name: promote-script
description: WHEN harvesting ad-hoc commands or scripts from recent turns; WHEN promoting throwaway automation into reusable scripts or skills; WHEN refactoring legacy shell, python, or CommonJS scripts into modern TypeScript (Bun + Commander) tools with automated tests.
---

# Script & Tool Promoter / Modernizer

Evaluate ad-hoc commands, throwaway scripts, multi-step terminal pipelines, or existing legacy scripts (Bash, Python, CommonJS), then parameterize, refactor, and promote them into reusable, well-tested TypeScript tools within repository workspaces or agent skills.

## When to Use

1. **On-Demand Harvesting**: When the user requests evaluating, harvesting, or promoting scripts used during recent tasks.
2. **Legacy Script Modernization**: When refactoring or upgrading legacy Python (`.py`), shell (`.sh`), or CommonJS (`.cjs`, `.js`) scripts in skills or packages to modern TypeScript.
3. **Proactive Promotion**: When an ad-hoc script or complex terminal pipeline created during a task exhibits clear multi-turn, multi-developer, or CI utility.

---

## Modernization & Promotion Standards

### Language, Tooling & Quality Standards

Always standardize on:
1. **TypeScript with Bun**: First choice for all automation and skill scripts.
   - Runtime: `bun run <script>.ts` with shebang `#!/usr/bin/env bun`.
   - CLI Engine: `commander` (installed globally or via workspace `package.json`).
   - Standard APIs: Prefer native Bun APIs (`Bun.file`, `Bun.write`, `Bun.$`, `bun:sqlite`) over Node.js equivalents.
   - Testing: `bun test` with `*.spec.ts` unit/integration test suites.
2. **Linter & Formatter Tooling**:
   - **Biome**: Primary code formatter and fast linter (`bun run format`, `bun run lint:biome`).
   - **Oxlint**: Deep AST static code analysis (`bun run lint:oxlint`).
   - **SonarQube / SonarCloud**: Static analysis and quality gate runner via `sonar-project.properties` (`bun run sonar`).
   - **Pre-commit Automation**: `.githooks/pre-commit` automatically runs `bun run check` on staged skills changes.
3. **Python**: Second choice only when TypeScript/Bun is unsuitable (e.g., ML models, heavy scientific Python libraries).
4. **Shell**: Last resort, only for trivial 1–2 line commands with zero logic or dependencies.
---

## Promotion & Refactoring Protocols

### Workflow A: Modernizing Existing Skill / Workspace Scripts

When refactoring a skill's scripts directory:
1. **Audit & Inventory**: Identify all scripts (`.py`, `.sh`, `.cjs`, `.js`) in the target skill directory (`<skill>/scripts/`).
2. **Workspace Registration**: All skills participate in the root `_agent/skills/package.json` Bun workspace (`"workspaces": ["*"]`). New shared dependencies belong at `_agent/skills/package.json`.
3. **Refactor to TypeScript**:
   - Write clean, type-safe `<script>.ts` implementing `commander` CLI with descriptive options, arguments, and `--help` examples.
   - Use `Bun.$` for subprocess execution, `Bun.file()` for file I/O, `fetch` for HTTP queries.
   - Set executable permissions: `chmod +x scripts/<script>.ts`.
4. **Add Unit Tests**: Write `<script>.spec.ts` exercising parameter parsing, data extraction, formatters, and edge cases. Verify locally or from root via `bun test`.
5. **Clean Legacy Code**: Delete superseded `.py`, `.sh`, `.cjs`, and `.js` files to eliminate maintenance drift.
6. **Update SKILL.md**: Update the skill's documentation to reflect the new `bun run scripts/<script>.ts` commands, flag names, and capabilities.
7. **Atomic Git Commit**: Commit the refactored skill with descriptive conventional commit:
   ```bash
   git commit -m "feat(skills): refactor <skill-name> scripts to TypeScript with Bun and Commander"
   ```
### Workflow B: Harvesting Ad-Hoc Scripts from Conversation

1. **Inspect Transcript**: Review executed one-off scripts, piped bash commands, or multi-step database/API operations.
2. **Tier Selection**:
   - **Tier 1 (Lightweight / Local helper)**: Self-contained, positional args/flags, docstrings.
   - **Tier 2 (Production / CI / Destructive Tooling)**: `commander` CLI, `--dry-run` flag, environment guards, unit tests (`*.spec.ts`).
3. **Target Placement**:
   - Monorepo package: `workspaces/<package>/scripts/` or `scripts/`.
   - Skill bundle: `~/.omp/agent/skills/<skill-name>/scripts/` or `dotfiles/_agent/skills/<skill-name>/scripts/`.
4. **Verify & Document**: Run `bun test`, test with `--help` and `--dry-run`, and document in the target `SKILL.md` or `README.md`.
