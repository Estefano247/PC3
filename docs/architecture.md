# Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        callcenter-net (172.20.0.0/16)                       │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────────────────┐│
│  │   MariaDB:3306   │    │  midPoint:8080   │    │  Asterisk               ││
│  │                  │    │                  │    │  5060/udp (SIP)         ││
│  │  -  users       │◄──►│  - Scripted SQL  │    │  5061/tcp (TLS)        ││
│  │  -  cdr         │    │    Resource      │    │  8088/tcp (ARI HTTP)   ││
│  │  -  recordings  │    │  - Role RBAC     │    │  8089/tcp (WebSocket)  ││
│  │  -  audit_log   │    │  - Sync. React.  │────►│  10000-10100 (RTP)     ││
│  │                   │    │                  │    │  MixMonitor (record)  ││
│  └─────────────────┘    └─────────────────┘    └──────────┬───────────────┘│
│                                                            │               │
│  ┌─────────────────┐                          ┌────────────┴──────────┐   │
│  │  MinIO S3:9000  │◄── upload ──────────────┤  recorder (inotify)   │   │
│  │  (recordings/)  │     (mc cp)             │  watch-upload.sh      │   │
│  └────────┬────────┘                          └───────────────────────┘   │
│           │                                                               │
│           │ proxy                       ws (nginx → asterisk:8088/8089)   │
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
                                                │  │  Browser WebPhone │   │
                                                │  │  http://:3000     │   │
                                                │  │  agente1/agente2  │   │
                                                │  └──────────────────┘   │
                                                │  ┌──────────────────┐   │
                                                │  │  MicroSIP/Zoiper  │   │
                                                │  │  (UDP/TCP)       │   │
                                                │  │  agente1/agente2  │   │
                                                │  └──────────────────┘   │
                                                └─────────────────────────┘
```

## Frontend Options

| Option | How To | Port | Requirements |
|--------|--------|------|-------------|
| **WebRTC WebPhone** | `http://localhost:3000` | 3000 | Chrome/Firefox/Edge |
| **MicroSIP** | Configurar: server=host:5060, user=1001, pass=sip1001pass | 5060 | MicroSIP installed |
| **Zoiper** | Configurar: domain=host, user=1001, pass=sip1001pass | 5060 | Zoiper installed |
| **Linphone** | Configurar: SIP identity=sip:1001@host | 5060 | Linphone installed |

## Data Flow

1. **User Registration**: Admin creates user in midPoint (or directly in DB)
2. **Role Assignment**: User assigned role `AgenteCallCenter` in midPoint
3. **Synchronization**: midPoint Scripted SQL resource detects the new user
4. **Provisioning**: midPoint executes `provision-asterisk.py` which calls the provision script
5. **SIP Extension**: Script adds endpoint/auth/aor to `pjsip.conf` and reloads Asterisk
6. **Softphone Registration**: Agent opens `http://localhost:3000` or configures desktop softphone
7. **Call**: Agent dials another extension → Asterisk routes call via PJSIP
8. **CDR**: Call details written to `cdr` table in MariaDB
9. **Audit**: All authentication events logged to `audit_log` table

## Recording Flow

```
Agent 1001 calls 1002
        │
        ▼
Asterisk MixMonitor records to /var/spool/asterisk/monitor/
        │
        ▼
recorder container (inotify) detects new .wav file
        │
        ▼
mc cp → MinIO bucket "recordings" (S3-compatible)
        │
        ▼
Frontend polls /recordings/ URL → lists files with audio player
```

## Security Architecture

- **TLS**: SIP traffic encrypted on port 5061
- **RBAC**: Roles control who can call whom (contexts: callcenter, supervisors, admins)
- **Isolation**: Docker bridge network separates services from host
- **WebSocket**: WebRTC clients connect via nginx proxy (`ws://localhost:3000/ws` → Asterisk port 8088) or directly to port 8089
- **Audit Trail**: Every access logged with username, extension, timestamp, IP
