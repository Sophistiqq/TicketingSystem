#!/bin/bash
# Configuration
API_BASE="http://localhost:3000"
USER_COOKIE="cookies-user.txt"
MIS_COOKIE="cookies-mis.txt"

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is not installed."
    exit 1
fi

echo "Step 1: Logging in..."
LOGIN_USER=$(curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$USER_COOKIE" -d '{"username":"user", "password":"password123"}')
USER_ID=$(echo "$LOGIN_USER" | jq -r '.user.id')

LOGIN_MIS=$(curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$MIS_COOKIE" -d '{"username":"mis", "password":"password123"}')
MIS_USER_ID=$(echo "$LOGIN_MIS" | jq -r '.user.id')

echo "Requester ID: $USER_ID, MIS ID: $MIS_USER_ID"

echo "Step 2: Requester creates a ticket..."
CREATE_TICKET=$(curl -s -X POST "$API_BASE/tickets" -H "Content-Type: application/json" -b "$USER_COOKIE" \
  -d '{"title": "Collaboration JQ Test", "description": "Testing comments and messaging integration.", "priority": "medium"}')
TICKET_ID=$(echo "$CREATE_TICKET" | jq -r '.id')
echo "Ticket Created: #$TICKET_ID"

echo "Step 3: Requester sends a DM to MIS referencing the ticket..."
SEND_MSG=$(curl -s -X POST "$API_BASE/messages" -H "Content-Type: application/json" -b "$USER_COOKIE" \
  -d "{\"content\": \"Hi, referencing ticket #$TICKET_ID.\", \"receiver_id\": $MIS_USER_ID, \"ticket_id\": $TICKET_ID}")
echo "Message Sent ID: $(echo "$SEND_MSG" | jq -r '.id')"

echo "Step 4: MIS staff adds an INTERNAL note..."
curl -s -X POST "$API_BASE/comments" -H "Content-Type: application/json" -b "$MIS_COOKIE" \
  -d "{\"ticket_id\": $TICKET_ID, \"content\": \"Internal technical notes.\", \"is_internal\": true}" > /dev/null
echo "Internal comment added."

echo "Step 5: Requester adds a PUBLIC comment..."
curl -s -X POST "$API_BASE/comments" -H "Content-Type: application/json" -b "$USER_COOKIE" \
  -d "{\"ticket_id\": $TICKET_ID, \"content\": \"Public user comment.\"}" > /dev/null
echo "Public comment added."

echo "Step 6: Verification of visibility..."
MIS_VIEW_COMMENTS=$(curl -s -b "$MIS_COOKIE" "$API_BASE/comments?ticket_id=$TICKET_ID")
USER_VIEW_COMMENTS=$(curl -s -b "$USER_COOKIE" "$API_BASE/comments?ticket_id=$TICKET_ID")

MIS_COMM_COUNT=$(echo "$MIS_VIEW_COMMENTS" | jq '. | length')
USER_COMM_COUNT=$(echo "$USER_VIEW_COMMENTS" | jq '. | length')

echo "MIS sees $MIS_COMM_COUNT comments (Expected: 2)"
echo "Requester sees $USER_COMM_COUNT comments (Expected: 1)"

if [ "$MIS_COMM_COUNT" -eq 2 ] && [ "$USER_COMM_COUNT" -eq 1 ]; then
  echo "-----------------------------------"
  echo "SUCCESS: Collaboration Test Passed!"
  echo "-----------------------------------"
else
  echo "-----------------------------------"
  echo "FAILURE: Collaboration Test Failed!"
  echo "-----------------------------------"
  exit 1
fi

# Cleanup
rm "$USER_COOKIE" "$MIS_COOKIE"
