#!/usr/bin/env python3
"""
provision-asterisk.py - Called by midPoint Scripted SQL resource to provision
SIP extensions in Asterisk via SSH.

Arguments (from midPoint execution):
    user_id, username, sip_extension, sip_password, [display_name]
"""
import sys
import subprocess
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("midpoint-asterisk")

SSH_KEY = "/root/.ssh/id_provision"
SSH_USER = "provision"
SSH_HOST = "asterisk"
SSH_BASE = ["ssh", "-i", SSH_KEY, "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes"]


def provision_extension(username, extension, password, display_name=None):
    if display_name is None:
        display_name = username

    cmd = SSH_BASE + [f"{SSH_USER}@{SSH_HOST}",
                      "add", username, extension, password, display_name]
    log.info(f"Running SSH provision for {extension}")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    if result.returncode == 0:
        log.info(f"Provisioned extension {extension} for {username}: {result.stdout.strip()}")
    else:
        log.error(f"SSH provision failed: {result.stderr.strip()}")
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
