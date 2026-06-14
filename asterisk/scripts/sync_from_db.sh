#!/bin/bash
set -euo pipefail

# sync_from_db.sh - Reads active agents from MariaDB and provisions extensions in Asterisk
# This is a fallback sync mechanism; primary integration is via midPoint.

MYSQL_HOST="${MYSQL_HOST:-db}"
MYSQL_USER="${MYSQL_USER:-callcenter}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-CallCenter2024!}"
MYSQL_DATABASE="${MYSQL_DATABASE:-callcenter}"

QUERY="SELECT username, sip_extension, sip_password, full_name FROM users WHERE role='AgenteCallCenter' AND enabled=1 AND sip_extension IS NOT NULL"

mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -e "$QUERY" | while IFS=$'\t' read -r username extension password full_name; do
    if [ -n "$username" ] && [ -n "$extension" ]; then
        /opt/asterisk/scripts/provision_extension.sh add "$username" "$extension" "$password" "$full_name"
    fi
done

echo "Synchronization completed at $(date)"
