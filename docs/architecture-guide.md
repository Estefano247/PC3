# Guía de Arquitectura — CallCenter WebPhone

## 1. Visión General

Sistema de central telefónica unificada (PBX) basada en microservicios que integra:

- **Comunicaciones en tiempo real** vía WebRTC (SIP.js) sobre Asterisk
- **Gestión de identidades** con midPoint IAM y PostgreSQL
- **Almacenamiento de grabaciones** en MinIO S3 con URLs prefirmadas
- **Autenticación JWT** con respaldo bcrypt local y validación contra midPoint
- **Orquestación completa** con Docker Compose (10 servicios en una red bridge aislada)

El frontend WebPhone permite a agentes realizar y recibir llamadas desde el navegador,
con funcionalidades de mute, hold y consulta de grabaciones.

---

## 2. Stack Tecnológico

### 2.1 Componentes Core

| Componente | Versión | Rol | Puerto Expuesto |
|------------|---------|-----|-----------------|
| **Asterisk** | 20.20.1 | PBX (central telefónica): enrutamiento SIP, MixMonitor para grabaciones | `5060/udp+tcp`, `8088/tcp`, `10000-10100/udp` |
| **midPoint** | 4.8 | IAM (Identity & Access Management): orquestación de identidades, sincronización con base de datos | `8080` |
| **PostgreSQL** | 15 | Base de datos compartida: esquemas `callcenter` (users, cdr, audit_log) y `midpoint` | — (red interna) |
| **MinIO** | latest | Almacenamiento S3 compatible: bucket privado `recordings` para archivos .wav | `9000` |

### 2.2 Microservicios Backend (NestJS 10)

| Servicio | Puerto (TCP) | Propósito |
|----------|-------------|-----------|
| **api-gateway** | 3001 (HTTP) | Proxy REST → microservicios TCP. Endpoints públicos: `/api/auth/*`, `/api/cdr/*`, `/api/asterisk/*`, `/api/recordings` |
| **auth-svc** | 3002 | Autenticación (midPoint + bcrypt fallback), registro, JWT, importación inicial de configs midPoint |
| **cdr-svc** | 3003 | Consulta de Call Detail Records (CDR) y estadísticas |
| **asterisk-svc** | 3004 | Gestión de extensiones SIP vía SSH sobre pjsip.conf, estado y reload |
| **recorder-svc** | 3005 | File watcher: detecta nuevos .wav en `/recordings/` y los sube a MinIO |

### 2.3 Frontend

| Componente | Puerto | Tecnología |
|------------|--------|-----------|
| **frontend** (Nginx) | 3000 → 80 | Nginx reverso: sirve estáticos, proxy `/api/` → gateway, proxy `/ws` → Asterisk |
| **WebPhone** | — | SIP.js 0.21 (WebRTC), mute/hold, visor de grabaciones con `<audio>` |

### 2.4 Librerías Clave

- **bcrypt** — Hashing de contraseñas (salt automático, 10 rondas)
- **ssh2** — Conexión SSH desde asterisk-svc hacia Asterisk (clave privada)
- **minio** — Cliente S3 para upload/download de grabaciones
- **passport-jwt** — Estrategia JWT para proteger endpoints del gateway
- **typeorm** — ORM para PostgreSQL (users, cdr)
- **class-validator** — Validación de DTOs en los endpoints

---

## 3. Arquitectura de Contenedores

### 3.1 Red Docker

```
callcenter-net (172.20.0.0/16)
  │
  ├── db:5432 ──── PostgreSQL 15
  ├── midpoint:8080 ─── midPoint 4.8
  ├── asterisk:5060/8088 ─── Asterisk 20
  ├── minio:9000 ─── MinIO S3
  ├── auth-svc:3002 ─── Auth Service (TCP)
  ├── cdr-svc:3003 ─── CDR Service (TCP)
  ├── asterisk-svc:3004 ─── Asterisk Manager (TCP)
  ├── recorder-svc:3005 ─── Recorder Service (TCP)
  ├── api-gateway:3001 ─── API Gateway (HTTP)
  └── frontend:80 ─── Nginx (estáticos + proxy)
```

### 3.2 Dependencias entre servicios

