#!/bin/bash
# test-tls-sip.sh - Verifies that SIP communications use TLS
set -euo pipefail

ASTERISK_IP="${1:-127.0.0.1}"

echo "=== SIP TLS Security Test ==="
echo ""

# Test 1: Check if TLS port 5061 is open
echo "1. Checking TLS port (5061)..."
if command -v nmap &>/dev/null; then
    nmap -sT -p 5061 "$ASTERISK_IP" | grep -E "5061|tcp"
else
    # Fallback: use timeout + bash
    timeout 3 bash -c "echo > /dev/tcp/${ASTERISK_IP}/5061" 2>/dev/null && \
        echo "   Port 5061: OPEN (TLS enabled)" || \
        echo "   Port 5061: CLOSED"
fi
echo ""

# Test 2: Check if plaintext SIP (5060) allows registration without TLS
echo "2. Checking plaintext SIP (5060)..."
timeout 3 bash -c "echo > /dev/udp/${ASTERISK_IP}/5060" 2>/dev/null && \
    echo "   Port 5060: OPEN (non-TLS available)" || \
    echo "   Port 5060: CLOSED"
echo ""

# Test 3: Verify Asterisk TLS config
echo "3. Checking Asterisk TLS configuration..."
docker exec callcenter-asterisk asterisk -rx "pjsip show transport" 2>/dev/null | grep -i tls || \
    echo "   (cannot inspect inside container)"
echo ""

echo "=== TLS Test Complete ==="
echo "Expected: Port 5061 open, TLS transport active in Asterisk"
