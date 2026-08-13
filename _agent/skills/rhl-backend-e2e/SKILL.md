---
name: rhl-backend-e2e
description: >-
  Workflow and instructions for running end-to-end (E2E) tests in the Remote Health Link (RHL) backend repository (workspaces/backend-api).
  Ensures Docker daemon is active on Apple Silicon, updates docker-compose.yml with local E2E test settings (local_e2e), and runs jest/yarn test commands.
---

# RHL Backend E2E Testing Skill

This skill outlines the necessary steps to set up and run E2E tests for the `empo-backend-api` workspace on Apple Silicon macOS environments.

## Prerequisites & Environment Setup

### 1. Ensure Docker Daemon is Active
E2E tests rely on Docker containers (e.g., MongoDB replica set). Before running tests, ensure Docker is running:

```bash
docker info >/dev/null 2>&1 || (open -a OrbStack || open -a Docker)
```

Wait until Docker responds:
```bash
until docker info >/dev/null 2>&1; do sleep 1; done
```

### 2. Update Docker Compose for Apple Silicon (`local_e2e`)
The repository requires the Apple Silicon-compatible `docker-compose.yml` configuration (which enables `platform: "linux/arm64/v8"` for MongoDB).

Run the equivalent of the `local_e2e` shell function:
```bash
cp /Users/joe/Projects/empo_health/scripts/testing-configs/docker-compose.yml \
   <workspace_root>/workspaces/backend-api/sources/e2e/test-data/docker-compose.yml
```

---

## Running E2E Tests

Navigate to `workspaces/backend-api/` or run from the repository root using yarn workspaces.

### Running a Specific E2E Test
> [!IMPORTANT]
> When passing specific test files to `yarn test:e2e`, always use `--` before the path so Jest does not interpret the file name as a custom reporter.

From repository root:
```bash
yarn workspace empo-backend-api test:e2e -- sources/e2e/tests/admin-invitation-escalation.e2e.spec.ts
```

Or from `workspaces/backend-api/`:
```bash
yarn test:e2e -- sources/e2e/tests/admin-invitation-escalation.e2e.spec.ts
```

With `--watch` mode:
```bash
yarn test:e2e --watch -- sources/e2e/tests/admin-invitation-escalation.e2e.spec.ts
```

Direct Jest execution:
```bash
yarn workspace empo-backend-api jest sources/e2e/tests/admin-invitation-escalation.e2e.spec.ts --config sources/e2e/jest-e2e.config.js
```
