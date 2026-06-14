#!/bin/sh
# init-bucket.sh - Creates the recordings bucket in MinIO
set -e

MC_HOST="http://minio:9000"
MC_ALIAS="callcenter"
MC_USER="minioadmin"
MC_PASS="minioadmin123"
BUCKET="recordings"

echo "=== Initializing MinIO bucket ==="

# Configure mc alias
mc alias set ${MC_ALIAS} ${MC_HOST} ${MC_USER} ${MC_PASS}

# Create bucket if not exists
if ! mc ls ${MC_ALIAS}/${BUCKET} > /dev/null 2>&1; then
    mc mb ${MC_ALIAS}/${BUCKET}
    echo "Bucket '${BUCKET}' created"
else
    echo "Bucket '${BUCKET}' already exists"
fi

# Set public read policy for the recordings (optional, for easy access)
mc anonymous set download ${MC_ALIAS}/${BUCKET}

echo "=== MinIO initialized ==="
