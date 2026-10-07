---
name: rhl-ticket-to-pr
description: End-to-end development workflow for Empo Health (RHL) spanning Linear ticket creation, worktree isolation, interactive grilling & planning, implementation, draft PR creation, automated code review (/review or /omp-review), issue remediation, and final PR publication.
---

# RHL Ticket-to-PR Workflow

An end-to-end guided lifecycle skill that takes a task from initial concept or working diff through Linear ticket creation, isolated worktree development, interactive design grilling, implementation, draft PR review, and final submission.

## Guided Checkpoints

This skill operates in **guided checkpoints**:
1. **Grill First**: Stress-test assumptions and design decisions before writing implementation code.
2. **Plan Sign-Off**: Confirm the implementation plan with the user before executing.
3. **Draft Review**: Run code review on draft PR, present review findings, and ask clarifying questions on ambiguous fixes before applying changes.
4. **Final Gate**: Confirm all checks pass and PR linting succeeds before marking ready for review.

---

## Step 1: Verify Repository & Determine Starting Context

1. **Verify repository**: Confirm that the git remote matches `https://github.com/EmpoHealth/core` (or `git@github.com:EmpoHealth/core.git`). Abort if outside this repository.
2. **Inspect Starting Context**:
   - **Code-first**: Check if there are unstaged or staged modifications in the current directory (`git status --porcelain`). If changes exist, analyze `git diff HEAD` to extract the scope.
   - **Prompt-first**: If the working tree is clean, extract the feature or bug specification from the user's prompt.

---

## Step 2: Create Linear Ticket

1. **Draft Title & Description**:
   - Write a clear title and structured description (Overview, User Impact, Technical Requirements, Acceptance Criteria).
   - Write content to a temporary scratch file (e.g., `docs/temp-ticket-desc.md` or `<appDataDir>/brain/<conversation-id>/scratch/ticket-desc.md`).
2. **Create Ticket**:
   - Call `mcp__linear-mcp-server__save_issue` (or `linear issue create` CLI fallback) using the `RHL` team (`4670d896-c578-43a1-b8cf-50043d74d669`) and `In Progress` status (`783efcac-f56e-4732-ba56-45f68ded7961`).
   - Remove the temporary scratch file once created.
   - Extract the generated issue identifier (e.g., `RHL-4485`).

---

## Step 3: Create & Switch to Worktree

1. **Stash Uncommitted Changes** (if starting code-first):
   ```bash
   git stash push --include-untracked -m "stash-for-<lowercase-ticket-id>"
   ```
2. **Create and Switch Worktree**:
   - Worktree name format: `<lowercase-ticket-id>-<short-slug>` (e.g., `rhl-4485-fix-lint-runs`).
   ```bash
   wt switch --create <branch-name>
   ```
3. **Pop Stash** (if stashed in Step 3.1):
   ```bash
   git stash pop
   ```

---

## Step 4: Grill Me (Stress-Test Plan)

1. **Invoke Grilling Skill**:
   - Reference the Linear ticket ID, requirements, and codebase facts.
   - Map out the **design tree** and identify unsettled architectural or business logic assumptions.
2. **Present Frontier Questions**:
   - Use the interactive question tool (`ask_question` in Antigravity or `ask` in other harnesses) to group open decisions into a single interactive round with recommended options.
3. **Finalize Implementation Plan**:
   - Formulate a clear, step-by-step implementation plan.
   - Present the plan and obtain user confirmation before writing code.

---

## Step 5: Implement Plan & Local Verification

1. **Implement Changes**:
   - Write production code adhering to repository conventions and typing rules.
   - Follow user rules:
     - Use `fd` instead of `find` and `rg` instead of `grep`.
     - Write temporary scripts to disk (`<appDataDir>/brain/<conversation-id>/scratch/` or `/tmp/`).
2. **Local Validation**:
   - Run relevant unit/integration tests and typecheck.
   - Ensure local dev helper files (`docs/*`, `playwright.config.ts`, `docker-compose.yml`, `test-setup.helper.ts`) are excluded from commits.

---

## Step 6: Create Draft Pull Request

1. **Commit Working Changes**:
   - Follow `.commitlintrc.json` rules (lowercase type, sentence-case subject, max length 72, no trailing period).
   - **Do NOT manually include the ticket ID in the commit message**; the `prepare-commit-msg` git hook automatically extracts it from the branch name.
   - Push to remote:
     ```bash
     git push -u origin HEAD
     ```
