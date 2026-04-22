#!/bin/bash

# Configuration
API_BASE="http://localhost:3000"
USER_COOKIE="cookies-user.txt"
APPROVER_COOKIE="cookies-approver.txt"
MIS_COOKIE="cookies-mis.txt"

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is not installed. Please install it (e.g., sudo apt install jq)."
    exit 1
fi

echo "Step 1: Logging in as 'user'..."
LOGIN_USER=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -c "$USER_COOKIE" \
  -d '{"username":"user", "password":"password123"}')

USER_ID=$(echo "$LOGIN_USER" | jq -r '.user.id')
if [ "$USER_ID" == "null" ] || [ -z "$USER_ID" ]; then
    echo "Error: Login failed. Check backend and credentials."
    exit 1
fi
echo "Logged in as User ID: $USER_ID"

echo "Step 2: Fetching reference data..."
REQUEST_TYPES=$(curl -s -b "$USER_COOKIE" "$API_BASE/reference/request-types")
AFFECTED_SYSTEMS=$(curl -s -b "$USER_COOKIE" "$API_BASE/reference/affected-systems")

RT_ID=$(echo "$REQUEST_TYPES" | jq -r '.[] | select(.name == "Feature Request") | .id')
AS_ID=$(echo "$AFFECTED_SYSTEMS" | jq -r '.[] | select(.name == "Email System") | .id')

# Fallback if names differ
[ "$RT_ID" == "null" ] || [ -z "$RT_ID" ] && RT_ID=$(echo "$REQUEST_TYPES" | jq -r '.[0].id')
[ "$AS_ID" == "null" ] || [ -z "$AS_ID" ] && AS_ID=$(echo "$AFFECTED_SYSTEMS" | jq -r '.[0].id')

echo "Request Type ID: $RT_ID, Affected System ID: $AS_ID"

echo "Step 3: Creating ticket (Requires Approval)..."
CREATE_TICKET=$(curl -s -X POST "$API_BASE/tickets" \
  -H "Content-Type: application/json" \
  -b "$USER_COOKIE" \
  -d "{
    \"title\": \"JQ Workflow Test $(date +%s)\",
    \"description\": \"Testing the end-to-end workflow using jq for parsing.\",
    \"priority\": \"high\",
    \"request_type_id\": $RT_ID,
    \"affected_system_id\": $AS_ID
  }")

TICKET_ID=$(echo "$CREATE_TICKET" | jq -r '.id')
TICKET_STATUS=$(echo "$CREATE_TICKET" | jq -r '.status')
echo "Ticket Created ID: $TICKET_ID, Initial Status: $TICKET_STATUS"

echo "Step 4: Logging in as 'approver'..."
curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$APPROVER_COOKIE" -d '{"username":"approver", "password":"password123"}' > /dev/null

echo "Step 5: Fetching pending approvals..."
PENDING_APPROVALS=$(curl -s -b "$APPROVER_COOKIE" "$API_BASE/approvals/my/pending")
APPROVAL_ID=$(echo "$PENDING_APPROVALS" | jq -r ".[] | select(.ticket_id == $TICKET_ID) | .id")
echo "Approval Record ID: $APPROVAL_ID"

if [ "$APPROVAL_ID" == "null" ] || [ -z "$APPROVAL_ID" ]; then
    echo "Error: Could not find pending approval for ticket $TICKET_ID"
    exit 1
fi

echo "Step 6: Approving ticket..."
APPROVE_RES=$(curl -s -X POST "$API_BASE/approvals/$APPROVAL_ID/decide" \
  -H "Content-Type: application/json" \
  -b "$APPROVER_COOKIE" \
  -d "{\"ticket_id\": $TICKET_ID, \"decision\": \"approved\", \"remarks\": \"Approved via JQ script.\"}")
echo "Approval recorded. New Ticket Status: $(echo "$APPROVE_RES" | jq -r '.ticket_status')"

echo "Step 7: Logging in as 'mis'..."
LOGIN_MIS=$(curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$MIS_COOKIE" -d '{"username":"mis", "password":"password123"}')
MIS_USER_ID=$(echo "$LOGIN_MIS" | jq -r '.user.id')

echo "Step 8: Assigning ticket to MIS staff (Self)..."
curl -s -X PUT "$API_BASE/tickets/$TICKET_ID" -H "Content-Type: application/json" -b "$MIS_COOKIE" -d "{\"assignee_id\": $MIS_USER_ID}" > /dev/null

echo "Step 9: Resolving ticket..."
RESOLVE_RES=$(curl -s -X PUT "$API_BASE/tickets/$TICKET_ID" \
  -H "Content-Type: application/json" \
  -b "$MIS_COOKIE" \
  -d "{\"status\": \"resolved\", \"resolution_notes\": \"Resolved via JQ script.\"}")
echo "Resolution recorded. Final Status: $(echo "$RESOLVE_RES" | jq -r '.status')"

echo "Step 10: Final verification..."
TICKET_DETAIL=$(curl -s -b "$USER_COOKIE" "$API_BASE/tickets/$TICKET_ID")
VERIFIED_STATUS=$(echo "$TICKET_DETAIL" | jq -r '.status')
echo "Verified status as user: $VERIFIED_STATUS"

if [ "$VERIFIED_STATUS" == "resolved" ]; then
  echo "-----------------------------------"
  echo "SUCCESS: Workflow Test Passed!"
  echo "-----------------------------------"
else
  echo "-----------------------------------"
  echo "FAILURE: Workflow Test Failed!"
  echo "-----------------------------------"
  exit 1
fi

# Cleanup
rm "$USER_COOKIE" "$APPROVER_COOKIE" "$MIS_COOKIE"
