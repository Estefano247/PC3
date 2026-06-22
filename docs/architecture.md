# Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         callcenter-net (172.20.0.0/16)                          │
│                                                                                 │
│  ┌──────────────────────┐    ┌──────────────────┐    ┌────────────────────────┐ │
│  │   PostgreSQL 15      │    │  midPoint:8080    │    │  Asterisk              │ │
│  │                      │    │                   │    │  5060/udp+tcp (SIP)   │ │
│  │  -  midpoint DB     │◄──►│  - DatabaseTable  │    │  8088/tcp (WS+ARI)    │ │
│  │  -  callcenter DB   │    │    Connector      │    │  10000-10100 (RTP)    │ │
│  │    . users          │    │  - Role RBAC      │    │  MixMonitor (record)  │ │
│  │    . cdr            │    │  - Object Tmpl.   │    └───────────┬────────────┘ │
│  │    . recordings     │    │  - Groovy Mappings│                │              │
│  │    . audit_log      │    └────────┬─────────┘                │ SSH          │
│  └──────────────────────┘             │ REST API                 │ (provision)  │
│                                        │                          ▼             │
│  ┌─────────────────────────────────────┴──────────────────────────┴─────────┐  │
│  │                Backend NestJS (Multi-repo)                               │  │
│  │                                                                          │  │
│  │  ┌───────────┐     ┌──────────┐     ┌──────────┐  ┌──────────┐          │  │
│  │  │ Gateway   │────►│ Auth     │     │ Cdr      │  │ Recorder │          │  │
│  │  │ :3001     │     │ :3002    │     │ :3003    │  │ :3005    │          │  │
│  │  │ (HTTP)    │────►│ (TCP) ┐  │────►│ (TCP)    │  │ (TCP)    │          │  │
│  │  └───────────┘     │       │  │     └──────────┘  └───┬──────┘          │  │
│  │                    └───────┼──┘                       │                 │  │
│  │  ┌──────────────────┐     │       fPutObject()        │                 │  │
│  │  │ Asterisk Svc     │◄────┘                           │                 │  │
│  │  │ :3004 (TCP)      │                                 │                 │  │
│  │  └────────┬─────────┘                                 │                 │  │
│  │           │ SSH (provision)                            │                 │  │
│  │           └──────────────────┐                         │                 │  │
│  │                               │                        │                 │  │
│  │  ┌──────────────────┐           ┌─▼──────────────────┐ │                 │  │
│  │  │  MinIO S3:9000   │◄──────────┤  recorder-svc      │ │                 │  │
│  │  │  (recordings/)   │  upload   │  (fs.watch)        │ │                 │  │
│  │  └────────┬─────────┘           └────────────────────┘ │                 │  │
│  │           │                                             │                 │  │
│  │           │ proxy (nginx → minio:9000)  ws (nginx → asterisk:8088/ws)     │
│  │  ┌────────▼─────────────────┐     │                      │                 │  │
│  │  │  Frontend:3000            │◄────┘                      │                 │  │
│  │  │  (SIP.js + Nginx)        │                            │                 │  │
│  │  └──────────────────────────┘                            │                 │  │
│  └──────────────────────────────────────────────────────────┼─────────────────┘  │
│                                                              │                   │
│                                                     ┌────────┴────────────┐      │
│                                                     │    Internet / LAN   │      │
│                                                     │                      │      │
│                                                     │  ┌────────────────┐  │      │
│                                                     │  │ Browser WebPhone│  │      │
│                                                     │  │ http://localhost│  │      │
│                                                     │  │ :3000          │  │      │
│                                                     │  │ ext. 3001/admin│  │      │
│                                                     │  └────────────────┘  │      │
│                                                     └─────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────────┘
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
5. **Auth (API)**: Frontend/cliente llama a `POST /api/auth/login` → gateway → auth-svc
   - auth-svc intenta validar contra midPoint REST API con Basic Auth (`GET /ws/rest/users/self`)
   - Si midPoint responde OK → credenciales válidas
   - Si midPoint no responde → fallback a bcrypt contra la tabla `users`
   - Devuelve JWT con perfil del usuario
6. **Extension Management (API)**: `GET/POST/DELETE /api/asterisk/extensions` → gateway → asterisk-svc → SSH (cat/grep/sed/printf, `sudo /usr/sbin/asterisk -rx` para reload) → pjsip.conf + reload res_pjsip
7. **CDR (API)**: `GET /api/cdr` y `GET /api/cdr/stats` → gateway → cdr-svc → PostgreSQL → registros + estadísticas
8. **Recording**: recorder-svc (TCP:3005, standalone) monitorea `/recordings/` via `fs.watch`, sube nuevos .wav a MinIO via `fPutObject()`
9. **Softphone Registration**: Agent opens `http://localhost:3000` and registers with extension/password
10. **Call**: Agent dials another extension → Asterisk routes call via PJSIP
11. **CDR**: Call details written to `cdr` table in PostgreSQL
12. **Audit**: All authentication events logged to `audit_log` table

## Recording Flow

```
Agent 3001 calls another extension
        │
        ▼
Asterisk MixMonitor records to /var/spool/asterisk/monitor/ (volume: asterisk-recordings)
        │
        ▼
recorder-svc (NestJS TCP:3005, volume mounted at /recordings)
  → fs.watch detects new .wav (rename event, 2s debounce)
  → minioClient.fPutObject() → MinIO bucket "recordings"
  → Tracks uploaded files in memory Set<string>
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
- **SSH provisioning**: Backend `asterisk-svc` se conecta como usuario `provision` vía SSH con clave privada. Usa `sudo /usr/sbin/asterisk -rx` para comandos que requieren acceso al socketctl de Asterisk (propietario root). El usuario `provision` tiene sudo NOPASSWD para `/usr/sbin/asterisk`.
