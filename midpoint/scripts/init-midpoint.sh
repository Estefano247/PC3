#!/bin/bash
set -euo pipefail

MIDPOINT_HOME="${MIDPOINT_HOME:-/opt/midpoint/var}"
INIT_DONE="${MIDPOINT_HOME}/.init-done"

# Start midPoint in background
echo "Starting midPoint..."
/opt/midpoint/bin/midpoint.sh container &

# Wait for midPoint to be healthy
echo "Waiting for midPoint to be healthy..."
for i in $(seq 1 60); do
    if curl -sf http://localhost:8080/midpoint/actuator/health > /dev/null 2>&1; then
        echo "midPoint is healthy!"
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "midPoint failed to become healthy"
        exit 1
    fi
    sleep 5
done

# Run initial imports only on first startup
if [ ! -f "${INIT_DONE}" ]; then
    echo "First startup - running initial imports..."
    if /opt/midpoint/scripts/import-all.sh "http://localhost:8080/midpoint" "administrator"; then
        touch "${INIT_DONE}"
        echo "Initial imports completed."
    else
        echo "Initial imports failed - will retry on next restart"
    fi
else
    echo "Initial imports already completed, skipping."
fi

# Keep running in foreground
wait
