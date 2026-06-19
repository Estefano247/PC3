#!/bin/bash
set -euo pipefail

MIDPOINT_URL="${1:-http://localhost:8080/midpoint}"
ADMIN_USER="${2:-administrator}"
ADMIN_PASS="${3:-5ecr3t}"
INIT_DIR="${4:-/opt/midpoint/init}"

echo "Importing CallCenter DB resource..."
curl -s -X POST \
    -u "${ADMIN_USER}:${ADMIN_PASS}" \
    -H "Content-Type: application/xml" \
    -H "Accept: application/xml" \
    -d @"${INIT_DIR}/resource-scripted-sql.xml" \
    "${MIDPOINT_URL}/ws/rest/resources" \
    -w "\nHTTP_CODE:%{http_code}\n" | tee /tmp/mp-import.log | tail -1 | grep -q "HTTP_CODE:2" && echo "  OK" || { echo "  FAILED"; cat /tmp/mp-import.log; exit 1; }

echo "Importing AgenteCallCenter role..."
curl -s -X POST \
    -u "${ADMIN_USER}:${ADMIN_PASS}" \
    -H "Content-Type: application/xml" \
    -H "Accept: application/xml" \
    -d @"${INIT_DIR}/role-agentecallcenter.xml" \
    "${MIDPOINT_URL}/ws/rest/roles" \
    -w "\nHTTP_CODE:%{http_code}\n" | tee /tmp/mp-import.log | tail -1 | grep -q "HTTP_CODE:2" && echo "  OK" || { echo "  FAILED"; cat /tmp/mp-import.log; exit 1; }

echo "Importing User Account object template..."
curl -s -X POST \
    -u "${ADMIN_USER}:${ADMIN_PASS}" \
    -H "Content-Type: application/xml" \
    -H "Accept: application/xml" \
    -d @"${INIT_DIR}/object-template-user.xml" \
    "${MIDPOINT_URL}/ws/rest/objectTemplates" \
    -w "\nHTTP_CODE:%{http_code}\n" | tee /tmp/mp-import.log | tail -1 | grep -q "HTTP_CODE:2" && echo "  OK" || { echo "  FAILED"; cat /tmp/mp-import.log; exit 1; }

echo "All imports completed successfully."
