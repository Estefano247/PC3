# Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        callcenter-net (172.20.0.0/16)                       │
│                                                                             │
│  ┌─────────────────────┐    ┌─────────────────┐    ┌──────────────────────────┐│
│  │   PostgreSQL 15     │    │  midPoint:8080   │    │  Asterisk               ││
│  │                     │    │                  │    │  5060/udp+tcp (SIP)    ││
│  │  -  midpoint DB    │◄──►│  - DatabaseTable │    │  8088/tcp (WS+ARI)     ││
│  │  -  callcenter DB  │    │    Connector     │    │  10000-10100 (RTP)     ││
│  │    . users         │    │  - Role RBAC     │    │  MixMonitor (record)   ││
│  │    . cdr           │    │  - Object Tmpl.  │────►│                        ││
│  │    . recordings    │    │  - Groovy Mappings│   │                        ││
│  │    . audit_log     │    │                   │    │                        ││
│  └─────────────────────┘    └─────────────────┘    └──────────────────────────┘│
│                                                            │               │
│  ┌─────────────────┐                          ┌────────────┴──────────┐   │
│  │  MinIO S3:9000  │◄── upload ──────────────┤  recorder (inotify)   │   │
│  │  (recordings/)  │     (mc cp)             │  watch-upload.sh      │   │
│  └────────┬────────┘                          └───────────────────────┘   │
│           │                                                               │
 │           │ proxy                       ws (nginx → asterisk:8088/ws)     │
│  ┌────────▼──────────┐                              │                     │
│  │  Frontend:3000     │◄─────────────────────────────┘                     │
│  │  (SIP.js + Nginx)  │                                                   │
│  └────────────────────┘                                                   │
└────────────────────────────────────────────────────────────┼──────────────┘
                                                             │
                                                ┌────────────▼────────────┐
                                                │     Internet / LAN      │
                                                │                          │
                                                 │  ┌──────────────────┐   │
                                                 │  │  Browser WebPhone  │   │
                                                 │  │  http://localhost  │   │
                                                 │  │  :3000            │   │
                                                 │  │  ext. 3001/admin  │   │
                                                 │  └──────────────────┘   │
                                                 └─────────────────────────┘
```

## Frontend Options

| Option | How To | Port | Requirements |
|--------|--------|------|-------------|
| **WebRTC WebPhone** | `http://localhost:3000` | 3000 | Chrome/Firefox/Edge |

> Solo se expone el WebPhone vía SIP.js. Para usar softphones de escritorio (MicroSIP, Zoiper, Linphone), debe exponerse el puerto SIP 5060 en el host y configurarse `pjsip.conf` con endpoints manuales.

## Data Flow

1. **User Registration**: Admin creates user in midPoint UI with role `AgenteCallCenter`
2. **Synchronization**: midPoint DatabaseTable Connector (Live Sync) detecta el nuevo usuario en `callcenter.users`
3. **Correlation & Mapping**: midPoint correlaciona el usuario y ejecuta Groovy mappings del object template
4. **Provisioning**: Los mappings generan `sip_extension` y `sip_password` y los escriben en la tabla `users` de PostgreSQL
5. **Asterisk reads config**: Asterisk via `extconfig.conf` consulta `users` en PostgreSQL en tiempo real
6. **Softphone Registration**: Agent opens `http://localhost:3000` and registers with extension/password
7. **Call**: Agent dials another extension → Asterisk routes call via PJSIP
8. **CDR**: Call details written to `cdr` table in PostgreSQL
9. **Audit**: All authentication events logged to `audit_log` table

## Recording Flow

```
Agent 3001 calls another extension
        │
        ▼
Asterisk MixMonitor records to /var/spool/asterisk/monitor/
        │
        ▼
recorder container (inotify + mc alias con retry)
detects new .wav file → mc cp to MinIO
        │
        ▼
MinIO bucket "recordings" (S3-compatible)
        │
        ▼
Frontend via Nginx proxy (/recordings/ → minio:9000/recordings/)
lists files with <audio> player
```

## Security Architecture

- **RBAC**: Roles control who can call whom (contexts: callcenter, admins)
- **Isolation**: Docker bridge network separates services from host
- **WebSocket**: WebRTC clients connect to Asterisk via `ws://localhost:8088/ws` (transporte WS en puerto 8088)
- **Audit Trail**: Every access logged in `audit_log` table with username, extension, timestamp, IP
- **SSH provisioning**: midPoint provisiona extensiones vía SSH con claves y comando restringido (forced command)
