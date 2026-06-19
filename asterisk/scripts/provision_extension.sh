#!/bin/bash
set -euo pipefail

# provision_extension.sh - Called by midPoint via REST or volume-mounted execution
# Adds/removes SIP extensions in Asterisk pjsip.conf and reloads configuration.
#
# Usage:
#   provision_extension.sh add <username> <extension> <password> [display_name]
#   provision_extension.sh remove <extension>

ASTERISK_CONFIG="/etc/asterisk"
PJSIP_CONF="${ASTERISK_CONFIG}/pjsip.conf"

ASTERISK_CMD="sudo -u asterisk asterisk"

function add_extension() {
    local username="$1"
    local extension="$2"
    local password="$3"
    shift 3
    local display_name="${*:-$username}"

    if grep -q "^\[${extension}\]" "$PJSIP_CONF"; then
        echo "Extension ${extension} already exists, skipping"
        return 0
    fi

    cat >> "$PJSIP_CONF" <<EOF

[${extension}]
type = endpoint
context = callcenter
disallow = all
allow = ulaw
allow = alaw
auth = ${extension}-auth
aors = ${extension}
callerid = "${display_name}" <${extension}>
webrtc = yes
transport = transport-ws
identify_by = username

[${extension}-auth]
type = auth
auth_type = userpass
password = ${password}
username = ${extension}

[${extension}]
type = aor
max_contacts = 1
EOF

    ${ASTERISK_CMD} -rx "module reload res_pjsip.so" || true
    echo "Extension ${extension} provisioned successfully"
}

function remove_extension() {
    local extension="$1"

    sed -i "/^\[${extension}\]/,/^$/d" "$PJSIP_CONF"
    ${ASTERISK_CMD} -rx "module reload res_pjsip.so" || true
    echo "Extension ${extension} removed successfully"
}

case "${1:-}" in
    add)
        if [ $# -lt 4 ]; then
            echo "Usage: $0 add <username> <extension> <password> [display_name]"
            exit 1
        fi
        add_extension "$2" "$3" "$4" "${5:-}"
        ;;
    remove)
        if [ $# -lt 2 ]; then
            echo "Usage: $0 remove <extension>"
            exit 1
        fi
        remove_extension "$2"
        ;;
    *)
        echo "Usage: $0 {add|remove} ..."
        exit 1
        ;;
esac
