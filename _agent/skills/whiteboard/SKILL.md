---
name: whiteboard
description: Initialize and author interactive architectural code reviews, file lenses, and diagrams using dev.fast Whiteboard.
---

# Whiteboard

Use this skill to initialize structured Whiteboard review sessions, bucket PR changes into review lenses, and visualize system architecture.

## PR review session initializer

`scripts/init-pr-review.ts` initializes a Whiteboard review session for a pull request or local branch comparison. It registers the repository, resolves commit pins, categorizes changed files into review lenses, and opens the session in Whiteboard Desktop.

### Usage

```bash
# Initialize a review session from a GitHub PR number or URL
bun run ~/.omp/agent/skills/whiteboard/scripts/init-pr-review.ts -p 2725

# Initialize from a full GitHub PR URL
bun run ~/.omp/agent/skills/whiteboard/scripts/init-pr-review.ts -p https://github.com/EmpoHealth/core/pull/2725

# Initialize from local branch comparison
bun run ~/.omp/agent/skills/whiteboard/scripts/init-pr-review.ts -b origin/main -h HEAD -t "Review feature branch"

# Preview planned commands and API payloads without execution
bun run ~/.omp/agent/skills/whiteboard/scripts/init-pr-review.ts -p 2725 --dry-run

# Run headlessly without launching or focusing Desktop
bun run ~/.omp/agent/skills/whiteboard/scripts/init-pr-review.ts -p 2725 --no-open
```

### CLI flags

| Flag | Type | Description |
|---|---|---|
| `-p, --pr <number\|url>` | string | GitHub PR number or full URL. Resolves base, head, title, and PR URL via `gh pr view`. |
| `-r, --repo <path>` | string | Local repository root path. Defaults to current working directory. |
| `-b, --base <ref>` | string | Base git ref. Defaults to PR base branch or `origin/main`. |
| `-h, --head <ref>` | string | Head git ref. Defaults to PR head branch or `HEAD`. |
| `-t, --title <title>` | string | Review session title. Defaults to PR title or latest commit message. |
| `--no-open` | boolean | Skips calling `session_open` after initialization. |
| `--dry-run` | boolean | Outputs the JSON plan of commands and API calls without executing. |
| `-H, --help` | boolean | Displays command help. |

### Review lenses

The script groups changed files into sensible review lenses so reviewers can inspect changes by domain rather than a flat file list:

1. **Workflows & CI**: GitHub Actions workflows, CI scripts, and automation pipelines (`.github/workflows/`, `.circleci/`, `ci/`).
2. **Terraform & Infrastructure**: Infrastructure definitions, containers, and deployment configurations (`terraform/`, `*.tf`, `Dockerfile`, `docker-compose.yml`, `wrangler.jsonc`).
3. **Tests & QA**: Unit tests, integration tests, end-to-end suites, and test configurations (`*.spec.*`, `*.test.*`, `__tests__/`, `tests/`, `e2e/`).
4. **Frontend**: UI components, pages, client-side hooks, and stylesheets (`apps/web/`, `apps/frontend/`, `*.tsx`, `*.jsx`, `*.vue`, `*.css`).
5. **Backend API**: Server routes, controllers, database models, migrations, and backend services (`apps/api/`, `apps/backend/`, `*.py`, `*.go`, `*.sql`, `prisma/`).
6. **Documentation & Config**: Project configuration, dependencies, and documentation (`README.md`, `docs/`, `package.json`, `tsconfig.json`, `biome.json`).
7. **Other**: Any remaining uncategorized files.

### Whiteboard API workflow

When executed against the Whiteboard server, the initializer runs the following tools:

1. `session_capabilities`: Discovers server capability and desktop availability.
2. `session_register_repository`: Registers the repository path on the server.
3. `session_resolve_pins`: Resolves base and head git refs into immutable commit SHAs.
4. `session_create`: Creates the review session targeting the pinned commit comparison.
5. `session_repin`: Synchronizes source pins and PR metadata.
6. `session_lens_edit`: Inserts each categorized file lens into the review session.
7. `session_open`: Opens the created review session in Whiteboard Desktop (unless `--no-open` is specified).
