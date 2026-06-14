# Laboratorio de Integración de Sistemas

**Infraestructura Unificada de Comunicaciones y Gestión de Identidad**

Solución integral basada en microservicios y open source que integra una central telefónica Asterisk (PBX) con un sistema de gestión de identidades midPoint (IAM), orquestado con Docker y cumpliendo estándares ISO 27001 e ISO 25010.

## Arquitectura

```
┌───────────────────────────────────────────────────────────────────────────┐
│                       callcenter-net (172.20.0.0/16)                      │
│                                                                           │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐ │
│  │   MariaDB:3306    │    │  midPoint:8080    │    │  Asterisk            │ │
│  │                   │    │                   │    │  5060/udp (SIP)     │ │
│  │  - users          │◄──►│  - Scripted SQL   │    │  5061/tcp (TLS)     │ │
│  │  - cdr            │    │    Resource       │    │  8088/tcp (WS+ARI)  │ │
│  │  - audit_log      │    │  - Sync Reaction  │────►│  5038/tcp (AMI)     │ │
│  └──────────────────┘    └──────────────────┘    │  10000-10100 (RTP)   │ │
│                                                   │  MixMonitor (record) │ │
│  ┌──────────────────┐    ┌──────────────────┐    └──────────┬───────────┘ │
│  │  MinIO S3:9000   │◄───┤ recorder(inotify)│              │              │
│  │  (recordings/)   │    │ watch-upload.sh  │              │              │
│  └────────┬─────────┘    └──────────────────┘              │              │
│           │                                                │              │
│           └──────────┐         ┌───────────────────────────┘              │
│                 ┌────▼─────────▼──┐                                      │
│                 │ Frontend Nginx:3000 │                                   │
│                 │ (SIP.js WebPhone   │                                   │
│                 │  + Recordings UI)  │                                   │
│                 └────────────────────┘                                   │
└───────────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   Internet / LAN    │
                    │  Browser WebPhone   │
                    │  MicroSIP / Zoiper  │
                    │  Linphone           │
                    └────────────────────┘
```

## Stack Tecnológico

| Componente | Tecnología | Puerto |
|------------|-----------|--------|
| Base de Datos | MariaDB 10.6 | 3306 |
| IAM / Orquestador | midPoint 4.8 | 8080 |
| Central Telefónica | Asterisk 20 (PJSIP) | 5060/5061, 8088, 8089, 5038, 10000-10100 |
| Almacenamiento S3 | MinIO | 9000 (API), 9001 (Console) |
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
#    Extensiones:          1001 / 1002 / 2001 / 3001
#    Contraseñas:          sip1001pass / sip1002pass / sip2001pass / sip3001pass

# 7. Acceder a midPoint (IAM)
#    URL: http://localhost:8080/midpoint
#    Usuario: administrator
#    Contraseña: Chang3M3!

# 8. Acceder a MinIO Console
#    URL: http://localhost:9001
#    Usuario: minioadmin
#    Contraseña: minioadmin123

# 9. Ver logs
docker compose logs -f
```

> **Nota:** El comando `docker compose down --volumes` elimina los volúmenes persistentes. Es necesario la **primera vez** o tras modificar configuraciones de Asterisk (`pjsip.conf`, `extensions.conf`) para que se copien los archivos actualizados al volumen. Si solo reiniciás servicios sin `--volumes`, se usará la configuración antigua del volumen persistente.

## Cómo usar el WebPhone

El WebPhone permite llamadas entre extensiones desde el navegador usando WebRTC.

### 1. Abrir dos pestañas/ventanas del navegador

Cada pestaña representa un "teléfono" distinto. Entrá a `http://localhost:3000` en ambas.

### 2. Registrar cada extensión

Dejá los valores por defecto y hacé clic en **Registrar**:

| Pestaña | Extensión | Contraseña | Servidor |
|---------|-----------|------------|----------|
| A (tuya) | `1001` | `sip1001pass` | `localhost:8088/ws` |
| B (destino) | `1002` | `sip1002pass` | `localhost:8088/ws` |

Si todo funciona, cada pestaña mostrará:
- **Status dot verde** y texto "Registrado como 1001/1002"
- **Ext:** con el número de extensión
- El formulario de login se oculta y aparecen el teclado numérico y botón **Llamar**

### 3. Hacer una llamada

1. En la pestaña A (1001), escribí `1002` en el campo de extensión destino
2. Hacé clic en **Llamar**
3. En la pestaña B (1002), aparecerá un `confirm()` del navegador: "Llamada entrante de desconocido. ¿Responder?"
4. Hacé clic en **Aceptar** en la pestaña B
5. La llamada se conecta. Se puede colgar desde cualquier extremo con **Colgar**

### 4. Ver grabaciones

