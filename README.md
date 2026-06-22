# Laboratorio de Integración de Sistemas

**Infraestructura Unificada de Comunicaciones y Gestión de Identidad**

Solución integral basada en microservicios y open source que integra una central telefónica Asterisk (PBX) con un sistema de gestión de identidades midPoint (IAM) y un backend NestJS en multi-repo, orquestado con Docker y cumpliendo estándares ISO 27001 e ISO 25010.

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         callcenter-net (172.20.0.0/16)                           │
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────────────────┐    │
│  │  PostgreSQL 15│    │  midPoint 4.8│    │  Asterisk 20 (PJSIP)           │    │
│  │              │    │    :8080      │    │  5060/udp+tcp (SIP)            │    │
│  │  - midpoint  │◄──►│  DatabaseTable│    │  8088/tcp (WS+ARI)             │    │
│  │  - callcenter│    │  Connector    │    │  10000-10100 (RTP)             │    │
│  │    . users   │    │  Role RBAC    │    │  MixMonitor (record)           │    │
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
│         │ proxy (nginx → minio:9000)  ws (nginx → asterisk:8088/ws)           │
│  ┌──────▼──────────────┐                     │                                  │
│  │  Frontend:3000       │◄────────────────────┘                                  │
│  │  (SIP.js + Nginx)    │                                                        │
│  └─────────────────────┘                                                        │
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
| Frontend WebRTC | SIP.js 0.21 + Nginx | 3000 |
| Softphones | MicroSIP / Zoiper / Linphone | - |

## Requisitos Previos

- Docker Engine 24+ y Docker Compose 2.20+
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

# 2. Copiar y editar variables de entorno
cp .env.example .env

# 3. Iniciar servicios (primera vez o tras cambios)
docker compose down --volumes
docker compose up -d --build

# 4. Verificar estado
docker compose ps

# 5. Ejecutar tests de integración
pwsh tests/run-all-tests.ps1

# 6. Acceder al WebPhone
#    URL: http://localhost:3000
#    Servidor WebSocket:  localhost:8088/ws (preconfigurado)
#    Extensión:           3001 (admin)
#    Contraseña:          sip3001pass

# 7. Acceder a midPoint (IAM) para crear nuevos usuarios
#    URL: http://localhost:8080/midpoint
#    Usuario: administrator
#    Contraseña: 5ecr3t
#    Los usuarios creados con rol AgenteCallCenter se provisionan automáticamente en Asterisk.

# 8. Ver logs
docker compose logs -f
```

> **Nota:** La contraseña admin de midPoint es `5ecr3t` (default del InitialDataImport). La variable `MP_ADMIN_PASSWORD` del docker-compose no se aplica porque el entrypoint personalizado (`init-midpoint.sh`) reemplaza al oficial. Si se necesita otra contraseña, debe modificarse `init-midpoint.sh`.
>
> El comando `docker compose down --volumes` elimina los volúmenes persistentes. Es necesario la **primera vez** o tras modificar configuraciones de Asterisk (`pjsip.conf`, `extensions.conf`) para que se copien los archivos actualizados al volumen. Si solo reiniciás servicios sin `--volumes`, se usará la configuración antigua del volumen persistente.

## Cómo usar el WebPhone

El WebPhone permite llamadas entre extensiones desde el navegador usando WebRTC.

> Solo existe la extensión admin `3001` por defecto. Para probar llamadas entre dos
> extensiones, primero creá una extensión adicional desde midPoint (ver sección **Crear usuarios desde midPoint**).

### 1. Iniciar sesión como admin

Entrá a `http://localhost:3000`, ingresá:

| Campo | Valor |
|-------|-------|
| Extensión | `3001` |
| Contraseña | `sip3001pass` |
| Servidor | `localhost:8088/ws` |

Hacé clic en **Registrar**. Si todo funciona, verás "Registrado como 3001" con el indicador verde.

### 2. Crear una extensión adicional desde midPoint

Antes de probar llamadas, creá un segundo usuario desde midPoint:

1. Ingresá a `http://localhost:8080/midpoint` (usuario: `administrator`, contraseña: `5ecr3t`)
2. Andá a **Usuarios → Nuevo usuario**
3. Completá **Name** (ej: `agente2`), **Full name** (ej: `Agente 2`), asignale el rol **AgenteCallCenter**
4. Guardá el usuario
5. midPoint provisiona automáticamente la extensión SIP en Asterisk (esto puede tardar unos segundos)

### 3. Registrar la nueva extensión

Abrí otra pestaña/ventana en `http://localhost:3000`, ingresá los datos de la nueva
extensión creada desde midPoint y hacé clic en **Registrar**.

### 4. Hacer una llamada

1. En una pestaña, escribí la extensión destino (ej: `3001`) en el campo de extensión destino
2. Hacé clic en **Llamar**
3. En la otra pestaña, aparecerá la notificación de llamada entrante
4. Hacé clic en **Responder**
5. La llamada se conecta. Se puede colgar desde cualquier extremo con **Colgar**

### 5. Ver grabaciones

Después de colgar una llamada, cambiá a la pestaña **Grabaciones** y hacé clic en **Actualizar**. Las grabaciones aparecen listadas con un reproductor `<audio>` para escucharlas.

> **Tip:** Si usás Chrome, abrí una ventana de incógnito para la segunda extensión. Así evitás conflictos de WebRTC por usar la misma página.

