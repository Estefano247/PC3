FROM evolveum/midpoint:4.8

USER root

RUN mkdir -p /opt/midpoint/scripts /opt/midpoint/init

COPY scripts/ /opt/midpoint/scripts/
COPY config/ /opt/midpoint/init/

RUN chmod +x /opt/midpoint/scripts/*.py /opt/midpoint/scripts/*.sh 2>/dev/null || true

USER root