```
                        ┌──────────┐
                        │  db:5432 │◄─────────────────────────┐
                        └────┬─────┘                          │
                             │ depends_on (healthy)            │
                     ┌───────┴────────┐                       │
                     │                │                        │
                ┌────▼─────┐   ┌──────▼──────┐                │
                │ midpoint  │   │  auth-svc   │───────────────►│
                │  :8080    │   │  :3002      │  REST + Basic  │
                └────┬──────┘   └──────┬──────┘  Auth         │
                     │                 │                       │
              depends_on          depends_on                   │
              (healthy)           (healthy)                    │
                     │                 │                       │
                ┌────▼─────┐   ┌──────▼──────┐   ┌──────────┐ │
                │ asterisk │   │  cdr-svc    │──►│  db:5432  │ │
                │  :8088   │   │  :3003      │   └──────────┘ │
                └──┬───┬───┘   └──────┬──────┘                │
                   │   │              │                       │
            depends_on│         depends_on                    │
              (started)│         (healthy)                    │
                   │   │              │                       │
          ┌────────▼┐  │    ┌─────────▼────────┐              │
          │asterisk │  │    │   api-gateway     │─────────────►│
          │ -svc    │  │    │   :3001 (HTTP)    │  TCP clients │
          │ :3004   │  │    └──┬────┬────┬──────┘              │
          │ (SSH)   │  │       │    │    │                     │
          └─────────┘  │       │    │    │                     │
                       │  ┌────┘    │    └──────────┐          │
                  ┌────┘  │         │               │          │
                  │  ┌────▼──┐ ┌────▼────┐   ┌──────▼───┐     │
                  │  │ auth  │ │ cdr     │   │ asterisk  │     │
                  │  │ :3002 │ │ :3003   │   │ :3004     │     │
                  │  └───────┘ └─────────┘   └──────────┘     │
                  │                                            │
             ┌────▼────┐                                       │
             │frontend │                                       │
             │:80(Nginx)│                                       │
             └─────────┘                                       │
                  │                                            │
             proxy_pass                                        │
             /api/ ──► api-gateway:3001                         │
             /ws   ──► asterisk:8088                           │
```

### 3.3 Volúmenes Persistentes

| Volumen | Monta en | Propósito |
|---------|----------|-----------|
| `db-data` | `/var/lib/postgresql/data` | Datos de PostgreSQL |
| `midpoint-data` | `/opt/midpoint/var` | Datos de midPoint (repo, logs) |
| `asterisk-config` | `/etc/asterisk` | Configuración de Asterisk (pjsip.conf, extensions.conf, etc.) |
| `asterisk-log` | `/var/log/asterisk` | Logs de Asterisk |
| `asterisk-recordings` | `/var/spool/asterisk/monitor` (asterisk) + `/recordings` (recorder-svc) | Archivos .wav de grabaciones |
| `minio-data` | `/data` | Objetos en MinIO |

---

## 4. Flujo de Datos

### 4.1 Inicio del Sistema (Boot Sequence)

```
1. db              → Inicia PostgreSQL, ejecuta init.sql y init-midpoint.sql
2. midpoint        → Espera a db (healthy), inicializa esquema midPoint
3. auth-svc        → Espera a db y midpoint (healthy)
                    → Importa configs XML en midPoint vía REST:
                      • Role Admin (sin inducción)
                      • Role AgenteCallCenter (sin inducción)
                      • Object Template (mappings Groovy)
                    → Importa 4 usuarios seed
                    → Reintenta cada 30s hasta confirmar
4. cdr-svc         → Espera a db (healthy)
5. asterisk        → Espera a midpoint (healthy)
                    → Entrypoint: copia configs por defecto, genera TLS, inicia SSH + Asterisk
6. asterisk-svc    → Espera a asterisk (started)
7. minio           → Inicia servidor S3
8. recorder-svc    → Espera a minio (healthy) y asterisk (started)
                    → Crea bucket recordings si no existe
                    → Re-subé archivos .wav existentes
9. api-gateway     → Espera a auth-svc, cdr-svc, asterisk-svc, minio
10. frontend       → Espera a asterisk (started)
                    → Nginx sirve estáticos + proxy
```

### 4.2 Autenticación Web (Login)

