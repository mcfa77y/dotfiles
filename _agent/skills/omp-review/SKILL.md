---
name: omp-review
description: Perform a rigorous, multi-faceted code review inspired by oh-my-pi /review with target selection, parallel reviewer subagents, prioritized findings (P0-P3), confidence scores, and structured verdicts.
---

# Code Review Skill (oh-my-pi /review style)

Perform a comprehensive, structured code review using parallel specialized subagents, a prioritized findings matrix (P0–P3), confidence scoring, and explicit verdicts (`APPROVE`, `REQUEST_CHANGES`, `COMMENT`).

---

## 1. Target Scope Selection

First, determine the exact diff target / scope to review:

- **Uncommitted Changes (Working Tree)**: `git diff HEAD` (staged + unstaged modifications)
- **Branch vs. Base**: `git diff $(git merge-base main HEAD)...HEAD` (or `origin/main` / `master`)
- **Specific Commit or Range**: `git show <commit_hash>` or `git diff <base>..<target>`
- **Specific Pull Request**: Use GitHub MCP / git branch comparison

If the target scope is ambiguous or not specified by the user, inspect the git status first with `run_command` (`git status`, `git diff --stat`, `git log -n 5 --oneline`) and default to reviewing uncommitted changes if dirty, or the current branch against its merge-base with `main`.

---

## 2. Gather Changes & Code Context

1. Run `git diff` or `git status` to identify all modified, added, or deleted files.
2. Review relevant surrounding context and imports in the touched files using `read` or `grep`.
3. Check repository guidelines (e.g. `AGENTS.md`, `.commitlintrc.json`, lint/test rules) to ensure project conventions are evaluated.

### Graphify Architectural & Impact Analysis
When `graphify-out/graph.json` exists in the repository root, run Graphify before dispatching reviewers to map blast radius and architectural risk:

1. **Blast Radius Analysis (`graphify affected`)**:
   For every modified exported symbol, service, or interface:
   ```bash
   graphify affected "<SymbolName>"
   ```
   - Identify all downstream callers, imports, and dependent test suites across monorepo workspaces.
   - **Omission Check**: Verify whether any affected callers or test suites were omitted from the PR diff.
2. **Architectural Hub & God Node Check (`graphify god-nodes`)**:
   ```bash
   graphify god-nodes --top 10
   ```
   - Check if touched symbols rank among high-degree architectural hubs (e.g. `UserService`, `DashboardPage`).
   - If a modified symbol is a high-degree hub, raise reviewer scrutiny for regressions, fan-out bugs, and tight coupling.
3. **Layering & Call Path Verification (`graphify path`)**:
   ```bash
   graphify path "<CallerEntrypoint>" "<ModifiedService>"
   ```
   - Verify that execution paths respect boundaries (e.g. Controller → Service → Store) without layer violations.
4. **Context on Unfamiliar Symbols (`graphify explain`)**:
   ```bash
   graphify explain "<SymbolName>"
   ```
   - Inspect symbol type, definition location, community cluster, and immediate connections without reading dozens of raw files.
---

## 3. Delegate to Parallel Reviewer Subagents

To avoid blind spots and maximize depth, spawn specialized subagents via `task` (or evaluate each facet systematically). Supply the **affected callers** and **hub status** discovered via Graphify directly in the subagents' context:
1. **Security & Vulnerability Reviewer**:
   - Injection risks, authentication/authorization checks, secrets exposure.
   - Input validation, boundary checks, concurrency/race conditions, and unsafe operations.
2. **Architecture, Correctness & Logic Reviewer**:
   - Edge cases, error handling, off-by-one errors, state management.
   - API contract changes, backwards compatibility, and unintended side effects.
3. **Performance & Resource Management**:
   - Inefficient algorithms/queries, memory leaks, unclosed resources, redundant re-renders or allocations.
4. **Testing, Maintainability & Standards**:
   - Test coverage for new/modified code paths, edge case testing.
   - Adherence to project conventions, clean naming, and modularity.

---

## 4. Prioritization Matrix & Confidence Scoring

Every finding must be categorized and scored:

### Priority Tiers

- **P0 (Blocker)**: Critical bugs, security vulnerabilities, data loss risks, or major runtime crashes. Must be fixed before merging/proceeding.
- **P1 (High)**: Significant logic flaws, edge-case failures, notable performance bottlenecks, or missing critical tests.
- **P2 (Medium)**: Maintainability issues, minor edge-case oversights, code duplication, or non-optimal patterns.
- **P3 (Nit / Suggestion)**: Code style improvements, naming suggestions, minor cleanup, or docstring clarifications.

### Confidence Scores

- Score each finding from **0% to 100%** (e.g., `Confidence: 95%`) based on certainty. If confidence is below 70%, verify against the codebase or re-check the full file before reporting.

---

## 5. Structured Review Output Format

Render the review results directly in the response using the following structured layout:

```markdown
# 🔍 Code Review: <Target / Branch Name>

## 📊 Summary & Verdict
- **Verdict**: `[APPROVE | REQUEST_CHANGES | COMMENT]`
- **Scope**: `<e.g., branch feature/xyz against main (5 files changed, +120/-45 lines)>`
- **Findings Count**: `X Critical (P0), Y High (P1), Z Medium (P2), N Nits (P3)`
- **Architectural Blast Radius (Graphify)**: `<e.g., 23 downstream callers affected across 3 workspaces; modified hub UserService (166 edges)>`

---

## 🌐 Architectural Impact (Graphify)
*(Include when `graphify-out/graph.json` is available)*
- **Modified Architectural Hubs**: `<Hub name and edge count, or None>`
- **Downstream Consumers Impacted**: `<List of key callers / services>`
- **Omitted Callers / Uncovered Tests**: `<List any affected files missing from the PR diff, or None>`

---

## 🚨 Prioritized Findings

### [P0] <Short finding title>
- **File & Line**: `[path/to/file.ext#L10-L25](file:///path/to/file.ext#L10-L25)`
- **Confidence**: `95%`
- **Category**: `Security / Logic / Performance`
- **Issue**: <Clear description of the problem and potential impact>
- **Suggested Fix**:
```<lang>
// Proposed fix code snippet
```

### [P1] <Short finding title>

...

---

## 💡 Suggestions & Nits (P3)

- [`file.ext:L40`](file:///path/to/file.ext#L40): <Brief suggestion>

---

## 📋 What Went Well

- <List positive aspects: clean abstractions, solid test coverage, idiomatic implementations, etc.>

```

---

## 6. Interactive Next Steps
Conclude the review by offering actionable next steps:
- "Would you like me to automatically fix any of the P0/P1 issues?"
- "Would you like me to generate test cases for the uncovered edge cases?"
