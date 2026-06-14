#!/usr/bin/env python3
"""
provision-asterisk.py - Called by midPoint Scripted SQL resource to provision
SIP extensions in Asterisk via REST API (ARI) or SSH.

Arguments (from midPoint execution):
    user_id, username, sip_extension, sip_password
"""
import sys
import requests
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("midpoint-asterisk")

ASTERISK_ARI_URL = "http://asterisk:8088/ari"
ASTERISK_ARI_USER = "admin"
ASTERISK_ARI_PASS = "Chang3M3!"


def provision_extension(username, extension, password, display_name=None):
    """Add a SIP extension via Asterisk ARI or fallback to HTTP endpoint."""
    if display_name is None:
        display_name = username

    payload = {
        "username": username,
        "extension": extension,
        "password": password,
        "display_name": display_name,
    }

    try:
        resp = requests.post(
            f"{ASTERISK_ARI_URL}/endpoints/sip/{extension}",
            auth=(ASTERISK_ARI_USER, ASTERISK_ARI_PASS),
            json=payload,
            timeout=10,
        )
        if resp.ok:
            log.info(f"Provisioned extension {extension} for {username}")
        else:
            log.warning(f"ARI returned {resp.status_code}: {resp.text}")
            log.info("Falling back to volume-mounted script execution...")
            _fallback_script(username, extension, password, display_name)
    except requests.ConnectionError:
        log.warning("ARI not reachable, using volume-mounted script")
        _fallback_script(username, extension, password, display_name)


def _fallback_script(username, extension, password, display_name):
    """Fallback: write to a shared volume that Asterisk picks up."""
    import subprocess
    result = subprocess.run(
        ["/opt/asterisk/scripts/provision_extension.sh", "add",
         username, extension, password, display_name],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode == 0:
        log.info(f"Fallback script succeeded: {result.stdout.strip()}")
    else:
        log.error(f"Fallback script failed: {result.stderr.strip()}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 4:
        log.error("Usage: provision-asterisk.py <user_id> <username> <extension> <password> [display_name]")
        sys.exit(1)

    user_id = sys.argv[1]
    username = sys.argv[2]
    extension = sys.argv[3]
    password = sys.argv[4]
    display_name = sys.argv[5] if len(sys.argv) > 5 else None

    provision_extension(username, extension, password, display_name)
