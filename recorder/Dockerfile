FROM alpine:3.19

RUN apk add --no-cache inotify-tools curl

COPY --from=minio/mc:latest /usr/bin/mc /usr/bin/mc

COPY scripts/ /opt/recorder/scripts/

RUN chmod +x /opt/recorder/scripts/*.sh

ENTRYPOINT ["/bin/sh", "-c", "/opt/recorder/scripts/init-bucket.sh; /opt/recorder/scripts/watch-upload.sh"]
