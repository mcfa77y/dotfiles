---
name: rhl-mock-services
description: Run, test, query, and troubleshoot Empo Health mock services (Twilio SMS/Calls, AWS SQS, S3, MongoDB history) for local and E2E regression testing.
---

# RHL Mock Services Skill

Use this workflow to start, test, query, and debug local mock services for Twilio SMS/Calls, SQS message queues, and MongoDB communication histories.

## Available TypeScript Tools

All scripts run directly with Bun and provide full `--help` documentation:

### 1. Inbound SMS Simulation
Trigger simulated inbound SMS messages into the system:
```bash
# Trigger via mock-services SQS queue
bun run scripts/trigger_inbound_sms.ts --body "Hello from patient"

# Trigger directly to backend API webhook handler
bun run scripts/trigger_inbound_sms.ts --direct --from "+14155551234" --body "STOP"
```

### 2. MongoDB Communication Queries
Query patient message histories and user profiles:
```bash
# Find user by phone number
bun run scripts/query_mongo_communication.ts phone "+14155295117"

# Inspect latest communication histories
bun run scripts/query_mongo_communication.ts recent-history 10

# Inspect communication history for a specific patient ID
bun run scripts/query_mongo_communication.ts user-history <PATIENT_ID>
```

### 3. Service Lifecycle & QA Test Execution
Unified service controller:
```bash
# Check service health
bun run scripts/mock_service_ctl.ts health --port 3001

# Build mock-services workspace
bun run scripts/mock_service_ctl.ts build

# Start mock services in dev mode
bun run scripts/mock_service_ctl.ts start --port 3001

# Run QA regression tests against mock services
bun run scripts/mock_service_ctl.ts test
bun run scripts/mock_service_ctl.ts test sources/tests/regression/twilio-mock-services.test.ts
```
