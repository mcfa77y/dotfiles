---
name: rhl-rebase-push
description: Rebases current branch onto origin/main and force-pushes with lease to the remote repository.
---

# RHL Rebase onto origin/main & Push

## Overview
Rebases the current working branch onto the latest `origin/main` and force-pushes with lease to update the remote branch.

## Step-by-Step Procedure

1. **Check Repository Context**:
   - Confirm current directory is inside an `EmpoHealth/core` (or `rhl-*`) repository.
   - Ensure working tree is clean (`git status --porcelain`). If uncommitted changes exist, ask to commit or stash before rebasing.

2. **Fetch Latest Main**:
   - Fetch latest updates from remote main:
     ```bash
     git fetch origin main
     ```

3. **Rebase onto `origin/main`**:
   - Execute rebase:
     ```bash
     git rebase origin/main
     ```
   - **Conflict Handling**: If conflicts occur during rebase:
     - **Yarn Lockfile Conflicts**: If `yarn.lock` files are conflicted (monorepo root or isolated sub-workspaces), use the automated helper:
       ```bash
       bun run scripts/resolve_yarn_lock_conflicts.ts --continue
       ```
       This safely shelves unrelated unstaged edits (preventing git rebase aborts), runs `yarn install` to let Yarn auto-resolve lockfile markers, stages the resolved lockfile(s), and advances the rebase.
     - **Other Code Conflicts**: Do not force through invalid merges. Report failing files and conflict details to the user. Provide choices to resolve conflicts or abort via `git rebase --abort`.

4. **Force-Push with Lease**:
   - Once rebase is complete:
     ```bash
     git push origin HEAD --force-with-lease
     ```
