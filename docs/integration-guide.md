# Guia de Integracion: Backend NestJS + midPoint + Asterisk

## Arquitectura de Integracion

```
+------------------+   DatabaseTable    +--------------+
|   PostgreSQL 15   |<----------------->|   midPoint    |
|  (callcenter DB)  |   Connector       |  (IAM Core)   |
|    - users        |   (Live Sync)     |               |
|    - cdr          |                   |  - Object     |
|    - audit_log    |                   |    Template   |
+---------+--------+                   |    (Mappings) |
          |                            |  - Role       |
          |                            |    Inducement |
          |                            +-------+-------+
          |                                    | REST API
          |                                    | (Basic Auth)
          |   +--------------------------------+------------------+
          |   |        Backend NestJS         |                  |
          |   |                               v                  |
          |   |  +---------+   +----------+  +----------+       |
          |   |  | Gateway |-->| Auth     |  | Recorder |       |
          |   |  | :3001   |   | :3002    |  | :3005    |       |
          +---+--+ (HTTP)  |   | (TCP) c  |  | (TCP)    |       |
          |   |  |         |   +-------+--+  +-----+----+       |
          |   |  |         |   +----------+        |            |
          |   |  |         |-->| Cdr :3003 |        | fPutObject|
          |   |  |         |   | (TCP)    |        |            |
          |   |  |         |   +----------+        v            |
          |   |  |         |   +----------+  +--------+         |
          |   |  |         |-->|Asterisk  |  | MinIO  |         |
          |   |  +---------+   |Svc :3004 |->| :9000  |         |
          |   |                | (TCP)    |  +--------+         |
          |   |                +----+-----+                     |
          |   |                     | SSH                       |
          |   +---------------------+---------------------------+
          |                         |
          |                 +-------v--------+
          |                 |   Asterisk     |
          |                 |  (PBX / PJSIP) |
          |                 |  pjsip.conf    |
          |                 +----------------+
          +------------------------------------+
```

## Flujo de Aprovisionamiento

### Gestion de identidad (midPoint -> BD)

1. **Usuario nuevo** se crea en midPoint UI con rol `AgenteCallCenter`
2. **midPoint** ejecuta Live Sync consultando la tabla `users` de PostgreSQL via DatabaseTableConnector
3. **Correlacion**: midPoint correlaciona el usuario por `username`
4. **Object Template**: midPoint aplica mappings Groovy que generan `sip_extension` y `sip_password`
5. **Escritura en BD**: Los mappings escriben `sip_extension` y `sip_password` en la tabla `users`

### Gestion de extensiones (Backend API -> SSH -> Asterisk)

1. **Cliente HTTP** llama a `POST /api/auth/login` -> gateway -> auth-svc -> devuelve JWT
2. **Cliente HTTP** llama a `GET/POST/DELETE /api/asterisk/extensions` -> gateway -> asterisk-svc
3. **asterisk-svc** se conecta por SSH al contenedor `asterisk` como usuario `provision` usando la clave privada (`backend/asterisk/pbx/ssh/provision-key`)
4. Ejecuta comandos directos sobre `/etc/asterisk/pjsip.conf`: `cat`, `grep`, `sed`, `printf`
5. Recarga `res_pjsip` con `sudo /usr/sbin/asterisk -rx "module reload res_pjsip.so"`
6. **Softphone**: El agente se registra con extension y contrasena

> **Nota:** Los comandos `asterisk -rx` se ejecutan con `sudo /usr/sbin/asterisk` porque el socketctl (`/var/run/asterisk/asterisk.ctl`) es propiedad de root, y el usuario `provision` tiene sudo NOPASSWD configurado. El comando `core show status` no existe en Asterisk 20; se usa `core show uptime`, `core show version` y `core show calls` combinados.

## Recursos de midPoint Creados

