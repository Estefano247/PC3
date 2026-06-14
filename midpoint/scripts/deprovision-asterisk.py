#!/usr/bin/env python3
"""
deprovision-asterisk.py - Removes a SIP extension from Asterisk.

Arguments:
    extension
"""
import sys
import subprocess
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("midpoint-asterisk")


def deprovision_extension(extension):
    result = subprocess.run(
        ["/opt/asterisk/scripts/provision_extension.sh", "remove", extension],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode == 0:
        log.info(f"Deprovisioned extension {extension}: {result.stdout.strip()}")
    else:
        log.error(f"Deprovision failed: {result.stderr.strip()}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        log.error("Usage: deprovision-asterisk.py <extension>")
        sys.exit(1)

    deprovision_extension(sys.argv[1])
