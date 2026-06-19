# Laboratorio de Integración de Sistemas

**Infraestructura Unificada de Comunicaciones y Gestión de Identidad**

Solución integral basada en microservicios y open source que integra una central telefónica Asterisk (PBX) con un sistema de gestión de identidades midPoint (IAM), orquestado con Docker y cumpliendo estándares ISO 27001 e ISO 25010.

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      callcenter-net (172.20.0.0/16)                       │
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────────────┐  │
│  │  PostgreSQL 15│    │  midPoint 4.8│    │  Asterisk 20 (PJSIP)     │  │
│  │              │    │    :8080      │    │  5060/udp+tcp (SIP)      │  │
│  │  - midpoint  │◄──►│  DatabaseTable│    │  8088/tcp (WS+ARI)       │  │
│  │  - callcenter│    │  Connector    │────►│  10000-10100 (RTP)       │  │
│  │    . users   │    │  Sync React.  │    │  MixMonitor (record)     │  │
│  │    . cdr     │    └──────────────┘    └──────────┬──────────────┘  │
│  │    . audit   │                                    │                 │
│  └──────────────┘    ┌──────────────┐               │                 │
│                      │  MinIO S3:9000│◄──────────────┤                 │
│                      │  (recordings/)│               │                 │
│                      └──────┬───────┘               │                 │
│                             │                       │                 │
│                    ┌────────▼────────┐              │                 │
│                    │   recorder      │              │                 │
│                    │ (inotify+mc)    │              │                 │
│                    └─────────────────┘              │                 │
│                             │                       │                 │
│                    ┌────────▼────────┐              │                 │
│                    │ Frontend Nginx:3000 │           │                 │
│                    │ (SIP.js WebPhone  │           │                 │
│                    │ + Recordings UI)  │           │                 │
│                    └──────────────────┘           │                 │
└────────────────────────────────────────────────────┼──────────────────┘
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
| Almacenamiento S3 | MinIO | 9000 (API) |
| Uploader Grabaciones | MinIO mc + inotify | - |
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
├── docker-compose.yml               # Orquestación de 6 servicios
├── .env.example                     # Variables de entorno (plantilla)
├── .gitignore                       # Ignorados de Git
├── README.md                        # Este archivo
├── lab_content.txt                  # Contenido del laboratorio
│
├── db/
│   ├── init.sql                     # Esquema BD (2 databases: midpoint, callcenter)
│   ├── init-midpoint.sql            # Schema interno de midPoint para PostgreSQL
│   ├── native-postgres.sql          # Schema nativo PostgreSQL (midPoint)
│   ├── native-postgres-audit.sql    # Schema de auditoría PostgreSQL
│   └── native-postgres-quartz.sql   # Schema Quartz scheduler PostgreSQL
│
├── asterisk/                        # Central Telefónica
│   ├── Dockerfile                   # Imagen personalizada Asterisk 20
│   ├── config/
│   │   ├── asterisk.conf           # Configuración global
│   │   ├── pjsip.conf              # Endpoints SIP + WebSocket transports
│   │   ├── extensions.conf         # Plan de marcado (contextos por rol)
│   │   ├── modules.conf            # Módulos cargados
│   │   ├── http.conf               # ARI HTTP (port 8088)
│   │   ├── ari.conf                # REST API credentials
│   │   ├── manager.conf            # AMI (red interna)
│   │   ├── cdr.conf                # CDR general
│   │   ├── cdr_manager.conf        # CDR vía AMI
│   │   └── extconfig.conf          # Mapeo a PostgreSQL real-time
│   ├── scripts/
│   │   ├── entrypoint.sh           # Script de arranque del contenedor
│   │   ├── provision_extension.sh  # Agregar/quitar extensiones SIP
│   │   └── sync_from_db.sh         # Sincronización manual desde BD
│   └── ssh/
│       └── provision-key.pub       # Clave pública SSH para midPoint
│
├── midpoint/                        # IAM / Orquestador de Identidad
│   ├── Dockerfile                   # Imagen personalizada midPoint 4.8
│   ├── config/
│   │   ├── config.xml               # Configuración repositorio PostgreSQL
│   │   ├── resource-scripted-sql.xml       # Recurso DatabaseTableConnector → PostgreSQL
│   │   ├── role-agentecallcenter.xml       # Rol con inducción de provisión
│   │   └── object-template-user.xml        # Template con mappings SIP
│   ├── scripts/
│   │   ├── init-midpoint.sh                # Entrypoint: init DB + espera health + import
│   │   ├── import-all.sh                   # Importa resource, role, object-template via REST
│   │   ├── provision-asterisk.py           # Provisioning vía SSH (provision_extension.sh)
│   │   ├── deprovision-asterisk.py         # Deprovisioning vía SSH
│   │   ├── import-resource.sh              # Importación manual de resource
│   │   └── test-provision.sh               # Test unitario de provisioning
│   └── ssh/
│       └── provision-key                   # Clave SSH para provision-asterisk.py
│
├── recorder/                        # Uploader de Grabaciones a S3
│   ├── Dockerfile                   # Imagen basada en alpine + mc
│   └── scripts/
│       ├── init-bucket.sh           # Crear bucket "recordings" en MinIO
│       └── watch-upload.sh          # Watcher inotify: sube WAVs a MinIO
│
├── frontend/                        # WebRTC WebPhone + Grabaciones
│   ├── Dockerfile                   # Nginx con proxy a MinIO
│   ├── nginx.conf                   # Proxy reverso + MinIO proxy
│   ├── index.html                   # WebPhone UI + pestaña de grabaciones
│   ├── style.css                    # Estilos del frontend
│   └── js/
│       ├── sip.js                   # Librería SIP.js (WebRTC)
│       └── app.js                   # Cliente SIP.js + navegador de grabaciones
│
├── scripts/                         # Utilidades del repositorio
│   ├── setup-git.ps1                # Inicializa Git con ramas por feature
│   └── generate-tls-certs.sh        # Genera certificados TLS para SIP
│
├── tests/                           # Suites de prueba
│   ├── run-all-tests.ps1            # Ejecutor maestro de pruebas (10 tests)
│   ├── unit/
│   │   ├── README.md               # Documentación de tests unitarios
│   │   └── test-mappings.groovy    # Pruebas de mappings midPoint
│   ├── integration/
│   │   ├── test-provisioning-flow.ps1  # Flujo completo de provisionamiento
│   │   ├── test-cdr-verification.ps1   # Verificación de CDR en BD
│   │   └── test-audit-security.ps1     # Reporte de auditoría
│   ├── load-test/
│   │   ├── calls.xml               # Escenario SIPp (10 llamadas)
│   │   └── run-load-test.sh        # Ejecutor de pruebas de carga
│   └── security/
│       ├── trivy-scan.sh           # Escaneo de vulnerabilidades en imágenes
│       └── test-tls-sip.sh         # Verificación de cifrado TLS
│
└── docs/                            # Documentación del proyecto
    ├── architecture.md              # Diagrama de red y flujo de datos
    ├── integration-guide.md         # Guía de integración midPoint → Asterisk
    ├── iso-compliance.md            # Matriz ISO 27001 / ISO 25010
    ├── kanban-guide.md              # Configuración del tablero Kanban
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
| **MinIO** | `9000` | API S3 compatible |
| **Frontend** | `3000` | WebPhone WebRTC + visor de grabaciones |

