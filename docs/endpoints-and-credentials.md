# Endpoints, Credenciales y Variables de Entorno

## Red

| Variable | Valor por defecto | Descripción |
|----------|-------------------|-------------|
| `DOCKER_NETWORK_SUBNET` | `172.20.0.0/16` | Subred interna Docker |
| Red Docker | `callcenter-net` | Nombre de la red bridge |

---

## Servicios Docker — Puertos y URLs

| Servicio | Container name | Puerto expuesto | Puerto interno | URL interna (Docker) |
|----------|---------------|-----------------|----------------|----------------------|
| **PostgreSQL** | `callcenter-db` | — | 5432 | `db:5432` |
| **pgAdmin** | `callcenter-pgadmin` | `5050` | 80 | `http://pgadmin:80` |
| **midPoint** | `callcenter-midpoint` | `8080` | 8080 | `http://midpoint:8080/midpoint` |
| **Asterisk** | `callcenter-asterisk` | `5060/udp+tcp`, `8088/tcp`, `10000-10100/udp` | — | `asterisk:5060` (SIP), `asterisk:8088` (WS/ARI) |
| **MinIO** | `callcenter-minio` | `9000` (API), `9001` (Console) | — | `minio:9000` |
| **API Gateway** | `callcenter-gateway` | `3001` | 3001 | `api-gateway:3001` |
| **Auth Service** | `callcenter-auth` | — | 3002 | `auth-svc:3002` (TCP) |
| **CDR Service** | `callcenter-cdr` | — | 3003 | `cdr-svc:3003` (TCP) |
| **Asterisk Manager** | `callcenter-asterisk-svc` | — | 3004 | `asterisk-svc:3004` (TCP) |
| **Recorder Service** | `callcenter-recorder-svc` | — | 3005 | `recorder-svc:3005` (TCP) |
| **Frontend** | `callcenter-frontend` | `3000` | 80 | `http://frontend:80` |

### URLs de acceso (desde el host)

| Servicio | URL |
|----------|-----|
| WebPhone | `http://localhost:3000` |
| API Gateway | `http://localhost:3001/api` |
| midPoint Admin | `http://localhost:8080/midpoint` |
| pgAdmin | `http://localhost:5050` |
| MinIO Console | `http://localhost:9001` |
| MinIO API | `http://localhost:9000` |

---

## Credenciales por defecto

### Usuarios semilla (WebPhone / SIP)

| Usuario | Contraseña | Ext. SIP | Rol |
|---------|-----------|----------|-----|
| `admin1` | `sip3001pass` | `3001` | Admin |
| `admin2` | `sip3002pass` | `3002` | Admin |
| `agente1` | `sip3005pass` | `3005` | AgenteCallCenter |
| `agente2` | `sip3006pass` | `3006` | AgenteCallCenter |

### midPoint

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| `administrator` | `Chang3M3!` (configurable via `MP_PASSWORD`) | Superusuario |

### Asterisk

| Tipo | Usuario | Contraseña | Ámbito |
|------|---------|-----------|--------|
| AMI (manager) | `admin` | `Chang3M3!` | Red interna (`172.20.0.0/16`) |
| ARI (REST API) | `admin` | `Chang3M3!` | Red interna |
| SSH provision | `provision` | — (key auth) | Ed25519 key en `backend/asterisk/pbx/ssh/provision-key` |

### MinIO

| Usuario | Contraseña | Bucket |
|---------|-----------|--------|
| `minioadmin` | `minioadmin123` | `recordings` (privado) |

### PostgreSQL

| Usuario | Contraseña | Bases de datos |
|---------|-----------|----------------|
| `callcenter` | `CallCenter2024!` | `callcenter`, `midpoint` |

### pgAdmin

| Email | Contraseña |
|-------|-----------|
| `pgadmin@localhost` | `pgadmin` |

---

## Variables de Entorno (`.env`)

```ini
# ─── PostgreSQL ───────────────────────────────────────────
POSTGRES_USER=callcenter
POSTGRES_PASSWORD=CallCenter2024!
POSTGRES_DB=callcenter

# ─── midPoint ─────────────────────────────────────────────
MP_PASSWORD=Chang3M3!          # Contraseña admin de midPoint

# ─── Asterisk ─────────────────────────────────────────────
ASTERISK_SIP_PORT=5060
ASTERISK_RTP_START=10000
ASTERISK_RTP_END=10100

# ─── Backend / JWT ────────────────────────────────────────
JWT_SECRET=callcenter-secret-key     # Cámbiala en producción
MIDPOINT_URL=http://localhost:8080/midpoint

# ─── Red Docker ───────────────────────────────────────────
DOCKER_NETWORK_SUBNET=172.20.0.0/16
```

