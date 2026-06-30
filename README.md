# Laboratorio de Integración de Sistemas

**Infraestructura Unificada de Comunicaciones y Gestión de Identidad**

Solución integral basada en microservicios y open source que integra una central telefónica Asterisk (PBX) con un sistema de gestión de identidades midPoint (IAM) y un backend NestJS en multi-repo, orquestado con Docker y cumpliendo estándares ISO 27001 e ISO 25010.

Características del frontend WebPhone: llamadas WebRTC con SIP.js, mute/hold, grabaciones con URLs pre-firmadas (sin exposición pública).

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         callcenter-net (172.20.0.0/16)                           │
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────────────────┐    │
│  │  PostgreSQL 15│    │  midPoint 4.8│    │  Asterisk 20 (PJSIP)           │    │
│  │              │    │    :8080      │    │  5060/udp+tcp (SIP)            │    │
│  │  - midpoint  │◄──►│  Role RBAC    │    │  8088/tcp (WS+ARI)             │    │
│  │  - callcenter│    │  Auth REST    │    │  10000-10100 (RTP)             │    │
│  │    . users   │    │  Users seed   │    │  MixMonitor (record)           │    │
│  │    . cdr     │    └──────┬───────┘    └─────────────┬──────────────────┘    │
│  │    . audit   │           │ REST API                  │ SSH (provision)       │
│  └──────────────┘           │                           │                        │
│                             ▼                           │                        │
│  ┌──────────────────────────────────────────────────────┴──────────────┐        │
│  │         Backend NestJS (Multi-repo)                                 │        │
│  │                                                                    │        │
│  │  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐   │        │
│  │  │  Gateway  │────►│ Auth     │     │ Cdr      │  ┌────────┐   │        │
│  │  │  :3001    │     │ :3002    │     │ :3003    │  │Recorder│   │        │
│  │  │  (HTTP)   │────►│ (TCP)    │────►│ (TCP)    │  │ :3005  │   │        │
│  │  └──────────┘     └────┬─────┘     └──────────┘     └───┬────┘   │        │
│  │                        │                              │         │        │
│  │                        │ REST            ┌────────────┘         │        │
│  └────────────────────────┼──────────────────┼─────────────────────┘        │
│  ┌──────────────────┐     │                  │                              │
│  │ Asterisk Svc     │◄────┘                  │                              │
│  │ :3004 (TCP)      │         fPutObject()   │                              │
│  └────────┬─────────┘                        │                              │
│           │ SSH (provision)                   │                              │
│           └──────────────────┐                │                              │
│  ┌──────────────┐           ┌─▼──────────────┐│                              │
│  │  MinIO S3:9000│◄──────────┤  recorder-svc  ││                              │
│  │  (recordings/)│  upload   │  (fs.watch)    ││                              │
│  └──────┬───────┘           └────────────────┘│                              │
│         │                                      │                              │
│         │  ws (nginx → asterisk:8088/ws)    GET /api/recordings (JWT)           │
│  ┌──────▼──────────────────────┐             │                                  │
│  │  Frontend:3000              │◄────────────┘                                  │
│  │  (SIP.js + mute/hold/DTMF)  │                                                 │
│  └─────────────────────────────┘                                                │
└────────────────────────────────────────────────────────────────────┼──────────────┘
                                                                      │
                                                            ┌─────────▼──────────┐
                                                            │   Internet / LAN   │
                                                            │  Browser WebPhone  │
                                                            │  MicroSIP / Zoiper │
                                                            │  Linphone          │
                                                            └────────────────────┘
