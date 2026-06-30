#!/bin/bash
set -euo pipefail

MIDPOINT_URL="${MIDPOINT_URL:-http://localhost:8080/midpoint}"
ADMIN_USER="${ADMIN_USER:-administrator}"
ADMIN_PASS="${ADMIN_PASS:-5ecr3t}"
IMPORT_DIR="${IMPORT_DIR:-/opt/midpoint/var/import}"
RESOURCE_OID="c0ffee01-c0ff-ee01-c0ff-ee01c0ffee01"
ADMIN_ROLE_OID="00000000-0000-0000-0000-000000000030"
AGENT_ROLE_OID="00000000-0000-0000-0000-000000000010"

log()  { echo "[IMPORT] $(date '+%H:%M:%S') $*"; }
fail() { log "ERROR: $*"; exit 1; }

wait_for_midpoint() {
  log "Waiting for midPoint to be ready..."
  for i in $(seq 1 60); do
    if curl -sf "$MIDPOINT_URL/ws/rest/users" -u "$ADMIN_USER:$ADMIN_PASS" > /dev/null 2>&1; then
      log "midPoint REST API is ready (attempt $i)"
      return 0
    fi
    sleep 5
  done
  fail "midPoint did not become ready after 60 attempts"
}

delete_if_exists() {
  local url="$1"
  local label="$2"
  local status
  status=$(curl -sf -o /dev/null -w "%{http_code}" -u "$ADMIN_USER:$ADMIN_PASS" "$url" 2>/dev/null || echo "404")
  if [ "$status" = "200" ]; then
    log "Deleting existing $label..."
    curl -sf -u "$ADMIN_USER:$ADMIN_PASS" -X DELETE "$url" > /dev/null 2>&1 || true
    log "Deleted $label"
  fi
}

import_with_curl() {
  local file="$1"
  local type="$2"
  local label="$3"
  local oid="${4:-}"

  if [ ! -f "$file" ]; then
    log "SKIP: $file not found"
    return 0
  fi

  log "Importing $label..."
  if [ -n "$oid" ]; then
    delete_if_exists "$MIDPOINT_URL/ws/rest/$type/$oid" "$label"
  fi

  local http_code
  http_code=$(curl -s -o /tmp/midpoint_import_response.txt -w "%{http_code}" \
    -u "$ADMIN_USER:$ADMIN_PASS" \
    -X POST \
    -H "Content-Type: application/xml" \
    -H "Accept: application/xml" \
    -d @"$file" \
    "$MIDPOINT_URL/ws/rest/$type" 2>/dev/null || echo "CURL_ERR")

  if [ "$http_code" = "CURL_ERR" ]; then
    log "WARNING: curl failed for $label"
    cat /tmp/midpoint_import_response.txt 2>/dev/null || true
    return 1
  fi

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    log "OK: $label created (HTTP $http_code)"
  elif [ "$http_code" = "409" ]; then
    log "OK: $label already exists (HTTP 409)"
  else
    log "WARNING: $label HTTP $http_code"
    cat /tmp/midpoint_import_response.txt 2>/dev/null | head -c 500 || true
    echo ""
    return 1
  fi
}

import_with_raw() {
  local file="$1"
  local label="$2"

  if [ ! -f "$file" ]; then
    log "SKIP: $file not found"
    return 0
  fi

  local username
  username=$(basename "$file" .xml | sed 's/^[0-9]*-user-//')

  # Check if user already exists
  if curl -sf -o /dev/null -u "$ADMIN_USER:$ADMIN_PASS" "$MIDPOINT_URL/ws/rest/users/$username" 2>/dev/null; then
    log "SKIP: $label ($username) already exists"
    return 0
  fi

  log "Creating $label ($username) via midpoint.sh import -raw..."
  if /opt/midpoint/bin/midpoint.sh import -o "$file" -raw 2>&1; then
    log "OK: $label ($username) created"
  else
    log "WARNING: $label ($username) creation failed (midpoint.sh might not work in container)"
    log "Falling back to REST API..."
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" \
      -u "$ADMIN_USER:$ADMIN_PASS" \
      -X POST \
      -H "Content-Type: application/xml" \
      -H "Accept: application/xml" \
      -d @"$file" \
      "$MIDPOINT_URL/ws/rest/users" 2>/dev/null || echo "CURL_ERR")
    if [ "$status" -ge 200 ] && [ "$status" -lt 300 ] || [ "$status" = "409" ]; then
      log "OK: $label ($username) created via REST (HTTP $status)"
    else
      log "WARNING: $label ($username) failed (HTTP $status)"
      return 1
    fi
  fi
}

verify_users() {
  local all_ok=true
  for u in admin1 admin2 agente1 agente2; do
    if curl -sf -o /dev/null -u "$ADMIN_USER:$ADMIN_PASS" "$MIDPOINT_URL/ws/rest/users/$u" 2>/dev/null; then
      log "VERIFY: '$u' EXISTS"
    else
      log "VERIFY: '$u' MISSING"
      all_ok=false
    fi
  done
  $all_ok
}

# ===== MAIN =====
wait_for_midpoint

log ""
log "=== Step 0: Clean up broken resource ==="
delete_if_exists "$MIDPOINT_URL/ws/rest/resources/$RESOURCE_OID" "DB Resource (broken, no schema)"

log ""
log "=== Step 1: Import roles (no provisioning) ==="
import_with_curl "$IMPORT_DIR/00-role-admin.xml" "roles" "Admin Role" "$ADMIN_ROLE_OID"
import_with_curl "$IMPORT_DIR/00-role-agentecallcenter.xml" "roles" "AgenteCallCenter Role" "$AGENT_ROLE_OID"

log ""
log "=== Step 2: Import object template ==="
import_with_curl "$IMPORT_DIR/00-object-template-user.xml" "objectTemplates" "User Object Template" "00000000-0000-0000-0000-000000000020"

log ""
log "=== Step 3: Import seed users (raw, no provisioning) ==="
for uf in "$IMPORT_DIR"/[0-9][0-9]-user-*.xml; do
  [ -f "$uf" ] || continue
  import_with_raw "$uf" "$(basename "$uf" .xml)"
done

log ""
log "=== Step 4: Verification ==="
if verify_users; then
  log ""
  log "============================================"
  log "SUCCESS: All 4 users are in midPoint!"
  log ""
  log "Continue with: docker-compose up -d auth-svc"
  log "============================================"
  exit 0
else
  log ""
  log "============================================"
  log "WARNING: Some users are still missing"
  log "Check logs above for errors"
  log "============================================"
  exit 1
fi