2. **Draft PR Title & Body**:
   - **PR Title**: Must not exceed 72 characters:
     `<type>: <Subject> (<TICKET-ID>)` (e.g., `fix: Prevent redundant merge-queue PR linting (RHL-4485)`).
   - **PR Body**: Must follow the 3 Level 2 Setext headers matching `/Users/joe/.gemini/config/skills/rhl-pr-helper/scripts/lint_pr.ts` (or repo's `scripts/lint-pull-request.js`):
     ```markdown
     Detailed Description
     --------------------

     <High-level summary, architecture changes, and verification details>

     Relevant Linear Tickets
     -----------------------

     This change contributes to <TICKET-ID>.

     Reviews and Merging
     -------------------
     ```
   - Validate formatting locally:
     ```bash
     bun run /Users/joe/.gemini/config/skills/rhl-pr-helper/scripts/lint_pr.ts --string "<Title>

<Body>"
     ```
     *(Or pipe via stdin: `printf '%s\n\n%s\n' "<Title>" "<Body>" | bun run /Users/joe/.gemini/config/skills/rhl-pr-helper/scripts/lint_pr.ts`)*
3. **Publish Draft PR**:
   - Baseline reviewers: `pm-pp`, `simon57b`, `singhmadhurima123`, `jofay-empo` (add `edahlseng` if touching `*.tf`, `*.yml`, or `*.yaml`).
   ```bash
   gh pr create --draft --title "<Title>" --body "<Body>" --reviewer "<Reviewers>"
   ```

---

## Step 7: Rigorous Code Review

Determine the active harness and execute the appropriate review workflow:

- **Oh My Pi (`omp`) Harness**:
  - Run the native `/review` command:
    ```bash
    /review
    ```
- **Antigravity (`agy`) / Non-OMP Harness**:
  - Activate the `omp-review` skill (`/omp-review`).
  - Target the PR branch diff against `origin/main`.
  - Review across correctness, security, performance, test coverage, and blast radius.

---

## Step 8: Remediate Findings & Clarify

1. **Triage Review Findings**:
   - **P0 / P1 (Blockers/Bugs)**: Auto-fix immediately.
   - **P2 / P3 (Improvements/Suggestions)** or ambiguous items: Use interactive questions (`ask_question`) to clarify intent or confirm trade-offs with the user.
2. **Apply Fixes & Verify**:
   - Implement the agreed-upon corrections.
   - Re-run test suites and linter to verify regressions are avoided.

---

## Step 9: Commit & Push Remediations

1. Stage modified files (excluding local helper configs).
2. Commit with conventional commit message (`fix: Address review feedback on ...`).
3. Push to remote:
   ```bash
   git push
   ```
   *(Use `git push --no-verify` ONLY if changes are strictly infrastructure e.g. `*.tf`, `*.yml`)*.

---

## Step 10: Mark PR Ready & Update Description

1. **Verify PR Linting**:
   - Check PR title length (<= 72 chars).
   - Ensure the PR description reflects any architectural shifts introduced during review fixes.
   - Re-validate with `bun run /Users/joe/.gemini/config/skills/rhl-pr-helper/scripts/lint_pr.ts --string "<Title>\n\n<Body>"`.
2. **Update PR Metadata**:
   ```bash
   gh pr edit --title "<Updated Title>" --body "<Updated Body>"
   ```
3. **Mark PR as Ready for Review**:
   ```bash
   gh pr ready
   ```
4. **Notify User**: Provide the final PR link and Linear ticket status summary.

---

## Reference Linear Configuration

Default entities for `empo-health` Linear workspace:
- **Team**: `Remote Health Link` (`RHL`) — ID: `4670d896-c578-43a1-b8cf-50043d74d669`
- **Default Project**: `QA Project` — ID: `c8f35a99-2b16-41a9-ae0f-48e32dbd4237`
- **In Progress State ID**: `783efcac-f56e-4732-ba56-45f68ded7961`
- **In Review State ID**: `cfbdf80e-c7d2-41e2-ba56-cfd16ccee9f0`
- **Assignee**: Joe Lau (`fad7aa89-be83-4fd3-bce8-7e9d577a16e1`)