```

## Stack Tecnológico

| Componente | Tecnología | Puerto |
|------------|-----------|--------|
| Base de Datos | PostgreSQL 15 (dos bases: `midpoint`, `callcenter`) | - (red interna) |
| IAM / Orquestador | midPoint 4.8 | 8080 |
| Central Telefónica | Asterisk 20 (PJSIP) | 5060/udp+tcp, 8088, 10000-10100 |
| API Gateway | NestJS 10 (HTTP) | 3001 |
| Auth Service | NestJS 10 (TCP microservice) | 3002 |
| CDR Service | NestJS 10 (TCP microservice) | 3003 |
| Asterisk Manager | NestJS 10 (TCP microservice) | 3004 |
| Almacenamiento S3 | MinIO | 9000 (API) |
| Recorder Service | NestJS 10 (TCP microservice) | 3005 |
| Frontend WebRTC | SIP.js + Nginx (mute/hold) | 3000 |
| Prometheus | prom/prometheus | 9090 |
| Grafana | grafana/grafana (dashboards: SLO Dashboard) | 3006 |
| PostgreSQL Exporter | prometheuscommunity/postgres-exporter | - (red interna) |
| Softphones | MicroSIP / Zoiper / Linphone | - |

## Requisitos Previos

- Docker Engine 24+ y Docker Compose 2.20+
- Node.js 18+ y npm (para desarrollo local sin Docker)
- Git 2.30+
- PowerShell 7+ (para tests de integración en Windows)
- Navegador moderno con WebRTC (Chrome/Firefox/Edge)
- Softphone opcional (MicroSIP, Zoiper o Linphone)
- Opcional: SIPp (pruebas de carga), Trivy (vulnerabilidades)

## Inicio Rápido

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd pc3

# 2. Iniciar servicios
docker compose up -d --build

# 3. Verificar estado
docker compose ps

# 4. Acceder al WebPhone
#    URL: http://localhost:3000
#    Usuario:            admin1
#    Contraseña:         sip3001pass
#    (El registro SIP se realiza automáticamente tras el login web)

# 5. Acceder a midPoint (IAM)
#    URL: http://localhost:8080/midpoint
#    Usuario: administrator
#    Contraseña: Chang3M3!

# 6. Ver logs
docker compose logs -f
```

## Desarrollo Local (sin Docker)

Para desarrollo sin Docker, cada microservicio se ejecuta individualmente con `npm run start:dev`.

### Prerrequisitos

- Node.js 18+
- PostgreSQL 15 en `localhost:5432` con las bases `callcenter` y `midpoint`
- Asterisk 20 con SSH habilitado (usuario `provision`)
- MinIO en `localhost:9000`

### Iniciar servicios en orden

```bash
# 1. Auth Service (puerto 3002)
cd backend/auth
npm install
npm run start:dev

# 2. CDR Service (puerto 3003)
cd backend/cdr
npm install
npm run start:dev

# 3. Asterisk Manager (puerto 3004)
cd backend/asterisk
npm install
npm run start:dev

# 4. API Gateway (puerto 3001)
cd backend/gateway
npm install
npm run start:dev

# 5. Frontend (puerto 3000) — usar cualquier servidor estático
cd backend/gateway/frontend
npx serve . -p 3000
```

### Configuración de red en desarrollo

En modo Docker, el frontend (`app.js`) usa `API_BASE = '/api'` y Nginx
proxy inverso redirige las peticiones al Gateway (`api-gateway:3001`).
No se requieren cambios de configuración.

> **Para desarrollo local sin Docker:** Cambiar `API_BASE` en `app.js` a
> `http://localhost:3001/api`. El Gateway permite orígenes `http://localhost:3000`
> (configurado en `backend/gateway/src/main.ts`).

> La contraseña admin de midPoint es `Chang3M3!` (por defecto). La variable `MP_ADMIN_PASSWORD` del docker-compose permite cambiarla.
>
> Para recargar configuraciones de Asterisk (`pjsip.conf`, `extensions.conf`) tras cambios, se necesita: `docker compose down && docker volume rm pc3_asterisk-config && docker compose up -d --build`.

## Cómo usar el WebPhone

El WebPhone permite llamadas entre extensiones desde el navegador usando WebRTC.

