---
name: rhl-start-work
description: Start work on an existing RHL Linear ticket — fetches ticket context, creates the git worktree branch via `wt switch --create`, runs lifecycle hooks, and surfaces title/description.
---

# Start Work on Existing RHL Ticket

Use this skill to pick up an existing Linear ticket and set up the worktree.

## Steps

1. **Confirm the ticket ID**: Ask the user for the Linear ticket ID (e.g. `RHL-3822`) if not provided.
2. **Fetch ticket context**: Use `mcp__linear_get_issue` with the identifier to fetch the title, description, and state.
3. **Create the worktree**: Lower-case the ticket ID (e.g. `rhl-3822`) and run:
   ```bash
   wt switch --create --config $GIT_TOOL_JS_DIR/.config/wt.toml <lowercase-ticket-id>
   ```
   *(Fallback if `$GIT_TOOL_JS_DIR` is unset: use `~/Projects/js_for_fun/git-tools-js/.config/wt.toml`)*
4. **Determine worktree path**:
   ```bash
   git worktree list | grep <lowercase-ticket-id> | awk '{print $1}'
   ```
5. **Switch directory**: Change `Cwd` to the resolved worktree path.
6. **Surface context**: Print the ticket title and description so implementation can begin.