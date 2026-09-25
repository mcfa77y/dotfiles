#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-${MOCK_PORT:-3001}}"
URL="http://localhost:$PORT/health"

echo "Checking mock-services health at $URL..."
RESPONSE=$(curl -s -w "\n%{http_code}" "$URL" || echo -e "\n000")
HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_STATUS" = "200" ]; then
  echo "mock-services is healthy (HTTP 200): $HTTP_BODY"
  exit 0
else
  echo "mock-services health check failed (HTTP $HTTP_STATUS): $HTTP_BODY" >&2
  exit 1
fi
