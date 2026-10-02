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

The CI check `Lint PR title and description body` enforces these rules (defined in `scripts/lint-pull-request.js`):

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
   - No ATX style headings (`#` or `##`) are permitted for top-level sections (use `###` level 3 subsections inside `Detailed Description`).
4. **Section Spacing**:
   - Every section except `Reviews and Merging` must start and end with a blank line.
5. **Linear Tickets Format**:
   - Must match: `This change contributes to [TICKET-ID](, [TICKET-ID])*.`
   - e.g., `This change contributes to RHL-4280.` or `This change contributes to RHL-1234, FP-5678.`
6. **Reviews and Merging**:
   - Must be left empty (auto-populated by Mergify upon squash-merge).

---

## Script Architecture & CLI Standards

All helper tools in this skill follow modern CLI and Bun runtime standards:

1. **Runtime & Language**:
   - TypeScript executed directly via [Bun](https://bun.sh/) (`bun run <script>.ts`).
   - Built-in test suite powered by `bun test` in `*.spec.ts`.
2. **CLI Experience**:
   - Robust argument parsing, flag handling, validation, and rich examples using `commander`.
   - Comprehensive `--help` documentation on all commands.
3. **Bun Standard Libraries**:
   - Standard shell execution via `Bun.$`.
   - Native file I/O via `Bun.file()` and `Bun.write()`.
   - Standard stream consumption via `Bun.stdin.text()`.

---

## Bundled Scripts

The skill provides modular TypeScript CLI tools under `./scripts/`:

### 1. `lint_pr.ts`
Validates any piped commit message or PR markdown file.
```bash
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/lint_pr.ts message.txt
# or via stdin
git log -1 --pretty=%B | bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/lint_pr.ts
```

### 2. `check_pr.ts`
Fetches a live PR from GitHub via `gh`, verifies title character diagnostics (<= 72 chars), inspects for trailing whitespace/newlines in `Reviews and Merging`, and executes the exact GitHub Actions CI lint pipeline.
```bash
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/check_pr.ts <PR_NUMBER_OR_URL>
```

### 3. `update_pr.ts`
Validates a local message file, applies it cleanly to GitHub via `gh pr edit` (trimming trailing whitespace to prevent CI errors), and re-validates the PR remotely.
```bash
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/update_pr.ts <PR_NUMBER_OR_URL> <path_to_message.txt>
```

### 4. `format_pr.ts`
Formats, scaffolds, or normalizes any PR title/body into strict Empo Health format. Can format local files, convert level 1/2 headings to level 3, or fetch and directly update a remote GitHub PR via `--pr [--apply]`.
```bash
# Format a local markdown file and print to stdout
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/format_pr.ts <path_to_message.md>

# Fetch remote PR, format, and preview
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/format_pr.ts --pr <PR_NUMBER>

# Format and automatically update remote PR on GitHub
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/format_pr.ts --pr <PR_NUMBER> --apply

# Format with explicit title and body
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/format_pr.ts --title "feat: my change" --body "..."
```

### 5. `fetch_pr_checks.ts`
Queries live GitHub PR status, commit SHA, merge state, and all CI check runs and commit status rollups via GraphQL.
```bash
# Inside git repository
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/fetch_pr_checks.ts <PR_NUMBER>

# With full URL or repo path
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/fetch_pr_checks.ts https://github.com/<owner>/<repo>/pull/<PR_NUMBER>

# Output machine-readable JSON
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/fetch_pr_checks.ts <PR_NUMBER> --format json
```

### 6. `reopen_pr.ts`
Bounces a PR (close followed immediately by reopen) to force GitHub Actions to re-run CI workflows without pushing empty commits.
```bash
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/reopen_pr.ts <PR_NUMBER_OR_URL>
```

### 7. `create_pr.ts`
Validates title and body formatting against Empo Health standards, auto-detects infrastructure changes to assign reviewers, and creates a draft or ready PR via `gh pr create`.
```bash
# Create a draft PR using a prepared message file
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/create_pr.ts <path_to_message.txt>

# Create ready-for-review (non-draft) PR
bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/create_pr.ts --no-draft <path_to_message.txt>

# Pipe via stdin
cat <path_to_message.txt> | bun run ~/.gemini/config/skills/rhl-pr-helper/scripts/create_pr.ts
```

---

## Standard PR Template

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
