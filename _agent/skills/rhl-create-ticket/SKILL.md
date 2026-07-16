---
name: rhl-create-ticket
description: Create a Linear ticket describing the currently staged changes, and switch to a new worktree.
---

# Create Linear Ticket and Switch Worktree

Use this skill to create a ticket for changes you have already staged in git.

## Steps

1. **Verify Staged Changes**: Run `git diff --cached --stat`. Abort if nothing is staged.
2. **Generate Content**: Read `git diff --cached` and write a title and detailed description to a temporary markdown file (e.g. `docs/staged-changes-desc.md`).
3. **Create Linear Ticket**:
   ```bash
   linear issue create --title "<Title>" --team "RHL" --project "ee292bb37412" \
     --milestone "Omni-channel Communication (Pedro - M, Simon/Joe - ?)" \
     --assignee "Joe Lau" --state "In Progress" \
     --description-file "<Path to file>" --no-interactive
   ```
   *Delete the temporary description file afterwards.*
4. **Stash Changes**: `git stash push --staged -m "stashed-for-<linear-issue>"`
5. **Create Worktree**: Lower-case the issue ID and run:
   ```bash
   wt switch --create --config $GIT_TOOL_JS_DIR/.config/wt.toml <lowercase-ticket-id>
   ```
6. **Apply Stash**: Switch `Cwd` to the new worktree and run `git stash pop`.