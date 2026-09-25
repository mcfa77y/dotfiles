---
name: rhl-mock-services
description: >-
  Manage, test, and diagnose input-matching mock services (workspaces/mock-services) in RHL.
  Covers mock lifecycle (build, start, health check), SQS and Twilio webhook triggers,
  MongoDB communication history inspection, AWS SQS SDK MD5 validation, and running
  E2E/QA regression suites against local or PR preview mock services.
---

# RHL Mock Services Skill

`mock-services` is a NestJS microservice that sits between Remote Health Link (RHL) services (`backend-api`, `qa`) and upstream third-party providers (Twilio, AWS SES, AWS SQS, Linear, Memfault).

## Architecture & Mechanics

- **Input Matching**: Tests register deterministic scenarios (`POST /scenarios`) keyed by input criteria (e.g. phone numbers, email recipients, GraphQL queries).
- **Upstream Passthrough**: When no registered scenario matches incoming traffic, requests transparently pass through to the real upstream service.
- **Circuit Breaker Guard**: `backend-api` prohibits mock endpoints when `NODE_ENV=production`.
- **SQS Proxying & Inbound SMS**:
  - `POST /sqs/trigger/inbound-sms` registers an SQS scenario and synthetic Twilio message.
  - SQS messages return authentic MD5 checksums (`MD5OfBody`) to satisfy `@aws-sdk/middleware-sdk-sqs`.
  - Backend SQS drainage is triggered via `POST /api/v2/admin/communications/sms` with `empo-api-key`.

---

## Bundled Helper Scripts

All scripts reside in `<skill_dir>/scripts/` and support parameterization via CLI arguments or environment variables.

### 1. Mock Services Lifecycle

- **Build**:
  ```bash
  <skill_dir>/scripts/build_mock_services.sh [repo_root]
  ```
- **Start Daemon**:
  ```bash
  MOCK_PORT=3001 <skill_dir>/scripts/start_mock_services.sh [repo_root]
  ```
- **Health Check**:
  ```bash
  <skill_dir>/scripts/check_mock_health.sh [port]
  ```

### 2. Inbound SQS & Twilio Triggers

- **Simulate Inbound SMS & Notify Backend**:
  ```bash
  <skill_dir>/scripts/run_trigger_sms.sh \
    --from "+14155295117" \
    --to "+18884613835" \
    --body "Test message" \
    --mock-port 3001 \
    --backend-port 3000
  ```
  *Note*: Ensure the `--from` number corresponds to an existing patient in the target database so `MessagingService.saveTwilioMessage` resolves `patientId` correctly.

- **Verify AWS SDK SQS MD5 Validation**:
  ```bash
  <skill_dir>/scripts/run_verify_sqs_md5.sh
  ```

### 3. Database Diagnostics

- **Query User by Phone**:
  ```bash
  <skill_dir>/scripts/run_query_mongo.sh phone "+14155295117"
  ```
- **Query Recent Communication Histories**:
  ```bash
  <skill_dir>/scripts/run_query_mongo.sh recent-history 5
  ```
- **Query Communication History for Patient ID**:
  ```bash
  <skill_dir>/scripts/run_query_mongo.sh user-history <patientId> 10
  ```

### 4. Running QA Tests in Mock Mode

Run Playwright tests in `workspaces/qa` using `.env.test` configuration:

```bash
# Run specific test file
<skill_dir>/scripts/run_qa_mock_test.sh sources/tests/regression/agent-scheduling-calling-messaging.test.ts

# Run with grep filter
<skill_dir>/scripts/run_qa_mock_test.sh -g "@group2"
```

---

## Common Failure Modes & Diagnostics

1. **`Invalid MD5 checksum on messages: ...`**:
   - Cause: The AWS JavaScript SDK rejects SQS messages whose `MD5OfBody` does not match `createHash("md5").update(body).digest("hex")`.
   - Resolution: Ensure mock-services computes the exact MD5 hex digest on message generation.

2. **Backend 401 Unauthorized on `/api/v2/admin/communications/sms`**:
   - Cause: `EMPO_API_KEY` mismatch between `workspaces/qa/.env.test` and `backend-api` (`.env.backend-api`).
   - Resolution: Verify `EMPO_API_KEY` matches the backend secret.

3. **Unread Badge Does Not Increment**:
   - Cause: Phone number in test payload does not match any registered patient in MongoDB Atlas, leaving `patientId: null` on the saved communication history.
   - Resolution: Use `run_query_mongo.sh phone <number>` to verify patient linkage.
