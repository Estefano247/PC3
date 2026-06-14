#!/bin/sh
# watch-upload.sh - Watches the Asterisk recording directory and uploads to MinIO
set -e

MC_ALIAS="callcenter"
BUCKET="recordings"
WATCH_DIR="/recordings"
UPLOADED_LOG="/tmp/uploaded.log"

echo "=== Starting recording watcher ==="
echo "Watching: ${WATCH_DIR}"
echo "Uploading to: ${MC_ALIAS}/${BUCKET}"

touch "${UPLOADED_LOG}"

upload_file() {
    local file="$1"
    local filename=$(basename "$file")

    # Skip if already uploaded
    if grep -q "^${filename}$" "${UPLOADED_LOG}" 2>/dev/null; then
        return
    fi

    echo "[$(date)] Uploading: ${filename}..."
    mc cp "${file}" "${MC_ALIAS}/${BUCKET}/${filename}" 2>/dev/null

    if [ $? -eq 0 ]; then
        echo "${filename}" >> "${UPLOADED_LOG}"
        echo "[$(date)] Uploaded: ${filename}"
    else
        echo "[$(date)] Failed to upload: ${filename}"
    fi
}

# Upload existing files first
echo "Uploading existing recordings..."
for f in ${WATCH_DIR}/*.wav; do
    [ -f "$f" ] && upload_file "$f"
done

# Watch for new files
echo "Watching for new recordings..."
inotifywait -m -e close_write --format '%w%f' "${WATCH_DIR}" | while read file; do
    case "$file" in
        *.wav)
            sleep 2
            upload_file "$file"
            ;;
    esac
done
