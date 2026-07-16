---
name: rhl-commit-push
description: Commits and pushes changed files while excluding local dev/test files and adhering to commitlint.
---

# Git Commit and Push

1. **Identify changes**: Check modified files. **Do not** stage or commit changes to:
   - `docs/*`
   - `playwright.config.ts`
   - `docker.compose.yml`
   - `test-setup.helper.ts`
2. **Linting**: Check `.commitlintrc.json` and ensure the commit message adheres to the rules.
3. **Commit**: Commit the allowed changes.
4. **Push**:
   - If changes are infrastructure-only (`*.tf`, `*.yml`), run `git push --no-verify`
   - Otherwise run `git push`