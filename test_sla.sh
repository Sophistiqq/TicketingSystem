#!/bin/bash
# Configuration
API_BASE="http://localhost:3000"
ADMIN_COOKIE="cookies-admin.txt"

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is not installed."
    exit 1
fi

echo "Step 1: Logging in as 'admin'..."
curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$ADMIN_COOKIE" -d '{"username":"admin", "password":"password123"}' > /dev/null

echo "Step 2: Creating a ticket with an expired due date..."
# Get date 1 hour ago in ISO format
EXPIRED_DATE=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)

CREATE_TICKET=$(curl -s -X POST "$API_BASE/tickets" -H "Content-Type: application/json" -b "$ADMIN_COOKIE" \
  -d "{\"title\": \"SLA JQ Test\", \"description\": \"Testing automatic breach detection.\", \"priority\": \"high\", \"due_date\": \"$EXPIRED_DATE\"}")

TICKET_ID=$(echo "$CREATE_TICKET" | jq -r '.id')
echo "Ticket Created: #$TICKET_ID (Due: $EXPIRED_DATE)"

echo "Step 3: Triggering SLA detection (Fetching ticket list)..."
curl -s -b "$ADMIN_COOKIE" "$API_BASE/tickets?limit=1" > /dev/null

echo "Step 4: Verifying breach..."
TICKET_DETAIL=$(curl -s -b "$ADMIN_COOKIE" "$API_BASE/tickets/$TICKET_ID")
BREACHED=$(echo "$TICKET_DETAIL" | jq -r '.sla_breached')

echo "Ticket #$TICKET_ID - SLA Breached: $BREACHED"

if [ "$BREACHED" == "true" ]; then
  echo "-----------------------------------"
  echo "SUCCESS: SLA Detection Test Passed!"
  echo "-----------------------------------"
else
  echo "-----------------------------------"
  echo "FAILURE: SLA Detection Test Failed!"
  echo "-----------------------------------"
  exit 1
fi

# Cleanup
rm "$ADMIN_COOKIE"