> Existen 4 usuarios seed por defecto (admin1, admin2, agente1, agente2). Para probar llamadas entre dos extensiones usa agente1 (3003) y agente2 (3004). Se pueden crear usuarios adicionales desde midPoint (ver sección **Crear usuarios desde midPoint**).

### 1. Iniciar sesión web como admin

Ingresa a `http://localhost:3000` e ingresa:

| Campo | Valor |
|-------|-------|
| Usuario | `agente1` |
| Contraseña | `sip3003pass` |

Haz clic en **Iniciar sesión**. Si todo funciona, se autenticará contra el backend
y automáticamente registrará la extensión SIP 3005. Verás "Registrado como 3005" con el
indicador verde.

### 2. Crear un usuario adicional desde midPoint

Antes de probar llamadas, crea un segundo usuario desde midPoint:

1. Ingresa a `http://localhost:8080/midpoint` (usuario: `administrator`, contraseña: `Chang3M3!`)
2. Ve a **Usuarios → Nuevo usuario**
3. Completa **Name** (ej: `agente3`), **Full name** (ej: `Agente Tres`), asigna el rol **AgenteCallCenter**
4. Guarda el usuario
5. Tras crear el usuario en midPoint, inicia sesión en el WebPhone con ese usuario.
   El auth-service detecta el rol desde midPoint y completa el registro.

### 3. Iniciar sesión con otra extensión

Abre otra pestaña/ventana en `http://localhost:3000`, ingresa `agente2` / `sip3004pass`
y haz clic en **Iniciar sesión**. El SIP se registrará automáticamente como extensión 3004.

### 4. Hacer una llamada

1. En una pestaña, escribe la extensión destino (ej: `3001`) en el campo de extensión destino
2. Haz clic en **Llamar**
3. En la otra pestaña, aparecerá la notificación de llamada entrante
4. Haz clic en **Responder**
5. La llamada se conecta. Se puede colgar desde cualquier extremo con **Colgar**

### 5. Controles durante la llamada

Una vez conectada la llamada, aparecen dos controles:

| Control | Función |
|---------|---------|
| **Silenciar** | Activa/desactiva el micrófono (indicador rojo) |
| **Retener** | Pone/reanuda la llamada en espera (indicador ámbar) |

### 6. Ver grabaciones

Después de colgar una llamada, cambia a la pestaña **Grabaciones** y haz clic en **Actualizar**. Las grabaciones aparecen listadas con un reproductor `<audio>` para escucharlas. Las URLs de audio son pre-firmadas (válidas por 1 hora) y requieren autenticación JWT.

> **Tip:** Si usas Chrome, abre una ventana de incógnito para la segunda extensión. Así evitas conflictos de WebRTC por usar la misma página.

### Solución de problemas comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `POST http://localhost:3000/api/auth/login 404` | Frontend intentando usar proxy Nginx inexistente en dev | Cambiar `API_BASE` en `app.js` a `http://localhost:3001/api` (ya configurado) |
| `SIP is not defined` | SIP.js no cargó | Hard refresh (**Ctrl+Shift+R**) |
| `WebSocket closed (code: 1006)` | Puerto/path WebSocket incorrecto | Usa `localhost:8088/ws` en el campo Servidor |
| `Permission denied` al llamar | Volumen de configuración obsoleto | Ejecuta `docker compose down; docker volume rm pc3_asterisk-config; docker compose up -d` |
| midPoint no arranca | midPoint tarda en inicializar | Espera 2-3 min, verifica con `docker compose ps` |
| Las grabaciones no cargan | Sesión JWT expirada | Reinicia sesión en el WebPhone |

## Estructura del Proyecto

