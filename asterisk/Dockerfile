FROM debian:bullseye-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV ASTERISK_VERSION=20.20.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    wget \
    curl \
    libssl-dev \
    libncurses5-dev \
    libxml2-dev \
    libsqlite3-dev \
    uuid-dev \
    libjansson-dev \
    libedit-dev \
    pkg-config \
    ca-certificates \
    default-libmysqlclient-dev \
    libsrtp2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src
RUN wget -q https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VERSION}.tar.gz \
    && tar xzf asterisk-${ASTERISK_VERSION}.tar.gz
WORKDIR /usr/src/asterisk-${ASTERISK_VERSION}
RUN ./configure --with-pjproject-bundled --with-jansson-bundled --with-mysqlclient --with-srtp
RUN make menuselect/menuselect menuselect-tree && make -j$(nproc) && make install && make config && ldconfig

FROM debian:bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl1.1 \
    libxml2 \
    libsqlite3-0 \
    libuuid1 \
    libjansson4 \
    libedit2 \
    libncursesw5 \
    libmariadb3 \
    curl \
    ca-certificates \
    mariadb-client \
    openssl \
    libsrtp2-1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/lib/asterisk /usr/lib/asterisk
COPY --from=builder /usr/sbin/asterisk /usr/sbin/asterisk
COPY --from=builder /usr/sbin/safe_asterisk /usr/sbin/safe_asterisk
COPY --from=builder /var/lib/asterisk /var/lib/asterisk
COPY --from=builder /usr/lib/x86_64-linux-gnu/libmysqlclient* /usr/lib/x86_64-linux-gnu/
COPY --from=builder /usr/lib/libasteriskssl* /usr/lib/
COPY --from=builder /usr/lib/libasteriskpj* /usr/lib/

RUN mkdir -p /var/log/asterisk /var/run/asterisk /var/spool/asterisk /var/spool/asterisk/monitor /etc/asterisk/keys \
    && addgroup --system asterisk \
    && adduser --system --ingroup asterisk asterisk \
    && chown -R asterisk:asterisk /var/log/asterisk /var/run/asterisk /var/spool/asterisk

COPY config/ /etc/asterisk.default/
COPY scripts/ /opt/asterisk/scripts/

RUN chmod +x /opt/asterisk/scripts/*.sh

EXPOSE 5060/udp 5060/tcp 5061/tcp 8088/tcp 8089/tcp 5038/tcp 10000-10100/udp

ENTRYPOINT ["/opt/asterisk/scripts/entrypoint.sh"]