```
Browser                    Frontend              Gateway              Auth-svc          midPoint
  │                          │                     │                    │                  │
  │  POST /api/auth/login    │                     │                    │                  │
  │  {username, password}    │                     │                    │                  │
  │─────────────────────────►│                    │                    │                  │
  │                          │  proxy_pass /api/   │                    │                  │
  │                          │────────────────────►│                    │                  │
  │                          │                     │ TCP auth.login     │                  │
  │                          │                     │───────────────────►│                  │
  │                          │                     │                    │  GET /ws/rest/   │
  │                          │                     │                    │  users/self      │
  │                          │                     │                    │  (Basic Auth)    │
  │                          │                     │                    │─────────────────►│
  │                          │                     │                    │                  │
  │                          │                     │      ┌─────────────┴──┐              │
  │                          │                     │      │ ¿midPoint OK?  │              │
  │                          │                     │      ├───────┬───────┤              │
  │                          │                     │      │  Sí   │  No   │              │
  │                          │                     │      └───┬───┴───┬───┘              │
  │                          │                     │          │       │                  │
  │                          │                     │          │       └──► bcrypt.compare │
  │                          │                     │          │           (fallback)    │
  │                          │                     │◄─────────┴───────────┘              │
  │                          │                     │   return JWT + user                │
  │                          │◄────────────────────│                                    │
  │                          │                     │                                    │
  │  HTTP 200 + JWT          │                     │                                    │
  │◄─────────────────────────│                                                          │
  │                          │                                                          │
  │  Almacena JWT en         │                                                          │
  │  localStorage            │                                                          │
```

**Mecanismo de autenticación:**
1. Auth-svc intenta validar contra midPoint REST API con Basic Auth
2. Si midPoint responde OK → credenciales válidas (midPoint es fuente de verdad)
3. Si midPoint no responde (timeout/error) → fallback a bcrypt contra `users.password_hash`
4. Devuelve `{ access_token: JWT, user: { id, username, fullName, role, sipExtension } }`

### 4.3 Registro de Extensión SIP (Post-Login)

```
Browser                         Gateway               Auth-svc          Asterisk-svc       Asterisk
  │                               │                     │                  │                 │
  │  Tras login exitoso:          │                     │                  │                 │
  │  POST /api/asterisk/          │                     │                  │                 │
  │  register-sip                 │                     │                  │                 │
  │  {password}                   │                     │                  │                 │
  │  Authorization: Bearer JWT    │                     │                  │                 │
  │──────────────────────────────►│                     │                  │                 │
  │                               │  TCP auth.profile   │                  │                 │
  │                               │────────────────────►│                  │                 │
  │                               │◄────────────────────│                  │                 │
  │                               │  {sipExtension:      │                  │                 │
  │                               │   "3002", ...}       │                  │                 │
  │                               │                     │                  │                 │
  │                               │  TCP asterisk.      │                  │                 │
  │                               │  extensions.create  │                  │                 │
  │                               │───────────────────────────────────────►│                 │
  │                               │                     │                  │  SSH: printf    │
  │                               │                     │                  │  >> pjsip.conf  │
  │                               │                     │                  │────────────────►│
  │                               │                     │                  │                 │
  │                               │                     │                  │  SSH: asterisk  │
  │                               │                     │                  │  -rx "module    │
  │                               │                     │                  │  reload         │
  │                               │                     │                  │  res_pjsip.so"  │
  │                               │                     │                  │────────────────►│
  │                               │                     │                  │◄────────────────│
  │                               │◄───────────────────────────────────────│                 │
  │                               │  {extension: "3002",                  │                 │
  │                               │   server: "localhost:8088/ws"}        │                 │
  │◄──────────────────────────────┤                     │                  │                 │
  │                               │                     │                  │                 │
  │  Registro SIP.js vía          │                     │                  │                 │
  │  WebSocket ws://localhost:    │                     │                  │                 │
  │  8088/ws                      │                     │                  │                 │
  │  usando sipExtension +        │                     │                  │                 │
  │  password                     │                     │                  │                 │
  │──────────────────────────────────────────────────────────────────────────────────────►│
  │◄──────────────────────────────────────────────────────────────────────────────────────│
  │  200 OK - Registrado                                                            │
```

**Estructura creada en pjsip.conf para cada extensión:**

```ini
[3002]
type = endpoint
context = callcenter
disallow = all
allow = ulaw
auth = 3002-auth
aors = 3002
callerid = "Admin Dos" <3002>
webrtc = yes
transport = transport-ws
identify_by = username

[3002-auth]
type = auth
auth_type = userpass
password = sip3002pass
username = 3002

[3002]
type = aor
max_contacts = 1
```

### 4.4 Flujo de Llamada