```
pc3/
├── docker-compose.yml               # Orquestación de 10 servicios
├── .env.example                     # Variables de entorno (plantilla)
├── .gitignore                       # Ignorados de Git
├── README.md                        # Este archivo
├── lab_content.txt                  # Contenido del laboratorio
│
├── backend/                         # Microservicios NestJS (multi-repo)
│   │
│   ├── gateway/                     # API Gateway (HTTP:3001)
│   │   ├── package.json            # Dependencias individuales
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts       # ClientsModule (auth, cdr, asterisk)
│   │       ├── app.controller.ts   # Endpoints REST
│   │               ├── auth/               # JWT Guard + Strategy
│   │               ├── recordings/         # Pre-signed URLs for MinIO recordings
│   │               └── dto/
│   │
│   ├── auth/                        # Auth Service (TCP:3002)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts     # Login, import midPoint configs
│   │   │   ├── user.entity.ts
│   │   │   └── dto/
│   │   └── midpoint/               # Infraestructura midPoint (IAM)
│   │       ├── Dockerfile           # Imagen personalizada midPoint 4.8
│   │       ├── config/
│   │       │   ├── config.xml               # Config repositorio PostgreSQL
│   │       │   ├── role-admin.xml           # Rol Admin (sin inducción)
│   │       │   ├── role-agentecallcenter.xml # Rol AgenteCallCenter (sin inducción)
│   │       │   └── object-template-user.xml  # Template con mappings SIP
│   │       ├── import/
│   │       │   ├── 00-role-admin.xml        # Rol Admin para auto-import
│   │       │   ├── 00-role-agentecallcenter.xml
│   │       │   ├── 00-object-template-user.xml
│   │       │   ├── 01-user-admin1.xml       # Seed users XML
│   │       │   ├── 02-user-admin2.xml
│   │       │   ├── 03-user-agente1.xml
│   │       │   └── 04-user-agente2.xml
│   │       └── scripts/
│   │           ├── init-midpoint.sh         # Entrypoint simplificado
│   │           └── import-midpoint.sh       # Import manual via curl
│   │
│   ├── cdr/                         # CDR Service (TCP:3003)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── cdr.controller.ts
│   │   │   ├── cdr.service.ts     # Query CDRs + stats
│   │   │   ├── cdr.entity.ts
│   │   │   └── dto/
│   │   └── db/                     # Infraestructura PostgreSQL
│   │       ├── init.sql            # Esquema BD (2 databases)
│   │       └── init-midpoint.sql   # Schema interno midPoint
│   │
│   ├── asterisk/                    # Asterisk Manager (TCP:3004)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── nest-cli.json
│   │   ├── Dockerfile
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── asterisk.controller.ts
│   │   │   ├── asterisk.service.ts # SSH → pjsip.conf management
│   │   │   ├── ssh.service.ts     # SSH client
│   │   │   └── dto/
│   │   └── pbx/                    # Infraestructura Asterisk PBX
│   │       ├── Dockerfile          # Imagen personalizada Asterisk 20
│   │       ├── config/
│   │       │   ├── asterisk.conf  # Config global
│   │       │   ├── pjsip.conf     # Endpoints SIP + WS transports
│   │       │   ├── extensions.conf # Plan de marcado
│   │       │   ├── modules.conf   # Módulos cargados
│   │       │   ├── http.conf      # ARI HTTP (port 8088)
│   │       │   ├── ari.conf       # REST API credentials
│   │       │   ├── manager.conf   # AMI (red interna)
│   │       │   ├── cdr.conf       # CDR general
│   │       │   ├── cdr_manager.conf # CDR vía AMI
│   │       │   └── extconfig.conf # Mapeo PostgreSQL real-time
│   │       ├── scripts/
│   │       │   └── entrypoint.sh  # Arranque del contenedor
│   │       └── ssh/
│   │           ├── provision-key.pub
│   │           └── provision-key
│   │
│   └── recorder/                    # Recorder Service (TCP:3005)
│       ├── package.json
│       ├── tsconfig.json
│       ├── nest-cli.json
│       ├── Dockerfile
│       └── src/
│           ├── main.ts
│           ├── recorder.service.ts  # fs.watch + MinIO upload
│           └── recorder.module.ts
│
├── backend/gateway/frontend/        # WebRTC WebPhone + Grabaciones
│   ├── Dockerfile                   # Nginx con resolver DNS
│   ├── nginx.conf                   # Proxy reverso (con resolver dinámico)
│   ├── index.html                   # WebPhone UI + mute/hold
│   ├── style.css
│   └── js/
│       ├── sip.js                   # SIP.js (WebRTC)
│       └── app.js                   # Cliente SIP con mute/hold
│                                    # API_BASE configurable en dev vs Docker
│
├── scripts/                         # Utilidades del repositorio
│   ├── setup-git.ps1                # Inicializa Git con ramas
│   └── generate-tls-certs.sh        # Certificados TLS para SIP
│
├── tests/                           # Suites de prueba
│   ├── run-all-tests.ps1            # Ejecutor maestro (10 tests)
│   ├── unit/
│   │   ├── README.md
│   │   └── test-mappings.groovy    # Tests de mappings midPoint
│   ├── integration/
│   │   ├── test-provisioning-flow.ps1  # Flujo de provisionamiento
│   │   ├── test-cdr-verification.ps1   # Verificación CDR
│   │   └── test-audit-security.ps1     # Reporte de auditoría
│   ├── load-test/
│   │   ├── calls.xml               # Escenario SIPp
│   │   └── run-load-test.sh        # Ejecutor carga
│   └── security/
│       ├── trivy-scan.sh           # Escaneo vulnerabilidades
│       └── test-tls-sip.sh         # Verificación cifrado TLS
│
├── monitoring/                      # Monitoreo (Prometheus + Grafana)
│   ├── prometheus/
│   │   ├── prometheus.yml           # Scrape config (api-gateway, postgres)
│   │   └── alerts.yml              # Reglas de alerta (6 alertas)
│   └── grafana/
│       ├── dashboards/
│       │   └── slo-dashboard.json   # Dashboard SLO (19 paneles)
│       └── provisioning/
│           ├── datasources/        # Prometheus + PostgreSQL
│           └── dashboards/         # Auto-provisioning
│
└── docs/                            # Documentación del proyecto
    ├── architecture.md              # Diagrama de red y flujo
    ├── endpoints-and-credentials.md # Endpoints, credenciales, variables
    ├── integration-guide.md         # Guía integración midPoint → Asterisk
    ├── iso-compliance.md            # Matriz ISO 27001 / 25010
    ├── kanban-guide.md              # Tablero Kanban
    ├── monitoring.md               # Monitoreo SLO (Prometheus + Grafana)
    └── user-stories.md              # User Stories (US-001 a US-016)
```

