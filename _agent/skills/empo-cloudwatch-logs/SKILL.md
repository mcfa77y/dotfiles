---
name: empo-cloudwatch-logs
description: Query and inspect AWS CloudWatch logs for Empo Health ECS services (backend-api, workers, documentation) across staging and production using the AWS CLI and CloudWatch Insights. Load when diagnosing staging or production backend errors, viewing ECS service logs, investigating HTTP 500s or 4xx responses, or replaying request timelines.
---

# Empo CloudWatch Logs

Query and inspect ECS container logs across Empo Health AWS environments using the AWS CLI and CloudWatch Logs Insights.

## AWS Profiles & Regions

All Empo Health CloudWatch logs live in AWS region `us-east-1`. Use the read-only profiles for log inspection:

| Environment | AWS Profile | Region |
| :--- | :--- | :--- |
| **Staging** | `empo-staging-read-only` | `us-east-1` |
| **Production** | `empo-production-read-only` | `us-east-1` |
| **Internal** | `empo-internal-read-only` | `us-east-1` |

---

## Log Groups

Common ECS log groups in staging/production:

| Log Group | Purpose / Service |
| :--- | :--- |
| `/ecs/backend/` | Staging main shared backend API service |
| `/ecs/backend-worker` | Staging background queue worker / job processing |
| `/ecs/backend-documentation/` | Swagger / OpenAPI documentation service |
| `/ecs/backend/-pr-<PR_NUMBER>` | Ephemeral backend API container for PR |
| `/ecs/backend-worker-pr-<PR_NUMBER>` | Ephemeral worker container for PR |

---

## Quick Workflows

### 1. List Available Log Groups
```bash
aws logs describe-log-groups \
  --profile empo-staging-read-only \
  --region us-east-1 \
  --log-group-name-prefix "/ecs/backend" \
  --query 'logGroups[*].[logGroupName,storedBytes]' \
  --output table
```

### 2. List Recent Active Log Streams
```bash
aws logs describe-log-streams \
  --profile empo-staging-read-only \
  --region us-east-1 \
  --log-group-name "/ecs/backend/" \
  --order-by LastEventTime \
  --descending \
  --max-items 5 \
  --query 'logStreams[*].[logStreamName,lastEventTimestamp]' \
  --output table
```

### 3. Run Fast CloudWatch Logs Insights Queries

CloudWatch Logs Insights provides fast indexed querying across all streams in a log group.

#### Step A: Start Query
Timestamps are epoch seconds:
```bash
START_SEC=$(python3 -c "import datetime; print(int(datetime.datetime.fromisoformat('2026-10-06T22:35:00+00:00').timestamp()))")
END_SEC=$(python3 -c "import datetime; print(int(datetime.datetime.fromisoformat('2026-10-06T22:45:00+00:00').timestamp()))")

QUERY_ID=$(aws logs start-query \
  --profile empo-staging-read-only \
  --region us-east-1 \
  --log-group-name "/ecs/backend/" \
  --start-time "$START_SEC" \
  --end-time "$END_SEC" \
  --query-string "fields @timestamp, req.method, req.url, res.statusCode, msg | filter res.statusCode >= 400 | sort @timestamp desc | limit 25" \
  --query 'queryId' \
  --output text)
```

#### Step B: Poll and Get Results
```bash
aws logs get-query-results \
  --profile empo-staging-read-only \
  --region us-east-1 \
  --query-id "$QUERY_ID"
```

---

## Common Query Patterns

### Aggregate HTTP Status Codes
```sql
stats count(*) as count by res.statusCode
```

### Find 500 Internal Server Errors & Exception Stacks
```sql
fields @timestamp, req.method, req.url, res.statusCode, msg, err.message, err.stack
| filter res.statusCode == 500 or ispresent(err)
| sort @timestamp desc
| limit 20
```

### Track Specific Endpoint or User ID
```sql
fields @timestamp, req.method, req.url, res.statusCode, responseTime, msg
| filter req.url like /communications/ or userId == "6a62e0241178875b04d6cfb7"
| sort @timestamp desc
| limit 50
```

### Latency Percentiles (p50, p95, p99)
```sql
stats count(*) as requests, pct(responseTime, 50) as p50, pct(responseTime, 95) as p95, max(responseTime) as max_ms by bin(5m)
```
