FROM evolveum/midpoint:4.8

USER root

RUN mkdir -p /opt/midpoint/scripts

COPY scripts/ /opt/midpoint/scripts/

RUN chmod +x /opt/midpoint/scripts/*.sh 2>/dev/null || true

USER root
