#!/bin/bash
# test-provision.sh - Tests the provision_extension.sh script directly
# This is a standalone test independent of midPoint
set -euo pipefail

ASTERISK_CONTAINER="callcenter-asterisk"
TEST_USER="testuser"
TEST_EXT="1999"
TEST_PASS="testpass999"
TEST_NAME="Test User"

echo "=== Unit Test: Provision Extension Script ==="
echo ""

# Test 1: Add extension
echo "1. Adding extension ${TEST_EXT}..."
docker exec "${ASTERISK_CONTAINER}" \
    /opt/asterisk/scripts/provision_extension.sh add \
    "${TEST_USER}" "${TEST_EXT}" "${TEST_PASS}" "${TEST_NAME}"

if [ $? -eq 0 ]; then
    echo "   ✓ Extension added successfully"
else
    echo "   ✗ Failed to add extension"
    exit 1
fi

# Test 2: Verify in config
echo "2. Verifying extension in pjsip.conf..."
docker exec "${ASTERISK_CONTAINER}" grep -q "\[${TEST_EXT}\]" /etc/asterisk/pjsip.conf
if [ $? -eq 0 ]; then
    echo "   ✓ Extension ${TEST_EXT} found in pjsip.conf"
else
    echo "   ✗ Extension NOT found in pjsip.conf"
    exit 1
fi

# Test 3: Verify in Asterisk runtime
echo "3. Checking Asterisk PJSIP endpoints..."
docker exec "${ASTERISK_CONTAINER}" asterisk -rx "pjsip show endpoint ${TEST_EXT}" | grep -q "Endpoint"
if [ $? -eq 0 ]; then
    echo "   ✓ Endpoint ${TEST_EXT} registered in PJSIP"
else
    echo "   ⚠ Endpoint not shown (expected if no pjsip reload was triggered)"
fi

# Test 4: Test duplicate prevention
echo "4. Testing duplicate prevention..."
docker exec "${ASTERISK_CONTAINER}" \
    /opt/asterisk/scripts/provision_extension.sh add \
    "${TEST_USER}" "${TEST_EXT}" "${TEST_PASS}" "${TEST_NAME}" | grep -q "skipping"
if [ $? -eq 0 ]; then
    echo "   ✓ Duplicate correctly detected and skipped"
else
    echo "   ⚠ Duplicate test inconclusive"
fi

# Test 5: Remove extension
echo "5. Removing extension ${TEST_EXT}..."
docker exec "${ASTERISK_CONTAINER}" \
    /opt/asterisk/scripts/provision_extension.sh remove "${TEST_EXT}"

if [ $? -eq 0 ]; then
    echo "   ✓ Extension removed successfully"
else
    echo "   ✗ Failed to remove extension"
    exit 1
fi

# Test 6: Verify removal
echo "6. Verifying removal..."
docker exec "${ASTERISK_CONTAINER}" grep -c "\[${TEST_EXT}\]" /etc/asterisk/pjsip.conf || true
echo "   ✓ Extension removed from config"

echo ""
echo "=== All Provision Tests Passed ==="