## Servicios y Puertos Expuestos

| Servicio | Puertos | Propósito |
|----------|---------|-----------|
| **PostgreSQL** | - (red interna) | Base de datos compartida (midPoint + aplicación) |
| **midPoint** | `8080` | Consola de administración IAM, API REST |
| **Asterisk** | `5060/udp+tcp` | Tráfico SIP estándar |
| | `8088/tcp` | HTTP Server + WebSocket `/ws` (ARI) |
| | `10000-10100/udp` | Rango RTP para audio |
| **API Gateway** | `3001` | Proxy HTTP → microservicios TCP (auth, cdr, asterisk) |
| **Auth Service** | `3002` | Autenticación, registro, JWT (TCP) |
| **CDR Service** | `3003` | Consulta de registros de llamadas (TCP) |
| **Asterisk Manager** | `3004` | Gestión de extensiones SIP vía SSH (TCP) |
| **Recorder Service** | `3005` | Upload de grabaciones a MinIO via fs.watch (TCP) |
| **Prometheus** | `9090` | Métricas y alertas (SLOs, 4 golden signals) |
| **Grafana** | `3006` | Dashboards de monitoreo (SLO Dashboard) |
| **PostgreSQL Exporter** | - (red interna) | Exporta métricas de PostgreSQL a Prometheus |
| **MinIO** | `9000` | API S3 compatible (bucket privado) |
| **Frontend** | `3000` | WebPhone WebRTC + mute/hold + visor de grabaciones vía API |