---

## Variables de Entorno por Servicio

### API Gateway (`api-gateway`, puerto `3001`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `JWT_SECRET` | `callcenter-secret-key` | Clave para firmar JWTs |
| `AUTH_HOST` | `localhost` | Host del Auth Service (TCP) |
| `CDR_HOST` | `localhost` | Host del CDR Service (TCP) |
| `ASTERISK_HOST` | `localhost` | Host del Asterisk Manager (TCP) |
| `MINIO_HOST` | `minio` | Host de MinIO |
| `MINIO_PORT` | `9000` | Puerto de MinIO |
| `MINIO_ACCESS_KEY` | `minioadmin` | Access key de MinIO |
| `MINIO_SECRET_KEY` | `minioadmin123` | Secret key de MinIO |
| `MINIO_BUCKET` | `recordings` | Bucket de grabaciones |
| `MINIO_PUBLIC_ENDPOINT` | `localhost:9000` | Endpoint público para presigned URLs |

### Auth Service (`auth-svc`, TCP `3002`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | Host de PostgreSQL |
| `DB_PORT` | `5432` | Puerto de PostgreSQL |
| `DB_USERNAME` | `postgres` | Usuario de BD |
| `DB_PASSWORD` | `postgres` | Contraseña de BD |
| `DB_NAME` | `callcenter` | Nombre de la BD |
| `JWT_SECRET` | `callcenter-secret-key` | Clave para firmar JWTs |
| `MIDPOINT_URL` | `http://midpoint:8080/midpoint` | URL base de midPoint REST |
| `MP_ADMIN_USER` | `administrator` | Usuario admin de midPoint |
| `MP_ADMIN_PASSWORD` | `Chang3M3!` | Contraseña admin de midPoint |
| `MP_INIT_DIR` | `/opt/midpoint/init` | Directorio con configs XML de midPoint |

### CDR Service (`cdr-svc`, TCP `3003`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | Host de PostgreSQL |
| `DB_PORT` | `5432` | Puerto de PostgreSQL |
| `DB_USERNAME` | `postgres` | Usuario de BD |
| `DB_PASSWORD` | `postgres` | Contraseña de BD |
| `DB_NAME` | `callcenter` | Nombre de la BD |

### Asterisk Manager (`asterisk-svc`, TCP `3004`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `ASTERISK_SSH_HOST` | `asterisk` | Host del contenedor Asterisk |
| `ASTERISK_SSH_PORT` | `22` | Puerto SSH de Asterisk |
| `ASTERISK_SSH_USER` | `provision` | Usuario SSH |
| `ASTERISK_SSH_KEY` | _(requerido)_ | Ruta a la clave privada SSH |
| `PJSIP_CONF_PATH` | `/etc/asterisk/pjsip.conf` | Ruta a pjsip.conf en Asterisk |

### Recorder Service (`recorder-svc`, TCP `3005`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `MINIO_HOST` | `minio` | Host de MinIO |
| `MINIO_PORT` | `9000` | Puerto de MinIO |
| `MINIO_ACCESS_KEY` | `minioadmin` | Access key de MinIO |
| `MINIO_SECRET_KEY` | `minioadmin123` | Secret key de MinIO |
| `MINIO_BUCKET` | `recordings` | Bucket destino |
| `RECORDINGS_DIR` | `/recordings` | Directorio a watch (bind mount) |

---

## Endpoints REST (API Gateway → `http://localhost:3001/api`)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | No | Iniciar sesión |
| `POST` | `/api/auth/register` | No | Registrar nuevo usuario |
| `GET` | `/api/auth/profile` | JWT | Obtener perfil del usuario autenticado |
| `GET` | `/api/cdr` | JWT | Listar CDRs (soporta filtros: `src`, `dst`, `startDate`, `endDate`, `disposition`, `limit`, `offset`) |
| `GET` | `/api/cdr/stats` | JWT | Estadísticas de CDR |
| `GET` | `/api/cdr/:id` | JWT | Detalle de un CDR |
| `GET` | `/api/asterisk/extensions` | JWT | Listar extensiones SIP |
| `POST` | `/api/asterisk/extensions` | JWT | Crear extensión SIP |
| `DELETE` | `/api/asterisk/extensions/:extension` | JWT | Eliminar extensión SIP |
| `POST` | `/api/asterisk/register-sip` | JWT | Obtener info para registro SIP |
| `GET` | `/api/asterisk/status` | JWT | Estado de Asterisk |
| `POST` | `/api/asterisk/reload` | JWT | Recargar módulo PJSIP |
| `GET` | `/api/recordings` | JWT | Listar grabaciones (presigned URLs) |
| `GET` | `/api/recordings/:filename` | JWT | Obtener URL presigned de una grabación |