| Recurso | OID | Archivo | Proposito |
|---------|-----|---------|-----------|
| CallCenter DB | `c0ffee01-c0ff-ee01-c0ff-ee01c0ffee01` | `backend/auth/midpoint/config/resource-scripted-sql.xml` | Conector a PostgreSQL via DatabaseTableConnector (tabla `users`) |
| Rol AgenteCallCenter | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | `backend/auth/midpoint/config/role-agentecallcenter.xml` | Rol con induccion para aprovisionar SIP |
| Object Template | `b2c3d4e5-f6a7-8901-bcde-f12345678901` | `backend/auth/midpoint/config/object-template-user.xml` | Mappings Groovy para generacion de extension y password |

## Configuracion de Sync en midPoint

1. **Los recursos se importan automaticamente** en el primer arranque por `auth-svc` (NestJS `OnApplicationBootstrap`):
   - auth-svc espera a que midPoint este saludable (healthcheck `/actuator/health`)
   - POSTea los 3 XMLs via REST API:
     - `POST /ws/rest/resources` -> resource-scripted-sql.xml
     - `POST /ws/rest/roles` -> role-agentecallcenter.xml
     - `POST /ws/rest/objectTemplates` -> object-template-user.xml
   - HTTP 409 (conflicto) se trata como exito (config ya existe)
   - Ejecucion fire-and-forget (no bloquea inicio del servicio)

2. **Verificar sincronizacion** en midPoint UI:
   - Resource -> CallCenter DB -> Synchronization -> Status
   - Users -> Buscar usuario sincronizado
   - Los usuarios con rol `AgenteCallCenter` deben tener `sip_extension` y `sip_password` poblados

## Pruebas Unitarias

Ver `tests/unit/test-mappings.groovy` - Pruebas Groovy para:
- Generacion de extension automatica
- Validacion de roles
- Formato de extensiones (4 digitos)
- Politica de contrasenas (min 8 chars)
- Formato de auditoria

## Pruebas de Integracion

```bash
# Suite completa de integracion (PowerShell)
pwsh tests/run-all-tests.ps1

# Test de flujo completo (crear usuario -> ver extension)
pwsh tests/integration/test-provisioning-flow.ps1

# Verificar CDRs
pwsh tests/integration/test-cdr-verification.ps1

# Generar reporte de auditoria
pwsh tests/integration/test-audit-security.ps1
```

## Resolucion de Problemas

| Sintoma | Causa | Solucion |
|---------|-------|----------|
| midPoint no ve nuevos usuarios | Live Sync no activado | Verificar recurso -> Sync -> Enable |
| No se genera extension SIP | Mappings del object template no aplican | Verificar que el rol `AgenteCallCenter` este asignado |
| midPoint no arranca | PostgreSQL no ready | Esperar 2-3 min, verificar `docker compose logs db` |
| Extension duplicada | Conflictos en tabla `users` | Verificar `sip_extension` unico en BD |
| Softphone no registra | Puerto no expuesto | Verificar `docker compose ps` puerto 5060/8088 |
| CDR vacio | `extconfig.conf` mal configurado | Verificar conexion a PostgreSQL desde Asterisk |
| Fallo en import inicial | midPoint no responde aun | auth-svc reintenta hasta que el healthcheck OK |
| API devuelve 401 | Token JWT expirado o invalido | Renovar token via `POST /api/auth/login` |
| asterisk-svc no conecta | Clave SSH incorrecta o permiso | Verificar `backend/asterisk/pbx/ssh/provision-key` y `authorized_keys` en el home de `provision` en Asterisk |
| asterisk-svc 500: "command not found" | `asterisk` no está en PATH del usuario `provision` | Usar ruta completa `/usr/sbin/asterisk` |
| asterisk-svc 500: "Unable to connect to remote asterisk" | Socketctl inaccesible por permisos | Usar `sudo /usr/sbin/asterisk` (configurado en sudoers) |
| API devuelve 401 en endpoints protegidos | JwtStrategy no conecta con auth-svc ({ cmd: 'auth.validate' }) | Verificar que auth-svc contesta en TCP:3002 y que `validateToken()` acepta `{ userId }` |
| Extension no aparece en API | pjsip.conf no reflejado | El servicio lee el archivo directamente; si midPoint escribio en DB, la extension existe pero no en pjsip.conf |