```
Agente A (3002)                 Asterisk                     Agente B (3001)
  │                               │                              │
  │  INVITE sip:3001@localhost    │                              │
  │  (via WebSocket)              │                              │
  │──────────────────────────────►│                              │
  │                               │  Busca endpoint 3001 en     │
  │                               │  pjsip.conf                 │
  │                               │  ────────┬──────            │
  │                               │          │                  │
  │                               │   ┌──────┴──────┐          │
  │                               │   │ extensions. │          │
  │                               │   │ conf        │          │
  │                               │   │ _1XXX =>    │          │
  │                               │   │ MixMonitor  │          │
  │                               │   │ + Dial()   │          │
  │                               │   └─────────────┘          │
  │                               │                              │
  │                               │  INVITE (via WebSocket)      │
  │                               │─────────────────────────────►│
  │                               │                              │
  │                               │  200 OK (SDP answer)         │
  │                               │◄─────────────────────────────│
  │                               │                              │
  │  200 OK (SDP answer)          │                              │
  │◄──────────────────────────────│                              │
  │                               │                              │
  │  ACK                          │                              │
  │──────────────────────────────►│                              │
  │                               │  ACK                         │
  │                               │─────────────────────────────►│
  │                               │                              │
  │  ════════ RTP stream (WebRTC) ═════════════════════════════►│
  │◄══════════════════════════════║══════════════════════════════│
  │                               │                              │
  │  MixMonitor graba a           │                              │
  │  /var/spool/asterisk/monitor/ │                              │
  │  {uniqueid}-3001-3002.wav     │                              │
```

**Plan de marcado (extensions.conf):**

```
[callcenter]
exten => _1XXX,1,MixMonitor(${RECORDING_DIR}/${UNIQUEID}-...)
 same => n,Dial(PJSIP/${EXTEN},30)
 same => n,Hangup()

exten => _2XXX,1,MixMonitor(...)
 same => n,Dial(PJSIP/${EXTEN},30)

exten => _3XXX,1,MixMonitor(...)
 same => n,Dial(PJSIP/${EXTEN},30)

exten => 8000,1,Answer()
 same => n,Playback(hello-world)      ; Echo test
 same => n,Hangup()
```

### 4.5 Flujo de Grabaciones

```
Asterisk                          recorder-svc                    MinIO                    Gateway                  Frontend
  │                                  │                              │                        │                        │
  │  MixMonitor escribe .wav         │                              │                        │                        │
  │  en /var/spool/asterisk/         │                              │                        │                        │
  │  monitor/ (volumen compartido)   │                              │                        │                        │
  │─────────────────────────────────►│                              │                        │                        │
  │                                  │                              │                        │                        │
  │                                  │  fs.watch detecta            │                        │                        │
  │                                  │  evento 'rename'             │                        │                        │
  │                                  │  ────────┬──────             │                        │                        │
  │                                  │          │                   │                        │                        │
  │                                  │   ┌──────┴──────┐          │                        │                        │
  │                                  │   │ debounce 2s  │          │                        │                        │
  │                                  │   └─────────────┘          │                        │                        │
  │                                  │                              │                        │                        │
  │                                  │  minioClient.fPutObject()   │                        │                        │
  │                                  │─────────────────────────────►│                        │                        │
  │                                  │                              │  Almacena .wav en      │                        │
  │                                  │                              │  /recordings/          │                        │
  │                                  │                              │                        │                        │
  │                                  │                              │                        │                        │
  │                                  │                              │                        │  GET /api/recordings    │
  │                                  │                              │                        │  Authorization: JWT    │
  │                                  │                              │                        │◄───────────────────────│
  │                                  │                              │                        │                        │
  │                                  │                              │  ListObjects()         │                        │
  │                                  │                              │◄───────────────────────│                        │
  │                                  │                              │───────────────────────►│                        │
  │                                  │                              │                        │                        │
  │                                  │                              │  presignedGetObject()  │                        │
  │                                  │                              │◄───────────────────────│                        │
  │                                  │                              │───────────────────────►│                        │
  │                                  │                              │                        │                        │
  │                                  │                              │                        │  Reemplaza host        │
  │                                  │                              │                        │  minio → localhost     │
  │                                  │                              │                        │  en URL prefirmada     │
  │                                  │                              │                        │                        │
  │                                  │                              │                        │────────────────────────►│
  │                                  │                              │                        │  [{url: "http://       │
  │                                  │                              │                        │    localhost:9000/...",│
  │                                  │                              │                        │    caller: "3001",     │
  │                                  │                              │                        │    callee: "3002"}]    │
  │                                  │                              │                        │                        │
  │                                  │                              │                        │                        │
```

