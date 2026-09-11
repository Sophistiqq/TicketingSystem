#!/bin/bash

# Master test runner for Monolith Ticketing System
# Ensure jq is installed

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Check dependencies
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: 'jq' is not installed. Please install it first.${NC}"
    exit 1
fi

echo -e "${BOLD}Starting Full System Workflow Validation...${NC}"
echo "--------------------------------------------------"

# List of tests in logical order
TESTS=("test_workflow.sh" "test_collaboration.sh" "test_sla.sh" "test_csat.sh")
FAILED=()

# Make sure all are executable
chmod +x "${TESTS[@]}"

for script in "${TESTS[@]}"; do
    echo -e "\n${BOLD}Running: $script${NC}"
    echo ".................................................."
    
    ./"$script"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $script passed!${NC}"
    else
        echo -e "${RED}✗ $script failed!${NC}"
        FAILED+=("$script")
    fi
    echo ".................................................."
done

echo -e "\n--------------------------------------------------"
echo -e "${BOLD}Final Summary:${NC}"

if [ ${#FAILED[@]} -eq 0 ]; then
    echo -e "${GREEN}ALL TESTS PASSED SUCCESSFULLY!${NC}"
    exit 0
else
    echo -e "${RED}SOME TESTS FAILED:${NC}"
    for f in "${FAILED[@]}"; do
        echo -e "${RED}  - $f${NC}"
    done
    exit 1
fi
