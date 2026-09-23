---
name: rhl-pr-helper
description: >-
  Validates, inspects, and updates GitHub Pull Requests in Empo Health repositories
  to ensure strict compliance with PR title length, setext header formatting,
  Linear ticket references, and Mergify squash merge requirements.
---

# RHL PR Helper

This skill provides utilities and procedural guidance for authoring, verifying, and updating Pull Requests in Empo Health's repositories.

All pull requests in Empo Health are squash merged into `main` by Mergify. The merged commit message is synthesized directly from the **PR title** and **PR description body**. Consequently, CI pipelines enforce strict linting rules on every PR.

---

## PR Formatting Rules

The CI check `Lint PR title and description body` enforces the following rules (defined in `scripts/lint-pull-request.js`):

1. **Title Length**:
   - Must be **72 characters or fewer**.
   - Must start with conventional commit type (`feat:`, `fix:`, `chore:`, etc.).
   - No trailing period.
2. **Body Structure**:
   - Must start with a blank line after the title.
   - Must contain **only** these three sections, in this exact order:
     1. `Detailed Description`
     2. `Relevant Linear Tickets`
     3. `Reviews and Merging`
3. **Headings**:
   - All section headers must use **Setext** level 2 style (underlined with dashes `---`).
   - The underline length must **exactly match** the header length:
     ```markdown
     Detailed Description
     --------------------

     Relevant Linear Tickets
     -----------------------

     Reviews and Merging
     -------------------
     ```
   - No ATX style headings (`#` or `##`) are permitted for top-level sections.
4. **Section Spacing**:
   - Every section except `Reviews and Merging` must start and end with a blank line.
5. **Relevant Linear Tickets Format**:
   - Content must strictly match:
     `This change contributes to [TICKET-ID](, [TICKET-ID])*.`
     e.g., `This change contributes to RHL-4280.` or `This change contributes to RHL-1234, FP-5678.`
6. **Reviews and Merging Section**:
   - Must be left **completely empty** (no text, no comments). Mergify automatically populates this upon merge.

---

## Script Architecture & Language Policy

All automation scripts in this skill must adhere to the following architecture rules:

1. **Language: Plain Node.js JavaScript (`.js`)**:
   - All scripts must be written in standard Node.js ES Modules (`.js`).
   - Do **NOT** use TypeScript (`.ts`) or require compilation / transpilation steps (`tsc`, `tsx`, `ts-node`). Plain JavaScript ensures instant execution, zero npm dependencies, and portable execution across any repo worktree without relying on local project `node_modules` or global tooling.

2. **Mandatory JSDoc Annotations**:
   - All functions, exports, parameters, return values, and data structures must have comprehensive JSDoc comments (`/** ... */`).
   - Use `@typedef` and `@property` for data schemas (e.g. `ValidationResult`, `PullRequestData`, `MarkdownSection`).
   - Use `@param` and `@returns` for all functions to provide complete IDE type safety and autocomplete without runtime friction.

3. **Standard Library & CLI Dependencies Only**:
   - Rely solely on Node.js built-in modules (`node:child_process`, `node:fs`, `node:stream/consumers`, native `fetch`) and the GitHub CLI (`gh`).

---

## Bundled Scripts

The skill provides modular Node.js automation scripts under `./scripts/` (with optional shell shims):

### 1. `lint_pr.js`
Validates any piped commit message or PR markdown file. Exports `validateCommitMessage` and `parseIntoSections` for other scripts.
```bash
node ~/.gemini/config/skills/rhl-pr-helper/scripts/lint_pr.js < message.txt
```

### 2. `check_pr.js` (or `check_pr.sh`)
Fetches a live PR from GitHub via `gh`, verifies title length diagnostics (<= 72 chars), inspects for trailing whitespace/newlines in `Reviews and Merging`, and executes the exact GitHub Actions CI lint pipeline (`printf '%s\n\n%s\n'`).
```bash
node ~/.gemini/config/skills/rhl-pr-helper/scripts/check_pr.js <PR_NUMBER>
# or
~/.gemini/config/skills/rhl-pr-helper/scripts/check_pr.sh <PR_NUMBER>
```

### 3. `update_pr.js` (or `update_pr.sh`)
Validates a local message file, applies it cleanly to GitHub via `gh pr edit` (trimming trailing whitespace to avoid CI failures), and re-validates the PR remotely.
```bash
node ~/.gemini/config/skills/rhl-pr-helper/scripts/update_pr.js <PR_NUMBER> <path_to_message.txt>
# or
~/.gemini/config/skills/rhl-pr-helper/scripts/update_pr.sh <PR_NUMBER> <path_to_message.txt>
```

### 4. `format_pr.js`
Formats, scaffolds, or repairs PR messages into strict Empo Health format (Setext level-2 headers, canonical sections, normalized Linear ticket lines, and empty `Reviews and Merging`). Can directly inspect, repair, and apply to a remote GitHub PR via `--pr <id> [--apply]`.
```bash
# Format local markdown file or draft
node ~/.gemini/config/skills/rhl-pr-helper/scripts/format_pr.js <path_to_message.md>

# Inspect remote PR, format, and display
node ~/.gemini/config/skills/rhl-pr-helper/scripts/format_pr.js --pr <PR_NUMBER>

# Format and automatically update remote PR on GitHub
node ~/.gemini/config/skills/rhl-pr-helper/scripts/format_pr.js --pr <PR_NUMBER> --apply

# Format from explicit title and body
node ~/.gemini/config/skills/rhl-pr-helper/scripts/format_pr.js --title "feat: my change" --body "..."
```

### 5. `fetch_pr_checks.js`
Queries live GitHub PR status, base/head branch stack hierarchy, mergeability (`MERGEABLE` vs `CONFLICTING`), merge state status (`CLEAN`, `BLOCKED`, `DIRTY`), and CI check runs / status rollups via GraphQL.
```bash
# Inside a git repository
node ~/.gemini/config/skills/rhl-pr-helper/scripts/fetch_pr_checks.js <PR_NUMBER>

# Or with full URL or repo path
node ~/.gemini/config/skills/rhl-pr-helper/scripts/fetch_pr_checks.js https://github.com/<owner>/<repo>/pull/<PR_NUMBER>
node ~/.gemini/config/skills/rhl-pr-helper/scripts/fetch_pr_checks.js <owner/repo> <PR_NUMBER> --format json
```

---

## Standard Template

```markdown
<type>: <subject <= 72 chars> (TICKET-ID)

Detailed Description
--------------------

### Problem
[Description of the bug or requirement]

### Solution
[Details of code changes]

### Verification
[Local test steps, automated test passes]

Relevant Linear Tickets
-----------------------

This change contributes to RHL-XXXX.

Reviews and Merging
-------------------
```