**Detalles del recorder-svc:**
- Monitorea `/recordings/` (volumen montado desde asterisk) con `fs.watch`
- Debounce de 2 segundos por archivo para evitar subidas parciales
- Sube a MinIO con `fPutObject()` al bucket `recordings`
- Mantiene un `Set<string>` en memoria de archivos ya subidos
- En el arranque, re-subé archivos `.wav` existentes

**Detalles del gateway para grabaciones:**
- `GET /api/recordings` lista todos los `.wav` del bucket, ordenados por fecha descendente
- Genera URLs prefirmadas con `presignedGetObject()` (válidas 1 hora)
- Reemplaza el host interno de MinIO (`minio:9000`) por `localhost:9000` para acceso desde el navegador
- Parsea el nombre del archivo (`{uniqueid}-{caller}-{callee}.wav`) para extraer caller/callee

---

## 5. API Gateway — Endpoints REST

### 5.1 Públicos (sin JWT)

| Método | Endpoint | TCP Pattern | Descripción |
|--------|----------|-------------|-------------|
| POST | `/api/auth/login` | `auth.login` | Inicio de sesión |
| POST | `/api/auth/register` | `auth.register` | Registro de nuevo usuario |

### 5.2 Protegidos (JWT requerido)

| Método | Endpoint | TCP Pattern | Descripción |
|--------|----------|-------------|-------------|
| GET | `/api/auth/profile` | `auth.profile` | Perfil del usuario autenticado |
| GET | `/api/cdr` | `cdr.findAll` | Lista de CDRs (filtros: src, dst, startDate, endDate, disposition) |
| GET | `/api/cdr/stats` | `cdr.stats` | Estadísticas de CDRs |
| GET | `/api/cdr/:id` | `cdr.findOne` | Detalle de un CDR |
| GET | `/api/asterisk/extensions` | `asterisk.extensions.findAll` | Lista de extensiones SIP |
| POST | `/api/asterisk/extensions` | `asterisk.extensions.create` | Crear extensión SIP |
| POST | `/api/asterisk/register-sip` | `auth.profile` + `asterisk.extensions.create` | Obtener perfil + crear extensión |
| DELETE | `/api/asterisk/extensions/:ext` | `asterisk.extensions.remove` | Eliminar extensión SIP |
| GET | `/api/asterisk/status` | `asterisk.status` | Estado de Asterisk |
| POST | `/api/asterisk/reload` | `asterisk.reload` | Reload módulo res_pjsip |
| GET | `/api/recordings` | — | Listar grabaciones (MinIO presigned URLs) |
| GET | `/api/recordings/:filename` | — | URL prefirmada para una grabación |

### 5.3 Validación JWT

El gateway usa Passport con estrategia JWT. Cada request protegido:
1. Extrae el token del header `Authorization: Bearer <token>`
2. Verifica la firma con `JWT_SECRET`
3. Envía `{ cmd: 'auth.validate', userId: payload.sub }` a auth-svc vía TCP
4. Auth-svc busca el usuario en DB y retorna el perfil (sin `passwordHash`)

---

## 6. Componentes Detallados

### 6.1 Asterisk (PBX)

**Configuración relevante:**
- `pjsip.conf`: Endpoints SIP con WebRTC habilitado, transporte WebSocket (`transport-ws` en puerto 8088)
- `extensions.conf`: Plan de marcado para extensiones de 4 dígitos (`_1XXX`, `_2XXX`, `_3XXX`) con MixMonitor automático
- `http.conf`: Servidor HTTP/WS en puerto 8088 para WebSocket ARI
- SSH habilitado en puerto 22 para provisionamiento remoto

**Gestión remota (asterisk-svc):**
- Conexión SSH como usuario `provision` con clave privada (`ssh2` library)
- Comandos sobre `pjsip.conf`: `cat`, `grep`, `sed`, `printf`
- Reload de módulo: `sudo /usr/sbin/asterisk -rx "module reload res_pjsip.so"`
- El usuario `provision` tiene sudo NOPASSWD para `/usr/sbin/asterisk`
- Permiso de escritura: `chmod g+w /etc/asterisk/pjsip.conf` (provision está en grupo `asterisk`)

### 6.2 midPoint (IAM)

**Configuraciones importadas automáticamente por auth-svc:**