### Solución de problemas comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `SIP is not defined` | SIP.js no cargó (CDN caído) | Hard refresh (**Ctrl+Shift+R**) |
| `WebSocket closed (code: 1006)` | Puerto/path WebSocket incorrecto | Usá `localhost:8088/ws` en el campo Servidor |
| `Permission denied` al llamar | Volumen de configuración obsoleto | Ejecutá `docker compose down --volumes` y volvé a iniciar |
| midPoint no arranca | midPoint tarda en inicializar | Esperá 2-3 min, verificá con `docker compose ps` |

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
│   │       ├── auth/               # JWT Guard + Strategy
│   │       └── dto/
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
│   │       │   ├── resource-scripted-sql.xml # Recurso DatabaseTableConnector
│   │       │   ├── role-agentecallcenter.xml # Rol con inducción
│   │       │   └── object-template-user.xml  # Template con mappings SIP
│   │       └── scripts/
│   │           └── init-midpoint.sh          # Entrypoint simplificado
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
│           ├── recorder.controller.ts
│           ├── recorder.service.ts # fs.watch + MinIO upload
│           └── module.ts
│   └── frontend/                   # WebRTC WebPhone + Grabaciones
│       ├── Dockerfile               # Nginx con proxy a MinIO
│       ├── nginx.conf               # Proxy reverso + MinIO
│       ├── index.html               # WebPhone UI + grabaciones
│       ├── style.css
│       └── js/
│           ├── sip.js               # SIP.js (WebRTC)
│           └── app.js               # Cliente SIP.js
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
└── docs/                            # Documentación del proyecto
    ├── architecture.md              # Diagrama de red y flujo
    ├── integration-guide.md         # Guía integración midPoint → Asterisk
    ├── iso-compliance.md            # Matriz ISO 27001 / 25010
    ├── kanban-guide.md              # Tablero Kanban
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
| **MinIO** | `9000` | API S3 compatible |
| **Frontend** | `3000` | WebPhone WebRTC + visor de grabaciones |

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

1. Usuario se crea en midPoint UI con rol `AgenteCallCenter` (o via API register)
2. midPoint sincroniza el usuario a `users` en PostgreSQL vía DatabaseTable Connector
3. **Auth**: `POST /api/auth/login` → gateway → auth-svc
   - auth-svc llama a midPoint REST API con Basic Auth (`GET /ws/rest/users/self`)
   - Si midPoint responde OK → usuario autenticado
   - Si midPoint no responde → fallback a bcrypt contra la tabla `users`
   - Devuelve JWT con perfil del usuario
4. **API Extensiones**: `GET/POST/DELETE /api/asterisk/extensions` → gateway → asterisk-svc → SSH → pjsip.conf
5. **CDR**: `GET /api/cdr` → gateway → cdr-svc → PostgreSQL
6. Softphone se registra con credenciales sincronizadas

> **Nota sobre el conector:** midPoint 4.8 no incluye el conector ScriptedSQL por defecto. Se utiliza `DatabaseTableConnector` que autodescubre las columnas de la tabla `users` y las expone como atributos `ri:<column_name>` (ej: `ri:sip_extension`, `ri:full_name`). La provisión vía SSH ahora la realiza exclusivamente el backend (`asterisk-svc`).

## Mecanismo de Importación Inicial

En el primer arranque, `auth-svc` ejecuta `importMidpointConfigs()` (via `OnApplicationBootstrap`):
1. Espera a que midPoint esté saludable (healthcheck `/actuator/health`)
2. POSTea los 3 XMLs de configuración via REST API:
   - **Resource** (DatabaseTableConnector → `callcenter.users`)
   - **Role** `AgenteCallCenter` (con resourceRef al resource)
   - **Object Template** (con mappings para generación de SIP extension)
3. HTTP 409 (conflicto) se trata como éxito (config ya existe)
4. La ejecución es fire-and-forget (no bloquea el inicio del servicio)

Los endpoints REST utilizados son `POST /ws/rest/{type}` (no `/import`), y los nombres de tipo usan camelCase: `objectTemplates`.

## Flujo de Grabaciones

1. Asterisk MixMonitor graba la llamada a `/var/spool/asterisk/monitor/` (montado como volumen `asterisk-recordings`)
2. `recorder-svc` (NestJS, TCP:3005) monta el mismo volumen en `/recordings` y usa `fs.watch` para detectar nuevos archivos `.wav`
3. Detecta eventos `rename` con debounce de 2s y sube el archivo a MinIO via `minioClient.fPutObject()` al bucket `recordings`
4. En el arranque, `recorder-svc` crea el bucket `recordings` si no existe y re-subé archivos `.wav` existentes
5. Frontend lista grabaciones desde `http://localhost:3000/recordings/` (proxy Nginx → MinIO)
6. Cada grabación se reproduce con `<audio>` nativo del navegador

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
| [docs/integration-guide.md](docs/integration-guide.md) | Flujo de aprovisionamiento, DatabaseTable Connector, object templates, troubleshooting |
| [docs/iso-compliance.md](docs/iso-compliance.md) | Matriz de cumplimiento ISO 27001 e ISO 25010 |
| [docs/kanban-guide.md](docs/kanban-guide.md) | Configuración del tablero, asignación por fase, reglas del equipo |
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
| 5 | Backend NestJS | Multi-repo con gateway, auth, cdr, asterisk-svc, recorder-svc |
| 6 | Despliegue y Documentación | Orquestación final, informe, video |
