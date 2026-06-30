# Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         callcenter-net (172.20.0.0/16)                          │
│                                                                                 │
│  ┌──────────────────────┐    ┌──────────────────┐    ┌────────────────────────┐ │
│  │   PostgreSQL 15      │    │  midPoint:8080    │    │  Asterisk              │ │
│  │                      │    │                   │    │  5060/udp+tcp (SIP)   │ │
│  │  -  midpoint DB     │◄──►│  - Role RBAC      │    │  8088/tcp (WS+ARI)    │ │
│  │  -  callcenter DB   │    │  - Auth REST      │    │  10000-10100 (RTP)    │ │
│  │    . users          │    │  - Object Tmpl.   │    │  MixMonitor (record)  │ │
│  │    . cdr            │    │  - Users seed     │    └───────────┬────────────┘ │
│  │    . recordings     │    │                   │                │              │
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

1. **User Registration**: Los usuarios seed se crean vía `init.sql` en PostgreSQL. Usuarios adicionales se registran via `POST /api/auth/register`.
2. **midPoint Import**: `auth-svc` importa roles, object template y usuarios seed en midPoint vía REST API (loop cada 30s hasta confirmar).
4. **Auth (API)**: Frontend/cliente llama a `POST /api/auth/login` → gateway → auth-svc
   - auth-svc intenta validar contra midPoint REST API con Basic Auth (`GET /ws/rest/users/self`)
   - Si midPoint responde OK → sincroniza rol desde midPoint
   - Si midPoint no responde → fallback a bcrypt contra la tabla `users`
   - Devuelve JWT con perfil del usuario
5. **Extension Management (API)**: `GET/POST/DELETE /api/asterisk/extensions` → gateway → asterisk-svc → SSH (cat/grep/sed/printf, `sudo /usr/sbin/asterisk -rx` para reload) → pjsip.conf + reload res_pjsip
6. **CDR (API)**: `GET /api/cdr` y `GET /api/cdr/stats` → gateway → cdr-svc → PostgreSQL → registros + estadísticas
7. **Recording**: recorder-svc (TCP:3005, standalone) monitorea `/recordings/` via `fs.watch`, sube nuevos .wav a MinIO via `fPutObject()`
8. **Softphone Registration**: Agent opens `http://localhost:3000` and registers with extension/password
9. **Call**: Agent dials another extension → Asterisk routes call via PJSIP
10. **CDR**: Call details written to `cdr` table in PostgreSQL
11. **Audit**: All authentication events logged to `audit_log` table

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

## Monitoring Architecture

```
                                    callcenter-net
                                    
┌──────────────┐    scrape /metrics    ┌──────────────────┐
│  api-gateway  │─────────────────────►│   Prometheus      │
│  :3001        │  http_requests_total  │   :9090           │
│  (metrics)    │  http_request_duration│                    │
└──────────────┘  process_resident_mem │                    │
                     ...               │                    │
                                        │                    │
┌──────────────┐    scrape :9187       │                    │
│  postgres-    │─────────────────────►│                    │
│  exporter     │  pg_stat_activity     │                    │
└──────────────┘  pg_stat_database      │                    │
                                        └────────┬───────────┘
                                                  │
                                                  ▼
                                        ┌──────────────────┐
                                        │   Grafana         │
                                        │   :3006           │
                                        │   SLO Dashboard   │
                                        └──────────────────┘
```

19 métricas instrumentadas via prom-client en el Gateway (contadores, histogramas, gauges) más métricas de PostgreSQL via postgres-exporter. Dashboard de Grafana auto-provisionado con paneles para las 4 señales doradas, runtime Node.js, dependencias externas y métricas de negocio. Alertas configuradas en Prometheus para error rate, latencia, memoria y disponibilidad.

## Security Architecture

- **RBAC**: Roles control who can call whom (contexts: callcenter, admins)
- **Isolation**: Docker bridge network separates services from host
- **WebSocket**: WebRTC clients connect to Asterisk via `ws://localhost:8088/ws` (transporte WS en puerto 8088)
- **Audit Trail**: Every access logged in `audit_log` table with username, extension, timestamp, IP
- **SSH provisioning**: Backend `asterisk-svc` se conecta como usuario `provision` vía SSH con clave privada. Usa `sudo /usr/sbin/asterisk -rx` para comandos que requieren acceso al socketctl de Asterisk (propietario root). El usuario `provision` tiene sudo NOPASSWD para `/usr/sbin/asterisk`.
