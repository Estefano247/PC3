#!/bin/bash
# import-resource.sh - Imports the CallCenter DB resource into midPoint via REST API
# This should be run after midPoint is fully started.

set -euo pipefail

MIDPOINT_URL="${1:-http://localhost:8080/midpoint}"
ADMIN_USER="${2:-administrator}"
ADMIN_PASS="${3:-Chang3M3!}"
RESOURCE_FILE="${4:-/opt/midpoint/init/resource-scripted-sql.xml}"

echo "Waiting for midPoint to be ready..."
for i in $(seq 1 30); do
    if curl -sf "${MIDPOINT_URL}/ws/health" > /dev/null 2>&1; then
        echo "midPoint is ready!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 5
done

echo "Importing CallCenter DB resource..."
HTTP_CODE=$(curl -s -o /tmp/midpoint-import.log -w "%{http_code}" \
    -u "${ADMIN_USER}:${ADMIN_PASS}" \
    -X POST \
    -H "Content-Type: application/xml" \
    -H "Accept: application/xml" \
    -d @"${RESOURCE_FILE}" \
    "${MIDPOINT_URL}/ws/rest/resources/import")

if [ "${HTTP_CODE}" -ge 200 ] && [ "${HTTP_CODE}" -lt 300 ]; then
    echo "Resource imported successfully (HTTP ${HTTP_CODE})"
    cat /tmp/midpoint-import.log
else
    echo "Failed to import resource (HTTP ${HTTP_CODE})"
    cat /tmp/midpoint-import.log
    exit 1
fi
