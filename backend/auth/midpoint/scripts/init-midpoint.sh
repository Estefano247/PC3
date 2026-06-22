#!/bin/bash
set -euo pipefail

echo "Starting midPoint..."
exec /opt/midpoint/bin/midpoint.sh container
