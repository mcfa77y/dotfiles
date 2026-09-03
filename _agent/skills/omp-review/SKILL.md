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
2. Review relevant surrounding context and imports in the touched files using `view_file` or `grep_search`.
3. Check repository guidelines (e.g. `AGENTS.md`, `.commitlintrc.json`, lint/test rules) to ensure project conventions are evaluated.

---

## 3. Delegate to Parallel Reviewer Subagents

To avoid blind spots and maximize depth, spawn specialized subagents via `invoke_subagent` (or evaluate each facet systematically):

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