Después de colgar una llamada, cambiá a la pestaña **Grabaciones** y hacé clic en **Actualizar**. Las grabaciones aparecen listadas con un reproductor `<audio>` para escucharlas.

### 5. Probar con más extensiones

| Extensión | Contraseña | Rol | Contexto |
|-----------|-----------|-----|----------|
| `2001` | `sip2001pass` | Supervisor | supervisors |
| `3001` | `sip3001pass` | Admin | admins |

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
├── blueprint_content.txt            # Blueprint del laboratorio
├── lab_content.txt                  # Contenido del laboratorio
│
├── db/
│   └── init.sql                     # Esquema BD: users, cdr, recordings, audit_log
│
├── asterisk/                        # Central Telefónica
│   ├── Dockerfile                   # Imagen personalizada Asterisk 20
│   ├── config/
│   │   ├── asterisk.conf           # Configuración global
│   │   ├── pjsip.conf              # Endpoints SIP + WebSocket transports (UDP/TCP/TLS/WS)
│   │   ├── extensions.conf         # Plan de marcado (contextos por rol)
│   │   ├── modules.conf            # Módulos cargados
│   │   ├── http.conf               # ARI HTTP (port 8088)
│   │   ├── ari.conf                # REST API credentials
│   │   ├── manager.conf            # AMI (port 5038)
│   │   ├── cdr.conf                # CDR general
│   │   ├── cdr_manager.conf        # CDR vía AMI
│   │   └── extconfig.conf          # Mapeo a MySQL real-time
│   └── scripts/
│       ├── entrypoint.sh           # Script de arranque del contenedor
│       ├── provision_extension.sh  # Agregar/quitar extensiones SIP
│       └── sync_from_db.sh         # Sincronización manual desde BD
│
├── midpoint/                        # IAM / Orquestador de Identidad
│   ├── Dockerfile                   # Imagen personalizada midPoint 4.8
│   ├── config/
│   │   ├── resource-scripted-sql.xml      # Recurso midPoint → MariaDB
│   │   ├── role-agentecallcenter.xml      # Rol con inducción de provisión
│   │   └── object-template-user.xml       # Template con mappings SIP
│   └── scripts/
│       ├── provision-asterisk.py          # Provisioning vía ARI/SSH
│       ├── deprovision-asterisk.py        # Deprovisioning de extensiones
│       ├── import-resource.sh             # Importación automatizada a midPoint
│       └── test-provision.sh              # Test unitario de provisioning
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
| **MariaDB** | `3306` | Base de datos compartida (usuarios, CDR, auditoría) |
| **midPoint** | `8080` | Consola de administración IAM, API REST |
| **Asterisk** | `5060/udp+tcp` | Tráfico SIP estándar |
| | `5061/tcp` | SIP sobre TLS |
| | `8088/tcp` | HTTP Server + WebSocket `/ws` (ARI) |
| | `8089/tcp` | WebSocket directo (PJSIP WebRTC) |
| | `5038/tcp` | AMI (Asterisk Manager Interface) |
| | `10000-10100/udp` | Rango RTP para audio |
| **MinIO** | `9000` | API S3 compatible |
| | `9001` | Consola web de administración |
| **Frontend** | `3000` | WebPhone WebRTC + visor de grabaciones |

## Flujo de Integración (midPoint → Asterisk)

1. Usuario se crea en la BD con rol `AgenteCallCenter`
2. midPoint detecta el cambio vía recurso Scripted SQL (Live Sync)
3. midPoint correlaciona el usuario y ejecuta una reacción Groovy
4. La reacción ejecuta `provision-asterisk.py` (vía ARI HTTP, fallback SSH)
5. El script agrega endpoint/auth/aor en `pjsip.conf`
6. Asterisk recarga configuración PJSIP (`pjsip reload`)
7. Softphone se registra con credenciales sincronizadas
8. CDR se guarda en MariaDB al finalizar cada llamada

## Flujo de Grabaciones

1. Asterisk MixMonitor graba la llamada a `/var/spool/asterisk/monitor/`
2. Contenedor `recorder` detecta nuevo WAV via inotify
3. `watch-upload.sh` sube el archivo a MinIO bucket `recordings`
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
| 2 | Database connection | Conexión a MariaDB desde el host |
| 3 | Seed users in database | Verifica usuarios iniciales (1001, 1002, 2001, 3001) |
| 4 | midPoint HTTP endpoint | Acceso a consola web de midPoint |
| 5 | Asterisk CLI | Ejecución de comandos `asterisk -rx` |
| 6 | Asterisk PJSIP transports | Transports UDP y WS configurados |
| 7 | CDR table exists | Tabla `cdr` en MariaDB |
| 8 | Audit log table exists | Tabla `audit_log` en MariaDB |
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
| [docs/integration-guide.md](docs/integration-guide.md) | Flujo de aprovisionamiento, configuración de sync, troubleshooting |
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
