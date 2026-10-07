#!/usr/bin/env bash
# Helper script to execute a CloudWatch Logs Insights query and await results.
# Usage: ./query_cw.sh <log_group> <query_string> <start_iso> <end_iso> [profile] [region]

set -eo pipefail

LOG_GROUP="${1:-/ecs/backend/}"
QUERY="${2:-fields @timestamp, @message | sort @timestamp desc | limit 20}"
START_TIME="${3:-}"
END_TIME="${4:-}"
PROFILE="${5:-empo-staging-read-only}"
REGION="${6:-us-east-1}"

if [ -z "$START_TIME" ]; then
  # Default to last 30 minutes
  START_SEC=$(python3 -c "import datetime; print(int((datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=30)).timestamp()))")
else
  START_SEC=$(python3 -c "import datetime; dt = datetime.datetime.fromisoformat('$START_TIME'.replace('Z', '+00:00')); print(int(dt.timestamp()))")
fi

if [ -z "$END_TIME" ]; then
  END_SEC=$(python3 -c "import datetime; print(int(datetime.datetime.now(datetime.timezone.utc).timestamp()))")
else
  END_SEC=$(python3 -c "import datetime; dt = datetime.datetime.fromisoformat('$END_TIME'.replace('Z', '+00:00')); print(int(dt.timestamp()))")
fi

echo "Starting CloudWatch Insights query..." >&2
echo "Log Group: $LOG_GROUP" >&2
echo "Window: $START_SEC to $END_SEC" >&2

QUERY_ID=$(aws logs start-query \
  --profile "$PROFILE" \
  --region "$REGION" \
  --log-group-name "$LOG_GROUP" \
  --start-time "$START_SEC" \
  --end-time "$END_SEC" \
  --query-string "$QUERY" \
  --query 'queryId' \
  --output text)

echo "Query ID: $QUERY_ID" >&2

while true; do
  STATUS=$(aws logs get-query-results \
    --profile "$PROFILE" \
    --region "$REGION" \
    --query-id "$QUERY_ID" \
    --query 'status' \
    --output text)
  
  if [ "$STATUS" = "Complete" ]; then
    break
  elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "Cancelled" ]; then
    echo "Query ended with status: $STATUS" >&2
    exit 1
  fi
  sleep 1
done

aws logs get-query-results \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query-id "$QUERY_ID" \
  --output json
