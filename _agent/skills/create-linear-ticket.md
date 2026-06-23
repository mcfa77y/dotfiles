---
description: Create a Linear ticket describing the currently staged changes, and switch to a new worktree.
---

# Create Linear Ticket and Switch Worktree Workflow

This workflow guides the agent to create a Linear ticket describing the currently staged git changes for the "improve support integrations" project, then creates a new worktree for that ticket and moves the staged changes there.

## Steps

1. **Verify Staged Changes**
   - Check the currently staged changes using:
     ```bash
     git diff --cached --stat
     ```
   - Ensure there are changes staged. If no changes are staged, alert the user.

2. **Generate Title and Description**
   - Review the staged diff:
     ```bash
     git diff --cached
     ```
   - Formulate a clear, actionable title for the Linear ticket.
   - Formulate a comprehensive description of the staged changes, detailing what was done, why, and any context.

3. **Save Description to a Temporary File**
   - Create a temporary markdown file inside the workspace or the scratch directory (e.g. `docs/staged-changes-desc.md`) to hold the description.
   - Write the generated description to this file.

4. **Create the Linear Ticket**
   - Execute the `linear issue create` command using the Linear CLI:
     ```bash
     linear issue create --title "<Issue Title>" --team "RHL" --project "ee292bb37412" --milestone "Omni-channel Communication (Pedro - M, Simon/Joe - ?)" --assignee "Joe Lau" --state "In Progress" --description-file "<Path to description file>" --no-interactive
     ```
   - Note the created Linear issue ID (e.g., `RHL-3741`).
   - Clean up by deleting the temporary description file.

5. **Stash Staged Changes**
   - Stash the staged changes so they can be moved:
     ```bash
     git stash push -m "stashed-for-<linear-issue>"
     ```
     *(Note: You can use `git stash push --staged` to stash only the staged changes).*

6. **Create and Switch to the New Worktree**
   - Create a new worktree using the `wt switch` command (substituting `<linear-issue>` with the lowercased issue ID, e.g., `rhl-3741`):
     ```bash
     wt switch --create --config $GIT_TOOL_JS_DIR/.config/wt.toml <linear-issue>
     ```
   - Determine the path of the new worktree. You can find it by listing the worktrees:
     ```bash
     git worktree list | grep <linear-issue> | awk '{print $1}'
     ```
     or using:
     ```bash
     wt list --format json
     ```

7. **Apply the Stashed Changes in the New Worktree**
   - Switch your working directory (`Cwd`) to the new worktree path.
   - Pop the stash onto the new worktree:
     ```bash
     git stash pop
     ```
