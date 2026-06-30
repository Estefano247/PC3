# Guia de Integracion: Backend NestJS + midPoint + Asterisk

## Arquitectura de Integracion

```
+------------------+        REST API      +--------------+
|   PostgreSQL 15   |<----------------->|   midPoint    |
|  (callcenter DB)  |   (Basic Auth)     |  (IAM Core)   |
|    - users        |                   |               |
|    - cdr          |                   |  - Object     |
|    - audit_log    |                   |    Template   |
+---------+--------+                   |    (Mappings) |
          |                            |  - Role       |
          |                            |    (sin       |
          |                            |    inducement)|
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

### Gestion de identidad (auth-svc import)

1. **En el arranque**: `auth-svc` importa roles y object template en midPoint via REST API, luego importa 4 usuarios seed (admin1, admin2, agente1, agente2) con rol `AgenteCallCenter`. Reintenta cada 30s hasta confirmar que los 4 usuarios existen.
2. **Autenticacion**: Cuando un usuario inicia sesion, `auth-svc` valida contra midPoint (`GET /ws/rest/users/self` con Basic Auth) y cae en fallback a bcrypt local si midPoint no responde
3. **Perfil**: El JWT contiene `username`, `role`, `sipExtension` y `sipPassword` para que el frontend se registre en Asterisk

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
| Rol Admin | `00000000-0000-0000-0000-000000000030` | `backend/auth/midpoint/config/role-admin.xml` | Rol admin sin induccion |
| Rol AgenteCallCenter | `00000000-0000-0000-0000-000000000010` | `backend/auth/midpoint/config/role-agentecallcenter.xml` | Rol agente sin induccion |
| Object Template | `00000000-0000-0000-0000-000000000020` | `backend/auth/midpoint/config/object-template-user.xml` | Mappings Groovy para telephoneNumber |

## Configuracion de Sync en midPoint

1. **Los recursos se importan automaticamente** en el primer arranque por `auth-svc` (background loop cada 30s):
   - auth-svc espera a que midPoint este saludable (dependencia `service_healthy` en docker-compose)
   - Elimina el recurso DB roto si existe (`DELETE /ws/rest/resources/c0ffee01-...`)
   - Importa roles y object template via REST API (DELETE + POST)
   - Verifica si los 4 usuarios seed existen (`GET /ws/rest/users/{username}`)
   - Si falta alguno, los importa via `POST /ws/rest/users`
   - Repite hasta confirmar los 4 usuarios

2. **Verificar usuarios** en midPoint UI:
   - Users -> Buscar usuario por nombre (admin1, admin2, agente1, agente2)
   - Los usuarios existen solo en midPoint (no se provisionan a la tabla `users`)

> **Nota:** El conector DatabaseTable no pudo descubrir el schema de PostgreSQL.
> Los roles ya no incluyen inducement a recursos. Los usuarios se crean en midPoint
> exclusivamente para autenticacion y RBAC. La tabla `users` se puebla desde
> `init.sql` y `auth.service.register()`.

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
| Usuario no aparece en midPoint | Import automatico fallo | Ejecutar `docker-compose exec midpoint /opt/midpoint/scripts/import-midpoint.sh` |
| El rol no se refleja en el WebPhone | midPoint no respondio durante login | El auth-service cae a bcrypt local; reintentar login |
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
