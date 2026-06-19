#!/usr/bin/env python3
"""
deprovision-asterisk.py - Removes a SIP extension from Asterisk via SSH.

Arguments:
    extension
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


def deprovision_extension(extension):
    cmd = SSH_BASE + [f"{SSH_USER}@{SSH_HOST}", "remove", extension]
    log.info(f"Running SSH deprovision for {extension}")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    if result.returncode == 0:
        log.info(f"Deprovisioned extension {extension}: {result.stdout.strip()}")
    else:
        log.error(f"SSH deprovision failed: {result.stderr.strip()}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        log.error("Usage: deprovision-asterisk.py <extension>")
        sys.exit(1)

    deprovision_extension(sys.argv[1])
