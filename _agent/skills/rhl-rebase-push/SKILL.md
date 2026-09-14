---
name: rhl-rebase-push
description: Rebases the current branch onto origin/main and force-pushes with lease to the remote repository.
---

# RHL Rebase onto origin/main and Push

## Overview
Rebases the current working branch onto the latest `origin/main` and force-pushes with lease to update the remote branch.

## Step-by-Step Procedure

1. **Check Repository Context**:
   - Confirm current directory is inside an `EmpoHealth/core` (or `rhl-*`) repository.
   - Ensure the working tree is clean (`git status --porcelain`). If uncommitted changes exist, ask to commit or stash them before rebasing.

2. **Fetch Latest Main**:
   - Fetch latest updates from remote main:
     ```bash
     git fetch origin main
     ```

3. **Rebase onto `origin/main`**:
   - Execute the rebase:
     ```bash
     git rebase origin/main
     ```
   - **Conflict Handling**: If conflicts occur during rebase:
     - Do not force through invalid merges.
     - Report failing files and conflict details to the user.
     - Provide choices to resolve conflicts or abort via `git rebase --abort`.

4. **Force-Push with Lease**:
   - Check repo rules (e.g. `GEMINI.md`): push with `--no-verify` if changes are strictly infrastructure (`*.tf`, `*.yml`) or git workflow updates.
   - Run safe force-push:
     ```bash
     git push --force-with-lease
     ```
     or (for infra/workflow-only changes):
     ```bash
     git push --force-with-lease --no-verify
     ```