### Frontend (nginx proxy)

| Ruta | Destino |
|------|---------|
| `/api/*` | `http://api-gateway:3001` |
| `/ws` | `http://asterisk:8088` (proxy WebSocket) |

---

## Mensajes TCP (microservicios internos)

### Auth Service (`auth-svc:3002`)

| Pattern | Payload | Descripción |
|---------|---------|-------------|
| `{ cmd: 'auth.login' }` | `{ username, password }` | Login |
| `{ cmd: 'auth.register' }` | `{ username, password, fullName, email? }` | Register |
| `{ cmd: 'auth.validate' }` | `{ userId }` | Validar perfil |
| `{ cmd: 'auth.profile' }` | `{ userId }` | Obtener perfil |

### CDR Service (`cdr-svc:3003`)

| Pattern | Payload | Descripción |
|---------|---------|-------------|
| `{ cmd: 'cdr.findAll' }` | `{ src?, dst?, startDate?, endDate?, disposition?, limit?, offset? }` | Listar CDRs |
| `{ cmd: 'cdr.findOne' }` | `{ id }` | Detalle CDR |
| `{ cmd: 'cdr.stats' }` | `{ startDate?, endDate? }` | Estadísticas |

### Asterisk Manager (`asterisk-svc:3004`)

| Pattern | Payload | Descripción |
|---------|---------|-------------|
| `{ cmd: 'asterisk.extensions.findAll' }` | — | Listar extensiones |
| `{ cmd: 'asterisk.extensions.create' }` | `{ username, extension, password, displayName? }` | Crear extensión |
| `{ cmd: 'asterisk.extensions.remove' }` | `{ extension }` | Eliminar extensión |
| `{ cmd: 'asterisk.status' }` | — | Estado de Asterisk |
| `{ cmd: 'asterisk.reload' }` | — | Recargar res_pjsip.so |

### Recorder Service (`recorder-svc:3005`)

Sin handlers TCP. Servicio autónomo: watch + upload a MinIO.

---

## Configuraciones estáticas (archivos)

### Asterisk (`backend/asterisk/pbx/config/`)

| Archivo | Propósito |
|---------|-----------|
| `asterisk.conf` | Directorios y verbosidad |
| `modules.conf` | Módulos cargados/descargados |
| `pjsip.conf` | Endpoints SIP, transports, templates |
| `extensions.conf` | Plan de marcado (_1XXX, _2XXX, _3XXX) |
| `manager.conf` | AMI credentials (admin / Chang3M3!) |
| `http.conf` | HTTP server en puerto 8088 |
| `ari.conf` | ARI credentials (admin / Chang3M3!) |
| `cdr.conf` | CDR general |
| `cdr_manager.conf` | CDR via AMI |
| `extconfig.conf` | Realtime DB (comentado) |

### midPoint (`backend/auth/midpoint/config/`)

| Archivo | OID | Propósito |
|---------|-----|-----------|
| `config.xml` | — | Config repositorio PostgreSQL |
| `resource-scripted-sql.xml` | `c0ffee01-c0ff-ee01-c0ff-ee01c0ffee01` | Recurso DatabaseTableConnector → `callcenter.users` |
| `role-agentecallcenter.xml` | `00000000-0000-0000-0000-000000000010` | Rol con inducción SIP |
| `object-template-user.xml` | `00000000-0000-0000-0000-000000000020` | Template con mappings SIP |

### PostgreSQL (`backend/cdr/db/`)

| Archivo | Propósito |
|---------|-----------|
| `init.sql` | Schema `callcenter` (tablas: `users`, `cdr`, `recordings`, `audit_log`) + seed data |
| `init-midpoint.sql` | Schema interno midPoint (objetos, asignaciones, auditoría, Quartz) |
