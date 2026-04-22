#!/bin/bash
# Configuration
API_BASE="http://localhost:3000"
USER_COOKIE="cookies-user.txt"
MIS_COOKIE="cookies-mis.txt"
ADMIN_COOKIE="cookies-admin.txt"

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is not installed."
    exit 1
fi

echo "Step 1: Logging in..."
curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$USER_COOKIE" -d '{"username":"user", "password":"password123"}' > /dev/null
curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$MIS_COOKIE" -d '{"username":"mis", "password":"password123"}' > /dev/null
curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$ADMIN_COOKIE" -d '{"username":"admin", "password":"password123"}' > /dev/null

echo "Step 2: User creates a ticket..."
CREATE_TICKET=$(curl -s -X POST "$API_BASE/tickets" -H "Content-Type: application/json" -b "$USER_COOKIE" \
  -d '{"title": "CSAT JQ Workflow Test", "description": "Testing satisfaction survey lifecycle.", "priority": "low"}')
TICKET_ID=$(echo "$CREATE_TICKET" | jq -r '.id')
echo "Ticket Created: #$TICKET_ID"

echo "Step 3: MIS Staff resolves it..."
MIS_ME=$(curl -s -b "$MIS_COOKIE" "$API_BASE/auth/me")
MIS_USER_ID=$(echo "$MIS_ME" | jq -r '.id')

curl -s -X PUT "$API_BASE/tickets/$TICKET_ID" -H "Content-Type: application/json" -b "$MIS_COOKIE" -d "{\"assignee_id\": $MIS_USER_ID, \"status\": \"in_progress\"}" > /dev/null
curl -s -X PUT "$API_BASE/tickets/$TICKET_ID" -H "Content-Type: application/json" -b "$MIS_COOKIE" -d "{\"status\": \"resolved\", \"resolution_notes\": \"Done via JQ script.\"}" > /dev/null
echo "Ticket #$TICKET_ID Resolved."

echo "Step 4: User submits CSAT..."
curl -s -X POST "$API_BASE/csat" -H "Content-Type: application/json" -b "$USER_COOKIE" \
  -d "{\"ticket_id\": $TICKET_ID, \"rating\": 5, \"comment\": \"Excellent script usage!\"}" > /dev/null
echo "CSAT Submitted."

echo "Step 5: Admin verifies stats..."
STATS=$(curl -s -b "$ADMIN_COOKIE" "$API_BASE/csat/stats")
COUNT=$(echo "$STATS" | jq -r '.count')
echo "Total CSAT records: $COUNT"

if [ "$COUNT" -gt 0 ]; then
  echo "-----------------------------------"
  echo "SUCCESS: CSAT Workflow Test Passed!"
  echo "-----------------------------------"
else
  echo "-----------------------------------"
  echo "FAILURE: CSAT Workflow Test Failed!"
  echo "-----------------------------------"
  exit 1
fi

# Cleanup
rm "$USER_COOKIE" "$MIS_COOKIE" "$ADMIN_COOKIE"