## Flujo de Integración (Backend NestJS)

El backend NestJS en multi-repo expone una API REST unificada a través del Gateway y orquesta los microservicios:

```
Frontend / Cliente HTTP
        │
        ▼
  api-gateway:3001 (HTTP REST)
        │
        ├── TCP:3002 ─► auth-svc     (login, registro, perfil, midPoint import)
        │                     │
        │                     ├── REST Basic Auth ─► midPoint:8080
        │                     │    (GET /ws/rest/users/self)
        │                     │
        │                     └── fallback: bcrypt local DB
        │
        ├── TCP:3003 ─► cdr-svc      (CDRs, estadísticas)
        │
        └── TCP:3004 ─► asterisk-svc (extensiones, estado, reload)
                              │
                              └── SSH ─► asterisk (pjsip.conf, reload)
                                   (cat, grep, sed, printf, asterisk -rx)

  recorder-svc:3005 (standalone, no gateway)
        │
        ├── fs.watch ─► /recordings/ (volumen asterisk)
        └── fPutObject ─► MinIO:9000 (bucket "recordings")
```

**Flujo completo:**

1. Usuarios seed se crean vía `init.sql` en PostgreSQL con extensión SIP y contraseña
2. Usuarios adicionales se registran via `POST /api/auth/register` (auto-asigna extensión)
3. **Auth**: `POST /api/auth/login` → gateway → auth-svc
   - auth-svc llama a midPoint REST API con Basic Auth (`GET /ws/rest/users/self`)
   - Si midPoint responde OK → usuario autenticado, sincroniza rol desde midPoint
   - Si midPoint no responde → fallback a bcrypt contra la tabla `users`
   - Devuelve JWT con perfil del usuario
4. **API Extensiones**: `GET/POST/DELETE /api/asterisk/extensions` → gateway → asterisk-svc → SSH → pjsip.conf
5. **CDR**: `GET /api/cdr` → gateway → cdr-svc → PostgreSQL
6. Softphone se registra con credenciales almacenadas en `users`

> **Nota:** midPoint se utiliza para autenticación y RBAC. Los roles no incluyen inducción a recursos (el conector DatabaseTable no pudo descubrir el schema de PostgreSQL). La tabla `users` se puebla desde `init.sql` (seed) y vía `register()` del auth-service. Los usuarios creados en midPoint existen solo en su repositorio interno; el auth-service sincroniza el rol al hacer login.

## Mecanismo de Importación Inicial

En el primer arranque, `auth-svc` ejecuta en background un loop que reintenta cada 30s:
1. Espera a que midPoint esté saludable (dependencia `service_healthy` en docker-compose)
2. Elimina el recurso DB roto (si existe) — `DELETE /ws/rest/resources/c0ffee01-...`
3. Importa roles y object template via REST API:
   - **Role** `Admin` (sin inducción a recursos)
   - **Role** `AgenteCallCenter` (sin inducción a recursos)
   - **Object Template** (mappings para telephoneNumber)
4. Verifica si los 4 usuarios seed existen en midPoint (`GET /ws/rest/users/{username}`)
5. Si falta alguno, los importa via `POST /ws/rest/users` (sin provisioning)
6. Repite cada 30s hasta que los 4 usuarios estén confirmados

> **Nota:** Los roles ya no incluyen `<inducement>` a recursos DB (el conector DatabaseTable no puede descubrir el schema de PostgreSQL). Los usuarios se crean en midPoint para autenticación y RBAC, pero no se provisionan a la tabla `users`. Los datos de `users` se manejan desde `init.sql` y `auth.service.register()`.

### Importación manual alternativa

Si el auth-service no logra importar, ejecutar dentro del contenedor midPoint:
```bash
docker-compose exec midpoint /opt/midpoint/scripts/import-midpoint.sh
```

O usando el servicio `midpoint-init` (perfil tools):
```bash
docker-compose --profile tools run midpoint-init
```

