#!/bin/bash
# trivy-scan.sh - Vulnerability analysis of Docker images
# Usage: ./trivy-scan.sh

set -euo pipefail

IMAGES=(
    "mariadb:10.6"
    "evolveum/midpoint:4.8"
    "callcenter-asterisk:latest"
)

echo "=== Docker Image Vulnerability Scan ==="
echo ""

for image in "${IMAGES[@]}"; do
    echo "--- Scanning: ${image} ---"

    if docker image inspect "$image" &>/dev/null; then
        trivy image --severity CRITICAL,HIGH --exit-code 0 "$image" | tail -n +2
        echo ""
    else
        echo "Image ${image} not found locally. Pulling..."
        docker pull "$image" 2>/dev/null || true
        trivy image --severity CRITICAL,HIGH --exit-code 0 "$image" | tail -n +2
        echo ""
    fi
done

echo "=== Scan Complete ==="
echo ""
echo "To install trivy: https://trivy.dev/latest/getting-started/installation/"
