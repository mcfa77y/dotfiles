---
description: Commits and pushes changed files while excluding local dev/test files and adhering to commitlint.
---

# Git Commit and Push Workflow

1. Identify modified files in the repository. Do **not** stage or commit changes to the following files/folders, as they are only for local development and testing:
   - `docs/*`
   - `playwright.config.ts`
   - `docker.compose.yml`
   - `test-setup.helper.ts`

2. Check the commit linting rules in `.commitlintrc.json` and construct a commit message that fully adheres to them.

3. Commit the allowed changes.

4. Push the changes to the remote branch:
   - If the changes are infrastructure-only (e.g. Terraform changes), use the `--no-verify` flag:
     ```bash
     git push --no-verify
     ```
   - Otherwise, perform a standard push:
     ```bash
     git push
     ```