El script usa `curl` para importar configs y `midpoint.sh import -raw` para usuarios (sin provisioning).

## Flujo de Grabaciones

1. Asterisk MixMonitor graba la llamada a `/var/spool/asterisk/monitor/` (montado como volumen `asterisk-recordings`)
2. `recorder-svc` (NestJS, TCP:3005) monta el mismo volumen en `/recordings` y usa `fs.watch` para detectar nuevos archivos `.wav`
3. Detecta eventos `rename` y `change` con debounce de 2s y sube el archivo a MinIO via `minioClient.fPutObject()` al bucket `recordings` (privado)
4. En el arranque, `recorder-svc` crea el bucket `recordings` si no existe (sin política pública) y re-subé archivos `.wav` existentes
5. Frontend lista grabaciones desde `GET /api/recordings` (Gateway → MinIO) con autenticación JWT
6. El gateway genera **URLs pre-firmadas** (válidas 1 hora) para cada archivo, el navegador reproduce con `<audio>` nativo
7. Las URLs pre-firmadas expiran automáticamente, eliminando acceso público a las grabaciones

## Monitoreo (Prometheus + Grafana)

El sistema incluye monitoreo basado en las **4 Señales Doradas** (tráfico, latencia, errores, saturación) más métricas de runtime, dependencias externas y negocio.

### Métricas principales

| Grupo | Métricas clave | Fuente |
|-------|---------------|--------|
| Tráfico | `http_requests_total` (por method, path, status_code) | Gateway (interceptor) |
| Latencia | `http_request_duration_seconds` (histograma p50/p95/p99) | Gateway (interceptor) |
| Errores | Tasa derivada de `http_requests_total{status_code=~"5.."}` | Gateway (interceptor) |
| Saturación | `process_resident_memory_bytes`, `process_cpu_seconds_total` | prom-client default |
| Runtime | `nodejs_heap_size_used_bytes`, `nodejs_eventloop_lag_seconds` | prom-client default |
| Microservicios | `microservice_request_duration_seconds`, `microservice_errors_total` | Gateway (AppController) |
| DB | `pg_stat_database_numbackends` | postgres-exporter |
| Negocio | `calls_processed_total`, `auth_failures_total`, `active_sessions` | Gateway (AppController) |

El dashboard `SLO Dashboard` tiene 15 paneles con datos: tráfico RPS, latencia p50/p95/p99, tasa de errores, memoria RAM, CPU, heap, event loop lag, file descriptors, latencia y errores de microservicios, calls processed, auth failures, sesiones activas, in-flight requests, up/build info y conexiones DB.

### Alertas configuradas

| Alerta | Condición | Severidad |
|--------|-----------|-----------|
| Error rate > 5% | `rate(5xx)/rate(total) > 0.05` por 2m | critical |
| P95 latencia > 2s | `histogram_quantile(0.95, ...) > 2` por 2m | warning |
| Memoria > 500MB | `process_resident_memory_bytes > 500MB` por 5m | warning |
| Servicio caído | `up == 0` por 1m | critical |

### Acceso

| Servicio | URL |
|----------|-----|
| Prometheus | `http://localhost:9090` |
| Grafana | `http://localhost:3006` (admin / grafana) |

Ver [docs/monitoring.md](docs/monitoring.md) para documentación completa.

## Pruebas

```bash
# Suite completa de integración (10 tests, todos pasando)
powershell -NoProfile -File tests/run-all-tests.ps1

# Pruebas de carga (10 llamadas concurrentes con SIPp)
cd tests/load-test && ./run-load-test.sh 172.20.0.x

# Escaneo de vulnerabilidades con Trivy
cd tests/security && ./trivy-scan.sh

# Verificación de cifrado TLS en SIP
cd tests/security && ./test-tls-sip.sh
```

### Tests de Integración (run-all-tests.ps1)

