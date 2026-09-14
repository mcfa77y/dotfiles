---
name: rhl-address-pr-comments
description: Fetch, analyze, and resolve GitHub PR review comments. Formulates recommendations, prompts user with interactive questions, applies code fixes, runs verification tests, commits and pushes changes, and posts comment replies on GitHub.
---

# RHL Address PR Comments

End-to-end workflow to triage, decide, fix, verify, commit, and respond to code review comments on pull requests in Empo Health repositories.

---

## 1. Verify Repository & Locate PR

1. **Verify Remote**: Confirm git remote matches `git@github.com:EmpoHealth/core.git` or `https://github.com/EmpoHealth/core`. Abort if outside this repository.
2. **Identify Target PR**:
   - If PR number or URL is provided, use it directly.
   - Otherwise, detect current branch (`git branch --show-current`) and look up its open PR:
     ```bash
     gh pr view --json number,title,headRefName,url,state
     ```

---

## 2. Fetch Active Review Comments & Threads

Retrieve all active review comments and discussion threads on the pull request:

```bash
# Fetch inline review comments on the pull request
gh api /repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments \
  --jq '.[] | {id: .id, path: .path, line: (.line // .original_line), side: .side, user: .user.login, body: .body, in_reply_to_id: .in_reply_to_id, diff_hunk: .diff_hunk}'
```

Also retrieve top-level PR reviews and issue comments:
```bash
gh api /repos/{owner}/{repo}/pulls/<PR_NUMBER>/reviews \
  --jq '.[] | select(.body != "") | {id: .id, user: .user.login, state: .state, body: .body}'
```

Group comments into conversation threads (root comment + subsequent replies) and filter out threads that are already marked resolved or already answered by the author.

---

## 3. Analyze Comments & Formulate Fix Recommendations

For each unresolved review comment or thread:

1. **Locate Code Context**: Read the relevant file sections surrounding the commented lines using the `read` tool.
2. **Evaluate Intent & Categorize**:
   - **Direct Bug / Clear Fix**: The reviewer identified a clear syntax, logic, security, or typing error. Draft a concrete code fix diff.
   - **Architectural / Design Decision**: The reviewer proposed alternative approaches, questioned a trade-off, or requested a structural refactor. Formulate options with explicit pros/cons.
   - **Question / Informational Clarification**: The reviewer asked for context or justification. Draft a concise, fact-grounded explanation based on repository facts.
3. **Draft Concrete Recommendations**:
   - File and line range.
   - Exact replacement or insertion code.
   - Proposed reply text for GitHub.

---

## 4. Interactive User Decision Prompting

Whenever there are architectural trade-offs, multiple implementation options, or user decisions required:

1. **Invoke the `ask` tool**: Formulate clear interactive questions with concise option labels and trade-off descriptions.
2. **Present Recommendations**: For each question, mark the recommended approach (`recommended: 0`) and outline the rationale.
3. **Wait for Decision**: Incorporate user selections directly into the implementation plan.

---

## 5. Apply Code Fixes & Verify Locally

1. **Edit Code**: Apply the approved code fixes to the local workspace files using the `edit` tool.
2. **Verify Changes**:
   - Run affected unit / integration tests (e.g. `yarn test` in the target workspace).
   - Run workspace linters / formatters (e.g. `yarn lint`, `yarn build`, `terraform fmt`, `terraform validate`).
   - Fix any regressions immediately.

---

## 6. Commit & Push Fixes

1. **Check Staged Changes**: Verify `git status --short`. Do not commit unrelated or dev-only files (`.env`, `graphify-out/`, `docs/`, `playwright.config.ts`).
2. **Conventional Commit**:
   - Format: `fix: <Concise description of the addressed comment(s)>`
   - **Do NOT include the ticket ID manually in the commit message**; the repository's `prepare-commit-msg` git hook automatically extracts and prepends the Linear ticket from the branch name.
3. **Push to Remote**:
   ```bash
   git push origin <BRANCH_NAME>
   ```

---

## 7. Post Threaded Replies & Update PR

1. **Reply to Each Review Comment**:
   Post a threaded reply to the root comment on GitHub:
   ```bash
   gh api --method POST /repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies \
     -f body="<Reply text detailing fix or clarification, referencing commit hash if applicable>"
   ```
2. **Linear Status Sync (Optional)**:
   If all comments are addressed and the branch is ready for re-review, optionally comment on the linked Linear issue with a summary of the updates.

---

## Linear IDs

Use these `empo-health` Linear IDs (from `agent/skills/linear.config.json`) when making MCP calls or resolving entities.

```json
{
  "team": {
    "name": "Remote Health Link",
    "key": "RHL",
    "id": "4670d896-c578-43a1-b8cf-50043d74d669"
  },
  "project": {
    "key": "qa",
    "name": "QA Project",
    "id": "c8f35a99-2b16-41a9-ae0f-48e32dbd4237",
    "url": "https://linear.app/empo-health/project/qa-project-a7fcf152916c"
  },
  "statuses": {
    "duplicate": "e5f9f7b7-043f-4598-a4ca-531ca0053c69",
    "inreview": "cfbdf80e-c7d2-41e2-ba56-cfd16ccee9f0",
    "needsdiscussion": "bbc94858-d9c1-4cf6-9efe-782222c53631",
    "done": "b33188ff-0eab-4cb9-960e-50fe01e9e644",
    "backlog": "a422f65f-ce64-4574-895f-3fa67ea657df",
    "todo": "9ba6b061-258a-489f-9572-2230c6e9d299",
    "canceled": "93df34d4-5a50-42fb-a259-491ac4e9aa75",
    "inProgress": "783efcac-f56e-4732-ba56-45f68ded7961",
    "waitingonexternalparty": "7702523a-845d-45a9-841b-2b65ba241dc2",
    "intesting": "22c614c9-647e-4f17-a293-9e30d6687618",
    "triage": "e2bf0f0c-ada6-466e-bdbe-2919c362b229"
  },
  "labels": {
    "phase-2": "616e415e-dfa1-4831-a97e-f92692ef2da6",
    "phase-3": "db125a17-5903-460d-9dea-f33b4060e559",
    "phase-1": "ca9ed66f-9b62-4d84-86ec-4e77ff2c7d2d",
    "DCAF": "f8a4a597-acfd-4457-89c0-dde6dba793f4",
    "EngOpsTestMfg": "baa8cfcc-63c0-422c-9e2e-777cfc377b28",
    "Basic R&D": "5706ba16-e4c2-4d77-96b5-6466957fde6d",
    "QMS": "60d8b09d-e6ee-419f-847d-fb7f3d5ba60f",
    "SEC": "604ed9d0-3e3b-42b3-ba41-f677081d6a71",
    "DRATA": "3488d46c-6317-468a-a490-000d20651e64",
    "Automated test failure": "8f07b65f-3d07-40b7-907f-0ed9968837fe",
    "Pre-release bug": "24ec772d-3c46-4dac-b21b-9a3deec86190",
    "Bug": "3c3f2687-5712-4590-aca7-85bd8800c578",
    "Released Bug": "a99c479e-d8b5-4d54-a979-53e891f50551",
    "HOT": "f3d21f07-1107-4a1c-a14d-a0cfc3dca2e8",
    "Carilion": "d8bea98e-c98d-4802-a8b7-3be5946c884c",
    "QA": "76b16628-e22e-4a85-8044-a035a3e39d9b",
    "test": "19ea09d6-a49e-4835-8e2c-0861a27dc507",
    "UI/UX": "7857397e-16d6-42ee-a4df-57204a3612ba"
  }
}
```
