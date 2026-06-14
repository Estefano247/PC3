#!/bin/bash
# generate-tls-certs.sh - Genera certificados autofirmados para SIP TLS
set -euo pipefail

KEY_DIR="$(dirname "$0")/../asterisk/config/keys"
mkdir -p "$KEY_DIR"

DAYS=3650
BITS=2048
CN="callcenter-asterisk.local"

echo "=== Generando certificados TLS para Asterisk ==="

# 1. Generar clave privada
openssl genrsa -out "${KEY_DIR}/asterisk.key" ${BITS}
chmod 600 "${KEY_DIR}/asterisk.key"
echo "  ✓ Clave privada: ${KEY_DIR}/asterisk.key"

# 2. Generar CSR
openssl req -new -key "${KEY_DIR}/asterisk.key" \
    -out "${KEY_DIR}/asterisk.csr" \
    -subj "/C=ES/ST=Madrid/L=Madrid/O=CallCenter/OU=Infra/CN=${CN}"
echo "  ✓ CSR: ${KEY_DIR}/asterisk.csr"

# 3. Generar certificado autofirmado
openssl x509 -req -days ${DAYS} \
    -in "${KEY_DIR}/asterisk.csr" \
    -signkey "${KEY_DIR}/asterisk.key" \
    -out "${KEY_DIR}/asterisk.pem"
echo "  ✓ Certificado: ${KEY_DIR}/asterisk.pem"

# 4. Verificar
echo ""
echo "=== Verificación del certificado ==="
openssl x509 -in "${KEY_DIR}/asterisk.pem" -text -noout | head -12

echo ""
echo "=== TLS Certificates Generated ==="
echo "Copiar a asterisk/config/keys/ y reconstruir el contenedor:"
echo "  docker compose build asterisk && docker compose up -d"