| # | Test | Descripción |
|---|------|-------------|
| 1 | Docker containers status | Verifica que todos los contenedores estén `Up` |
| 2 | Database connection | Conexión a PostgreSQL desde el host vía `psql` |
| 3 | Seed users in database | Verifica usuario admin (3001) con `password_hash` poblado |
| 4 | midPoint HTTP endpoint | Acceso a consola web de midPoint |
| 5 | Asterisk CLI | Ejecución de comandos `asterisk -rx` |
| 6 | Asterisk PJSIP transports | Transports UDP y WS configurados |
| 7 | CDR table exists | Tabla `cdr` en PostgreSQL (via `information_schema`) |
| 8 | Audit log table exists | Tabla `audit_log` en PostgreSQL |
| 9 | Provision extension via SSH | Agrega y remueve extensión temporal en pjsip.conf vía SSH |
| 10 | Cross-container network | Asterisk alcanza midPoint vía HTTP |

## ISO 27001 y 25010

Ver [docs/iso-compliance.md](docs/iso-compliance.md) para la matriz completa de cumplimiento con:
- **ISO 27001**: 16 controles mapeados (A.5.1.1 a A.13.2.1)
- **ISO 25010**: 8 características evaluadas (funcionalidad, seguridad, mantenibilidad, etc.)

## Metodología

- **Git**: Ramas por feature (`feature/asterisk-config`, `feature/midpoint-integracion`, `feature/security-tls`, `feature/load-testing`, `feature/documentacion`, `feature/db-setup`)
- **Commits**: Convención `feat: descripción (#US-XXX)`
- **Kanban**: GitHub Projects con columnas: Backlog, To Do (WIP 8), In Progress (WIP 4), Review (WIP 4), Done
- **PR obligatorio**: Todo merge a `main` requiere aprobación de otro integrante

Ver [docs/kanban-guide.md](docs/kanban-guide.md) y [docs/user-stories.md](docs/user-stories.md) para más detalle.

## Video Demostración (2-3 min)

El video debe mostrar:
1. `docker compose ps` (todos los contenedores activos)
2. midPoint: usuario con rol AgenteCallCenter
3. Softphone registrado (estado "Registered")
4. Llamada exitosa entre dos extensiones
5. CDR en la base de datos
6. (Opcional) Grabación reproducida desde el frontend

## Recursos de Documentación

| Documento | Descripción |
|-----------|-------------|
| [docs/architecture.md](docs/architecture.md) | Diagrama de red, flujo de datos, opciones de frontend |
| [docs/endpoints-and-credentials.md](docs/endpoints-and-credentials.md) | Endpoints REST, credenciales, variables de entorno |
| [docs/integration-guide.md](docs/integration-guide.md) | Flujo de aprovisionamiento, DatabaseTable Connector, object templates, troubleshooting |
| [docs/iso-compliance.md](docs/iso-compliance.md) | Matriz de cumplimiento ISO 27001 e ISO 25010 |
| [docs/kanban-guide.md](docs/kanban-guide.md) | Configuración del tablero, asignación por fase, reglas del equipo |
| [docs/monitoring.md](docs/monitoring.md) | Monitoreo SLO — métricas, alertas, dashboard de Grafana |
| [docs/user-stories.md](docs/user-stories.md) | 16 user stories organizadas en 5 épicas |

## Equipo

- 4 integrantes
- Roles: Product Owner, Arquitecto DevOps (2), Integrador/Soporte
- Metodología ágil (Kanban/Scrum)

---

**Fases del Proyecto**

| Fase | Actividad | Entregable |
|------|-----------|------------|
| 1 | Planificación y Requisitos | README, docker-compose base, Kanban |
| 2 | Diseño y Configuración | Dockerfiles, configuración de servicios |
| 3 | Integración | Scripts de aprovisionamiento midPoint → Asterisk |
| 4 | Pruebas | Carga, seguridad, vulnerabilidades |
| 5 | Backend NestJS | Multi-repo con gateway, auth, cdr, asterisk-svc, recorder-svc, recordings API |
| 6 | Despliegue y Documentación | Orquestación final, informe, video |
