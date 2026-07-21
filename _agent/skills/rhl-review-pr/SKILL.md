---
name: rhl-review-pr
description: Perform a local PR review for RHL repositories and output feedback to docs/
---

# RHL Pull Request Review Skill

When this skill is invoked, follow these steps to perform a code review on the current branch or a specified pull request:

1. **Gather PR Context**:
   - Identify the current branch or the pull request to be reviewed.
   - Use local git commands (e.g., `git diff main...HEAD`, `git log`) or the GitHub MCP server tools (e.g., `pull_request_read`) to fetch the code changes and commit history.

2. **Analyze Code Changes**:
   Review the changes specifically focusing on:
   - **Security and Vulnerabilities**: Identify any insecure patterns, unvalidated inputs, or exposed credentials.
   - **Performance Optimizations**: Look for inefficient algorithms, unnecessary re-renders, or expensive queries.
   - **Code Style and Best Practices**: Ensure the code is readable, maintainable, and adheres to standard best practices.
   - **Test Coverage and Quality**: Check if new features or fixes include appropriate tests (unit/integration) and evaluate the quality of those tests.

3. **Generate Review Report**:
   - Compile your findings into a structured Markdown document.
   - Include a high-level summary, file-by-file feedback, and clear, actionable suggestions.
   - If there are no issues in a category, explicitly state that it looks good.

4. **Output to `docs/`**:
   - Save the review report in the `docs/` directory of the current repository workspace (e.g., `docs/pr_review_<branch_name>.md`).
   - Note: Per global rules, files under `docs/` are treated as local helper/configuration files and should not be committed unless explicitly requested.

5. **Provide a Summary**:
   - Output a brief summary to the user in the chat.
   - Provide a clickable link to the generated Markdown file so the user can easily view it.

6. **Requesting Input**:
   - If you need more input from the user at any point (e.g., missing context, clarification on a change), use the `run_command` tool to run `cmux notify --title "PR Review Needs Input" --body "<Brief description of what you need>"` to alert the user.
