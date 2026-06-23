---
description: Creates a GitHub Pull Request describing changes on the current branch with specified reviewers.
---

# Git Create Pull Request Workflow

This workflow guides the agent to create a GitHub Pull Request (PR) describing the changes committed on the current branch, including specific reviewers based on the files changed, and suffixing the PR title with the Linear ticket number.

## Steps

1. **Identify the Base Branch**
   - Identify the default or base branch to compare against (usually `origin/main` or `main`).
   - If unsure, check the default remote branch or ask the user.

2. **Analyze Changed Files**
   - Retrieve the list of files changed on this branch relative to the base branch:
     ```bash
     git diff --name-only origin/main...HEAD
     ```

3. **Determine Reviewers**
   - Define the baseline reviewers:
     - `pm-pp`
     - `simon57b`
     - `singhmadhurima123`
   - Check if any of the changed files are infrastructure files (e.g., matching `*.tf`) or git workflows (e.g., matching `*.yml` or `*.yaml`).
   - If such files exist, add the following additional reviewer:
     - `edahlseng`

4. **Generate PR Title and Description**
   - Review the commits on the current branch:
     ```bash
     git log origin/main..HEAD --oneline
     ```
   - Formulate a clear, concise title and a detailed description that covers:
     - What changed
     - Why the changes were made
     - Any relevant context or testing performed
   - Check the current branch name for a Linear ticket identifier (e.g., matching `rhl-\d+` or similar):
     ```bash
     git branch --show-current
     ```
   - If a Linear ticket number is found, capitalize it (e.g., `RHL-1234`) and append it as a suffix to the PR title (e.g., `My PR Title (RHL-1234)`).

5. **Create the Pull Request**
   - Use the GitHub CLI (`gh`) to create the PR:
     ```bash
     gh pr create --title "<PR Title>" --body "<PR Description>" --reviewer "<Comma-Separated Reviewers>"
     ```
   - Alternatively, if the CLI is not preferred, use the `github-mcp-server/create_pull_request` tool.
