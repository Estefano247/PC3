#!/bin/sh
# init-bucket.sh - Creates the recordings bucket in MinIO

MC_HOST="http://minio:9000"
MC_ALIAS="callcenter"
MC_USER="minioadmin"
MC_PASS="minioadmin123"
BUCKET="recordings"

echo "=== Initializing MinIO bucket ==="

# Retry configuring mc alias until MinIO is ready
for i in $(seq 1 30); do
    mc alias set ${MC_ALIAS} ${MC_HOST} ${MC_USER} ${MC_PASS} > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "Connected to MinIO (attempt $i)"
        break
    fi
    echo "Waiting for MinIO... (attempt $i)"
    sleep 2
done

# Create bucket if not exists
mc ls ${MC_ALIAS}/${BUCKET} > /dev/null 2>&1
if [ $? -ne 0 ]; then
    mc mb ${MC_ALIAS}/${BUCKET} && echo "Bucket '${BUCKET}' created"
else
    echo "Bucket '${BUCKET}' already exists"
fi

# Set public read policy for the recordings (optional, for easy access)
mc anonymous set download ${MC_ALIAS}/${BUCKET} > /dev/null 2>&1

echo "=== MinIO initialized ==="