1. **Roles** (sin inducción a recursos): `Admin` y `AgenteCallCenter`. Contienen solo la definición del rol sin inducement a recursos DB.

2. **Object Template**: Mapea `telephoneNumber` del usuario. No se utiliza para provisioning (el conector DatabaseTable no puede descubrir el schema de PostgreSQL).

> **Nota:** Los roles ya no incluyen `resourceRef` ni inducement. El conector
> DatabaseTable no pudo descubrir el schema de PostgreSQL (error "No schema in
> resource"). midPoint se utiliza exclusivamente para autenticación y RBAC.
> Los usuarios creados en midPoint existen solo en su repositorio interno.
> La tabla `users` de PostgreSQL se puebla desde `init.sql` (seed data) y
> desde `auth.service.register()` (nuevos usuarios).

**Flujo de autenticación con midPoint:**
1. Usuario existe en midPoint (creado vía import automático o UI)
2. Login: `auth-svc` valida contra `GET /ws/rest/users/self` con Basic Auth
3. Si OK: auth-svc extrae el rol del XML de respuesta (`resolveMidpointRole`)
4. Si el rol difiere del DB local → lo actualiza
5. Si midPoint no responde → fallback a bcrypt contra `users.password_hash`

### 6.3 Autenticación (auth-svc)

**Estrategia de autenticación (dual):**
1. **Primario**: Validar contra midPoint REST API (`GET /ws/rest/users/self`) con Basic Auth
2. **Fallback**: Si midPoint no responde, comparar contra `bcrypt(password, user.password_hash)`

**Registro de nuevos usuarios:**
- POST `/api/auth/register` — sin autenticación
- Busca el máximo `sipExtension` existente + 1 (si no hay, empieza en 1100)
- Genera hash bcrypt con salt automático
- Almacena: `username`, `fullName`, `email`, `passwordHash`, `sipPassword` (texto plano para SIP), `sipExtension` (auto-asignado)

### 6.4 Frontend WebPhone (SIP.js)

**Arquitectura del cliente:**
- `SimpleUser` de SIP.js para abstraer registro y llamadas
- WebSocket a `ws://localhost:8088/ws` (Asterisk ARI)
- Mute/Hold: toggle sobre el `mediaHandler` de la sesión activa

**Flujo de inicio de sesión:**
1. Usuario ingresa username/password → `POST /api/auth/login`
2. Si OK → almacena JWT en `localStorage`
3. Si el usuario tiene `sipExtension` → auto-registra SIP:
   a. `POST /api/asterisk/register-sip` (crea endpoint en Asterisk)
   b. `simpleUser.connect()` → WebSocket a Asterisk
   c. `simpleUser.register()` → Digest auth con extension/password
4. `simpleUser.delegate.onCallReceived` → muestra notificación de llamada entrante
5. `simpleUser.call(target)` → INVITE SIP

---

## 7. Consideraciones de Red y Puertos

### 7.1 Puertos Expuestos al Host

| Puerto | Servicio | Uso |
|--------|----------|-----|
| 3000 | frontend (Nginx) | Interfaz WebPhone |
| 3001 | api-gateway | API REST |
| 5060/udp+tcp | Asterisk | Tráfico SIP (softphones de escritorio) |
| 8088/tcp | Asterisk | WebSocket para SIP.js |
| 9000 | MinIO | API S3 |
| 8080 | midPoint | Consola de administración IAM |
| 10000-10100/udp | Asterisk | Rango RTP para audio |

### 7.2 Proxy Nginx (frontend)

```nginx
location /api/ {
    proxy_pass http://api-gateway:3001;   # Sin URI final para preservar path original
}

location /ws {
    proxy_pass http://asterisk:8088;       # WebSocket a Asterisk ARI
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Uso de variable `$api_upstream` con `resolver 127.0.0.11` (DNS interno de Docker) para resolución dinámica de nombres de contenedor. Sin URI final en `proxy_pass` para que la ruta original (`/api/auth/login`) se preserve completa.

### 7.3 Comunicación entre servicios

| Origen → Destino | Protocolo | Propósito |
|-----------------|-----------|-----------|
| gateway → auth-svc | TCP (NestJS microservices) | Login, registro, perfil, validación JWT |
| gateway → cdr-svc | TCP | Consulta CDRs y estadísticas |
| gateway → asterisk-svc | TCP | CRUD extensiones, estado, reload |
| gateway → minio | HTTP (MinIO SDK) | Listar objetos, generar presigned URLs |
| auth-svc → midPoint | HTTP REST (Basic Auth) | Validar credenciales, importar configs |
| auth-svc → db | TCP (PostgreSQL, TypeORM) | CRUD usuarios |
| cdr-svc → db | TCP (PostgreSQL, TypeORM) | Consulta CDRs |
| asterisk-svc → asterisk | SSH (clave privada) | Gestión pjsip.conf, reload módulos |
| recorder-svc → minio | HTTP (MinIO SDK) | Upload .wav con fPutObject |
| frontend → gateway | HTTP (Nginx proxy) | API REST |
| frontend → asterisk | WebSocket | SIP.js registro y llamadas |

---

## 8. Mecanismo de Importación Inicial (auth-svc)

En el primer arranque, `auth-svc` ejecuta un loop en background que reintenta cada 30s:

```
1. backgroundImport() — loop cada 30s
   └── ensureMidpointImport()
       ├── GET /midpoint → espera 200/302
       ├── DELETE /ws/rest/resources/c0ffee01-... → limpia resource roto
       ├── importMidpointConfigs()
       │   ├── DELETE + POST /ws/rest/roles → role-admin.xml
       │   ├── DELETE + POST /ws/rest/roles → role-agentecallcenter.xml
       │   └── DELETE + POST /ws/rest/objectTemplates → object-template-user.xml
       └── importMidpointUsers() — solo si falta algún user
           └── POST /ws/rest/users → 4 usuarios seed (admin1, admin2, agente1, agente2)
               └── Reintenta 5 veces en caso de error

2. Cuando los 4 usuarios responden 200 → loop termina
```

Importación manual alternativa:
```bash
docker-compose exec midpoint /opt/midpoint/scripts/import-midpoint.sh
```

El script usa `curl` para configs y `midpoint.sh import -raw` para usuarios (sin provisioning).

---

## 9. Usuarios por Defecto

| Usuario | Contraseña | Ext. SIP | Rol | Fuente |
|---------|-----------|----------|-----|--------|
| `admin1` | `sip3001pass` | 3001 | Admin | init.sql (seed) |
| `admin2` | `sip3002pass` | 3002 | AgenteCallCenter | init.sql (seed) |
| `agente1` | `sip3003pass` | 3003 | AgenteCallCenter | init.sql (seed) |
| `agente2` | `sip3004pass` | 3004 | AgenteCallCenter | init.sql (seed) |

Creados en `backend/cdr/db/init.sql` con hash bcrypt pre-generado.
`ON CONFLICT (username) DO NOTHING` evita duplicados en reinicios.

---

## 10. Seguridad

| Aspecto | Implementación |
|---------|---------------|
| **Autenticación API** | JWT con 24h de expiración, firmado con `JWT_SECRET` |
| **Protección endpoints** | Passport `JwtAuthGuard` en todos los endpoints excepto login/register |
| **Autenticación SIP** | Digest MD5 sobre WebSocket |
| **Cifrado RTP** | DTLS-SRTP (configurado en pjsip.conf: `media_encryption = dtls`) |
| **Aislamiento de red** | Docker bridge network `callcenter-net` (172.20.0.0/16) |
| **Provisionamiento** | SSH con clave privada, usuario `provision` con sudo restringido |
| **Grabaciones** | URLs prefirmadas con expiración de 1 hora, bucket privado |
| **Contraseñas** | Hash bcrypt en DB, Basic Auth hacia midPoint |
| ** Auditoría** | Tabla `audit_log` registra accesos (username, timestamp, IP, extensión) |

---

## 11. Resolución de Problemas Comunes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `401 Unauthorized` en registro SIP | Extensión no existe en pjsip.conf | Verificar `register-sip` o crear manualmente |
| `Permission denied` en pjsip.conf | Archivo sin permiso de grupo | `chmod g+w /etc/asterisk/pjsip.conf` |
| `ERR_NAME_NOT_RESOLVED` en grabaciones | URL prefirmada con host Docker | Gateway reemplaza `minio` → `localhost` |
| midPoint no arranca | midPoint tarda en inicializar | Esperar 2-3 min, verificar `docker compose logs` |
| `Cannot POST /api/` | Nginx proxy_pass con URI final y variable | Usar `proxy_pass $upstream;` sin URI |
| Extensiones no aparecen en API | pjsip.conf no reflejado | Verificar que `register-sip` se haya llamado |