## Flujo de Integración (midPoint → Asterisk)

1. Usuario se crea en la tabla `users` (base `callcenter`) con rol `AgenteCallCenter`
2. midPoint detecta el cambio vía recurso DatabaseTable Connector (Live Sync periódico)
3. midPoint correlaciona el usuario con el rol `AgenteCallCenter` y ejecuta las mappings del object template
4. El object template ejecuta Groovy scripts: generar extensión SIP desde el username y asignar contraseña
5. La sincronización escribe `sip_extension` y `sip_password` en la tabla `users` de PostgreSQL
6. Asterisk lee la configuración desde `extconfig.conf` que consulta la tabla `users`
7. Softphone se registra con credenciales sincronizadas
8. CDR se guarda en PostgreSQL al finalizar cada llamada

> **Nota sobre el conector:** midPoint 4.8 no incluye el conector ScriptedSQL por defecto. Se utiliza `DatabaseTableConnector` que autodescubre las columnas de la tabla `users` y las expone como atributos `ri:<column_name>` (ej: `ri:sip_extension`, `ri:full_name`).

## Mecanismo de Importación Inicial

En el primer arranque, `init-midpoint.sh` (entrypoint personalizado):
1. Inicia midPoint en background
2. Espera a que el healthcheck `/actuator/health` responda OK
3. Ejecuta `import-all.sh` que via REST API crea:
   - **Resource** (DatabaseTableConnector → `callcenter.users`)
   - **Role** `AgenteCallCenter` (con resourceRef al resource)
   - **Object Template** (con mappings para generación de SIP extension)
4. Si los 3 imports son exitosos, crea `/opt/midpoint/var/.init-done`
5. En reinicios posteriores, al existir `.init-done`, los imports se omiten

Los endpoints REST utilizados son `POST /ws/rest/{type}` (no `/import`), y los nombres de tipo usan camelCase: `objectTemplates`.

## Flujo de Grabaciones

1. Asterisk MixMonitor graba la llamada a `/var/spool/asterisk/monitor/`
2. Contenedor `recorder` inicializa alias en MinIO (con reintentos hasta que esté disponible)
3. `watch-upload.sh` detecta nuevo WAV via inotify y lo sube al bucket `recordings`
4. Frontend lista grabaciones desde `http://localhost:3000/recordings/` (proxy Nginx → MinIO)
5. Cada grabación se reproduce con `<audio>` nativo del navegador

## Pruebas

```bash
# Suite completa de integración (10 tests automatizados)
pwsh tests/run-all-tests.ps1

# Pruebas de carga (10 llamadas concurrentes con SIPp)
cd tests/load-test && ./run-load-test.sh 172.20.0.x

# Escaneo de vulnerabilidades con Trivy
cd tests/security && ./trivy-scan.sh

# Verificación de cifrado TLS en SIP
cd tests/security && ./test-tls-sip.sh

# Test unitario de provisioning
./midpoint/scripts/test-provision.sh
```

### Tests de Integración (run-all-tests.ps1)

| # | Test | Descripción |
|---|------|-------------|
| 1 | Docker containers status | Verifica que todos los contenedores estén `Up` |
| 2 | Database connection | Conexión a PostgreSQL desde el host |
| 3 | Seed users in database | Verifica usuario admin (3001) en la base de datos |
| 4 | midPoint HTTP endpoint | Acceso a consola web de midPoint |
| 5 | Asterisk CLI | Ejecución de comandos `asterisk -rx` |
| 6 | Asterisk PJSIP transports | Transports UDP y WS configurados |
| 7 | CDR table exists | Tabla `cdr` en PostgreSQL |
| 8 | Audit log table exists | Tabla `audit_log` en PostgreSQL |
| 9 | Provision extension script | Agregar y remover extensión (1999) |
| 10 | Cross-container network | Comunicación Asterisk → DB y Asterisk → midPoint |

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
| 5 | Despliegue y Documentación | Orquestación final, informe, video |
