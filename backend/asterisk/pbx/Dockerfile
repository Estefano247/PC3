FROM debian:bullseye-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV ASTERISK_VERSION=20.20.1

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
    libopus-dev \
    libogg-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src
RUN curl -sSLO https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VERSION}.tar.gz \
    && tar xzf asterisk-${ASTERISK_VERSION}.tar.gz
WORKDIR /usr/src/asterisk-${ASTERISK_VERSION}
RUN ./configure --with-pjproject-bundled --with-jansson-bundled --with-mysqlclient --with-srtp \
    && make -j$(nproc) && make install && make config && ldconfig
RUN curl -sSLO https://downloads.digium.com/pub/telephony/codec_opus/asterisk-20.0/x86-64/codec_opus-20.0_1.3.0-x86_64.tar.gz \
    && tar xzf codec_opus-20.0_1.3.0-x86_64.tar.gz \
    && cp codec_opus-20.0_1.3.0-x86_64/codec_opus.so /usr/lib/asterisk/modules/ \
    && cp codec_opus-20.0_1.3.0-x86_64/format_ogg_opus.so /usr/lib/asterisk/modules/ 2>/dev/null; \
    cp codec_opus-20.0_1.3.0-x86_64/codec_opus_config-en_US.xml /var/lib/asterisk/documentation/ 2>/dev/null; \
    rm -rf codec_opus-20.0_1.3.0-x86_64*

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
    libopus0 \
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

# SSH provision user setup
RUN apt-get update && apt-get install -y --no-install-recommends openssh-server sudo \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/run/sshd \
    && adduser --disabled-password --gecos "" provision \
    && adduser provision asterisk \
    && mkdir -p /home/provision/.ssh \
    && chmod 700 /home/provision/.ssh \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config \
    && echo "provision ALL=(ALL) NOPASSWD: /usr/sbin/asterisk" >> /etc/sudoers.d/provision \
    && chmod 440 /etc/sudoers.d/provision

COPY config/ /etc/asterisk.default/
COPY scripts/ /opt/asterisk/scripts/
COPY ssh/provision-key.pub /tmp/provision-key.pub

RUN chmod +x /opt/asterisk/scripts/*.sh \
    && cat /tmp/provision-key.pub > /home/provision/.ssh/authorized_keys \
    && chmod 600 /home/provision/.ssh/authorized_keys \
    && chown -R provision:provision /home/provision/.ssh \
    && rm -f /tmp/provision-key.pub

EXPOSE 5060/udp 5060/tcp 8088/tcp 10000-10100/udp

ENTRYPOINT ["/opt/asterisk/scripts/entrypoint.sh"]
