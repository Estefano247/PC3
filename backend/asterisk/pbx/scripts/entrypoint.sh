#!/bin/bash
set -euo pipefail

CONFIG_DIR="/etc/asterisk"
KEYS_DIR="${CONFIG_DIR}/keys"
DEFAULT_CONFIG_DIR="/etc/asterisk.default"

# If config directory is empty (first run with named volume), restore defaults
if [ ! -f "${CONFIG_DIR}/asterisk.conf" ]; then
    echo "Config directory empty, restoring default configuration..."
    cp -r "${DEFAULT_CONFIG_DIR}/." "${CONFIG_DIR}/"
    echo "Default configuration restored."
fi

# Always ensure template sections and static endpoints exist in pjsip.conf
if [ -f "${DEFAULT_CONFIG_DIR}/pjsip.conf" ]; then
    # Extract template lines from default (lines starting with [ and ending with (!))
    # and static endpoints (like [3001]) to ensure they exist in current config
    while IFS= read -r section; do
        if ! grep -qF "$section" "${CONFIG_DIR}/pjsip.conf" 2>/dev/null; then
            echo "Adding missing section ${section} to pjsip.conf"
            sed -n "/^${section}/,/^\[/p" "${DEFAULT_CONFIG_DIR}/pjsip.conf" | head -n -1 >> "${CONFIG_DIR}/pjsip.conf"
        fi
    done < <(grep -E '^\[[a-zA-Z0-9_-]+\]' "${DEFAULT_CONFIG_DIR}/pjsip.conf" | grep -v '^\[global\]$')
fi

# Generate TLS certificates if they don't exist
if [ ! -f "${KEYS_DIR}/asterisk.pem" ] || [ ! -f "${KEYS_DIR}/asterisk.key" ]; then
    echo "Generating self-signed TLS certificates for SIP..."
    mkdir -p "${KEYS_DIR}"
    openssl genrsa -out "${KEYS_DIR}/asterisk.key" 2048 2>/dev/null
    openssl req -new -key "${KEYS_DIR}/asterisk.key" \
        -out "${KEYS_DIR}/asterisk.csr" \
        -subj "/C=ES/ST=Madrid/L=Madrid/O=CallCenter/OU=Infra/CN=callcenter-asterisk.local" 2>/dev/null
    openssl x509 -req -days 3650 \
        -in "${KEYS_DIR}/asterisk.csr" \
        -signkey "${KEYS_DIR}/asterisk.key" \
        -out "${KEYS_DIR}/asterisk.pem" 2>/dev/null
    rm -f "${KEYS_DIR}/asterisk.csr"
    echo "TLS certificates generated."
fi

# Ensure proper permissions
chown -R asterisk:asterisk "${CONFIG_DIR}" 2>/dev/null || true
chmod g+w "${CONFIG_DIR}/pjsip.conf" 2>/dev/null || true

# Ensure recording directory is writable by asterisk
mkdir -p /var/spool/asterisk/monitor
chown -R asterisk:asterisk /var/spool/asterisk/monitor 2>/dev/null || true

# Start SSH daemon for midPoint provisioning
if [ -f /usr/sbin/sshd ]; then
    echo "Starting SSH daemon..."
    /usr/sbin/sshd
fi

# Start Asterisk
exec asterisk -f -vvv -C "${CONFIG_DIR}/asterisk.conf"
