---
name: wt-switch-create
description: Create a new worktrunk worktree (optionally in another repo) and switch this session's working directory into it. Use when launching a session that should work in its own worktree.
argument-hint: "[<branch>] [<repo>] [-- <task>]"
license: MIT OR Apache-2.0
compatibility: Requires the `wt` CLI (https://worktrunk.dev)
---

# wt-switch-create

Arguments: `$ARGUMENTS`. Grammar: `[<branch>] [<repo>] [-- <task>]`.

- **branch** — optional; the branch name for the new worktree. When omitted,
  pick one (step 1 below).
- **repo** — optional path; create the worktree in this repo instead of the
  session's current one.
- **task** — optional; what to do inside the new worktree. No task means enter
  the worktree and wait.

Tokens before the `--` are the branch and/or repo: a path-shaped token
(starting with `/`, `~`, `./`, or `../`) is the repo; any other token is the
branch (`docs` is a branch name, never the `docs/` directory). More than one
branch-shaped token before a `--` doesn't fit the grammar — ask. Without a
`--`, judge where the task starts: leading tokens that read as a branch name
(`fix-auth`) or a repo path are consumed as such, and the rest is the task;
otherwise the whole input is the task (`fix the parser bug` has no
branch-shaped lead — all task).

```
/wt-switch-create my-feature -- fix the parser bug
/wt-switch-create -- fix the parser bug
/wt-switch-create my-feature ~/workspace/other-repo -- fix the parser bug
/wt-switch-create my-feature
```

## What to do

### Antigravity Native Flow (Recommended)

In Antigravity (`agy`), creating a new worktree and running a task inside it is natively supported via the `invoke_subagent` tool. You do not need to manually run `wt switch --create` and `cd`. 

Instead, use `invoke_subagent` and set the `Workspace` parameter to `"share"` (or `"branch"`):

1. **Pick the branch name** if none was given.
2. **Invoke a subagent** with the `Workspace: "share"` parameter, providing the task in the `Prompt`. 
   
```json
[
  {
    "TypeName": "research",
    "Role": "Feature Developer",
    "Prompt": "Implement the new feature",
    "Workspace": "share"
  }
]
```

This will automatically create a new shared workspace (similar to a worktree) and run the subagent within it. 

### Manual CLI Flow (For tmux / Zellij handoffs)

If the user specifically requested a background session using a terminal multiplexer (like tmux or Zellij) rather than a subagent, use the `wt switch --create` command to spawn a new `agy` process in the background.

**tmux** (check `$TMUX` env var):
```bash
tmux new-session -d -s <branch-name> "wt switch --create <branch-name> -x agy -- '<task description>'"
```

**Zellij** (check `$ZELLIJ` env var):
```bash
zellij run -- wt switch --create <branch-name> -x agy -- '<task description>'
```

## Cleanup

Worktrees persist after the session ends. They show up in `wt list`, and are merged or removed with `wt merge` / `wt remove <branch>` like any other. Don't remove it unprompted.

## Scope

The command's mandate is ONE worktree (in the named repo, if one was given)
and the requested task inside it. Commits, pushes, and merges still each
require explicit user permission.
