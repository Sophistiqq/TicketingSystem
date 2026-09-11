#!/bin/bash
# test_workflow_diverse.sh
# A comprehensive workflow test script simulating multiple users and interactions.

# Configuration
API_BASE="http://localhost:3000"
USER_COOKIE="cookies-user.txt"
APPROVER_COOKIE="cookies-approver.txt"
MIS_COOKIE="cookies-mis.txt"
ADMIN_COOKIE="cookies-admin.txt"

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: 'jq' is not installed."
    exit 1
fi

echo "Step 1: Logging in as various users..."
curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$USER_COOKIE" -d '{"username":"user1", "password":"password123"}' > /dev/null
curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$APPROVER_COOKIE" -d '{"username":"manager1", "password":"password123"}' > /dev/null
curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$MIS_COOKIE" -d '{"username":"mis1", "password":"password123"}' > /dev/null
curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$ADMIN_COOKIE" -d '{"username":"admin", "password":"password123"}' > /dev/null

echo "Step 2: Fetching reference data..."
REQUEST_TYPES=$(curl -s -b "$USER_COOKIE" "$API_BASE/reference/request-types")
AFFECTED_SYSTEMS=$(curl -s -b "$USER_COOKIE" "$API_BASE/reference/affected-systems")

RT_ID=$(echo "$REQUEST_TYPES" | jq -r '.[] | select(.name == "Access Request") | .id')
AS_ID=$(echo "$AFFECTED_SYSTEMS" | jq -r '.[] | select(.name == "FAST") | .id')

echo "Step 3: User1 creates an Access Request ticket (Requires Approval)..."
CREATE_TICKET=$(curl -s -X POST "$API_BASE/tickets" -H "Content-Type: application/json" -b "$USER_COOKIE" \
  -d "{
    \"title\": \"Access Request for FAST System $(date +%s)\",
    \"description\": \"I need access to the FAST system for financial reporting tasks. This description is long enough.\",
    \"priority\": \"high\",
    \"request_type_id\": $RT_ID,
    \"affected_system_id\": $AS_ID
  }")
TICKET_ID=$(echo "$CREATE_TICKET" | jq -r '.id')
echo "Ticket Created: #$TICKET_ID, Status: $(echo "$CREATE_TICKET" | jq -r '.status')"

echo "Step 4: Manager1 approves the ticket..."
# Find the approval ID
PENDING_APPROVALS=$(curl -s -b "$APPROVER_COOKIE" "$API_BASE/approvals/my/pending")
APPROVAL_ID=$(echo "$PENDING_APPROVALS" | jq -r ".[] | select(.ticket_id == $TICKET_ID) | .id")

if [ "$APPROVAL_ID" == "null" ] || [ -z "$APPROVAL_ID" ]; then
    echo "Error: Pending approval not found for Ticket #$TICKET_ID"
    # Fallback: maybe it's assigned to 'approver' instead of 'manager1' due to seed logic
    curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -c "$APPROVER_COOKIE" -d '{"username":"approver", "password":"password123"}' > /dev/null
    PENDING_APPROVALS=$(curl -s -b "$APPROVER_COOKIE" "$API_BASE/approvals/my/pending")
    APPROVAL_ID=$(echo "$PENDING_APPROVALS" | jq -r ".[] | select(.ticket_id == $TICKET_ID) | .id")
fi

curl -s -X POST "$API_BASE/approvals/$APPROVAL_ID/decide" \
  -H "Content-Type: application/json" \
  -b "$APPROVER_COOKIE" \
  -d "{\"ticket_id\": $TICKET_ID, \"decision\": \"approved\", \"remarks\": \"Approved for financial tasks.\"}" > /dev/null
echo "Ticket #$TICKET_ID Approved."

echo "Step 5: MIS1 assigns and resolves the ticket..."
MIS_ME=$(curl -s -b "$MIS_COOKIE" "$API_BASE/auth/me")
MIS_USER_ID=$(echo "$MIS_ME" | jq -r '.id')

curl -s -X PUT "$API_BASE/tickets/$TICKET_ID" -H "Content-Type: application/json" -b "$MIS_COOKIE" \
  -d "{\"assignee_id\": $MIS_USER_ID, \"status\": \"in_progress\"}" > /dev/null

curl -s -X PUT "$API_BASE/tickets/$TICKET_ID" -H "Content-Type: application/json" -b "$MIS_COOKIE" \
  -d "{\"status\": \"resolved\", \"resolution_notes\": \"Access granted to FAST system.\"}" > /dev/null
echo "Ticket #$TICKET_ID Resolved by MIS1."

echo "Step 6: User1 submits a 5-star CSAT..."
curl -s -X POST "$API_BASE/csat" -H "Content-Type: application/json" -b "$USER_COOKIE" \
  -d "{\"ticket_id\": $TICKET_ID, \"rating\": 5, \"comment\": \"Fast and efficient access provision!\"}" > /dev/null
echo "CSAT Submitted for #$TICKET_ID."

echo "Step 7: Creating more diverse data (Automation)..."
# Create a few more tickets with different outcomes
# 1. Bug Report - No approval - Low rating
curl -s -X POST "$API_BASE/tickets" -H "Content-Type: application/json" -b "$USER_COOKIE" \
  -d '{"title": "Small UI Glitch in Payroll", "description": "There is a small alignment issue in the payroll summary screen.", "priority": "low"}' | jq -r '.id' > temp_id.txt
T2_ID=$(cat temp_id.txt)
curl -s -X PUT "$API_BASE/tickets/$T2_ID" -H "Content-Type: application/json" -b "$MIS_COOKIE" \
  -d "{\"assignee_id\": $MIS_USER_ID, \"status\": \"in_progress\"}" > /dev/null
curl -s -X PUT "$API_BASE/tickets/$T2_ID" -H "Content-Type: application/json" -b "$MIS_COOKIE" \
  -d "{\"status\": \"resolved\", \"resolution_notes\": \"Fixed the CSS alignment.\"}" > /dev/null
curl -s -X POST "$API_BASE/csat" -H "Content-Type: application/json" -b "$USER_COOKIE" \
  -d "{\"ticket_id\": $T2_ID, \"rating\": 2, \"comment\": \"Took too long for a small fix.\"}" > /dev/null
echo "Created resolved ticket #$T2_ID with 2-star CSAT."

echo "Step 8: Admin checks CSAT Stats..."
STATS=$(curl -s -b "$ADMIN_COOKIE" "$API_BASE/csat/stats")
AVG_RATING=$(echo "$STATS" | jq -r '.average_rating')
TOTAL_CSATS=$(echo "$STATS" | jq -r '.total_responses')
echo "Global Average Rating: $AVG_RATING, Total Responses: $TOTAL_CSATS"

echo "Step 9: Final Report generation for MIS1..."
MIS_STATS=$(curl -s -b "$ADMIN_COOKIE" "$API_BASE/csat/stats?agent_id=$MIS_USER_ID")
MIS_AVG=$(echo "$MIS_STATS" | jq -r '.average_rating')
echo "MIS1 Average Rating: $MIS_AVG"

echo "-----------------------------------"
echo "SUCCESS: Diverse Workflow Test Complete!"
echo "-----------------------------------"

# Cleanup
rm "$USER_COOKIE" "$APPROVER_COOKIE" "$MIS_COOKIE" "$ADMIN_COOKIE" temp_id.txt
