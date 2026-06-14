#!/bin/bash
# run-load-test.sh - Executes 10 concurrent calls using SIPp
# Usage: ./run-load-test.sh <asterisk_ip>

set -euo pipefail

ASTERISK_IP="${1:-127.0.0.1}"
SIPP_SCENARIO="$(dirname "$0")/calls.xml"
DURATION_SECONDS=30
CONCURRENT_CALLS=10
RATE=2

echo "=== CallCenter Load Test ==="
echo "Target: ${ASTERISK_IP}:5060"
echo "Concurrent calls: ${CONCURRENT_CALLS}"
echo "Duration: ${DURATION_SECONDS}s"
echo ""

if ! command -v sipp &>/dev/null; then
    echo "SIPp not found. Install it with:"
    echo "  sudo apt-get install sipp"
    echo ""
    echo "Or run via Docker:"
    echo "  docker run --rm -v \$(pwd):/tests sipp/sipp -sf /tests/calls.xml ${ASTERISK_IP} -l ${CONCURRENT_CALLS} -r ${RATE} -m 1"
    exit 1
fi

sipp -sf "$SIPP_SCENARIO" \
     "${ASTERISK_IP}:5060" \
     -l "${CONCURRENT_CALLS}" \
     -r "${RATE}" \
     -m 1 \
     -d "${DURATION_SECONDS}" \
     -trace_stat \
     -stf "load-test-results.csv" \
     -fd 1

echo ""
echo "Results written to load-test-results.csv"
echo "=== Load Test Complete ==="
