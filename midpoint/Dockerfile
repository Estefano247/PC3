FROM evolveum/midpoint:4.8

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    python3-requests \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/midpoint/scripts /opt/midpoint/init /root/.ssh

COPY scripts/ /opt/midpoint/scripts/
COPY config/ /opt/midpoint/init/
COPY ssh/provision-key /root/.ssh/id_provision

RUN chmod +x /opt/midpoint/scripts/*.py /opt/midpoint/scripts/*.sh 2>/dev/null || true \
    && chmod 600 /root/.ssh/id_provision

USER root
