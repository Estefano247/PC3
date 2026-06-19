# Guía de Integración: midPoint → Asterisk

## Arquitectura de Integración

```
┌──────────────────┐   DatabaseTable    ┌──────────────┐
│   PostgreSQL 15   │◄─────────────────►│   midPoint    │
│  (callcenter DB)  │   Connector       │  (IAM Core)   │
│    - users        │   (Live Sync)     │               │
│    - cdr          │                   │  - Object     │
│    - audit_log    │                   │    Template   │
└──────────────────┘                   │    (Mappings) │
                                        │  - Role       │
                                        │    Inducement │
                                        └──────┬───────┘
                                               │
                                     Groovy Mappings
                                     (generan sip_extension
                                      y sip_password)
                                               │
                                     (escribe en users.sip_extension
                                      y users.sip_password)
                                               │
                                     ┌────────▼────────┐
                                     │   PostgreSQL     │
                                     │  extconfig.conf  │
                                     │  consulta users  │
                                     └────────┬────────┘
                                               │
                                     ┌────────▼────────┐
                                     │   Asterisk       │
                                     │  (PBX / PJSIP)   │
                                     │  extconfig.conf  │
                                     └──────────────────┘
```

## Flujo de Aprovisionamiento

1. **Usuario nuevo** se crea en midPoint UI con rol `AgenteCallCenter`
2. **midPoint** ejecuta Live Sync cada N segundos consultando la tabla `users` de PostgreSQL vía DatabaseTableConnector
3. **Correlación**: midPoint correlaciona el usuario por `username` en su repositorio interno
4. **Object Template**: midPoint aplica el object template con mappings Groovy que:
   - Generan `sip_extension` automáticamente (desde el username, empezando en 1100)
   - Generan `sip_password` aleatorio
   - Mapean `role` del usuario al recurso
5. **Escritura en BD**: Los mappings escriben `sip_extension` y `sip_password` en la tabla `users` de PostgreSQL
6. **Asterisk lee configuración**: Via `extconfig.conf`, Asterisk consulta `users` en PostgreSQL directamente (no requiere recarga)
7. **Softphone**: El agente configura su softphone con extensión y contraseña → se registra

> **Nota:** A diferencia de versiones anteriores, ya no se usa ARI ni ScriptedSQL. midPoint escribe directamente en la BD y Asterisk lee desde `extconfig.conf` con consultas SQL en tiempo real. El script `provision-asterisk.py` solo se usa para operaciones vía SSH cuando es necesario forzar una recarga.

## Recursos de midPoint Creados

| Recurso | OID | Archivo | Propósito |
|---------|-----|---------|-----------|
| CallCenter DB | `c0ffee01-c0ff-ee01-c0ff-ee01c0ffee01` | `resource-scripted-sql.xml` | Conector a PostgreSQL vía DatabaseTableConnector (tabla `users`) |
| Rol AgenteCallCenter | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | `role-agentecallcenter.xml` | Rol con inducción para aprovisionar SIP |
| Object Template | `b2c3d4e5-f6a7-8901-bcde-f12345678901` | `object-template-user.xml` | Mappings Groovy para generación de extensión y password |

## Configuración de Sync en midPoint

1. **Los recursos se importan automáticamente** en el primer arranque via `init-midpoint.sh`:
   ```bash
   # Entrypoint personalizado que:
   # 1. Inicia midPoint en background
   # 2. Espera healthcheck OK (/actuator/health)
   # 3. Ejecuta import-all.sh:
   curl -u administrator:5ecr3t -X POST \
     -H "Content-Type: application/xml" \
     -d @/opt/midpoint/init/resource-scripted-sql.xml \
     http://localhost:8080/midpoint/ws/rest/resources

   curl -u administrator:5ecr3t -X POST \
     -H "Content-Type: application/xml" \
     -d @/opt/midpoint/init/role-agentecallcenter.xml \
     http://localhost:8080/midpoint/ws/rest/roles

   curl -u administrator:5ecr3t -X POST \
     -H "Content-Type: application/xml" \
     -d @/opt/midpoint/init/object-template-user.xml \
     http://localhost:8080/midpoint/ws/rest/objectTemplates
   ```

2. **Verificar sincronización** en midPoint UI:
   - Resource → CallCenter DB → Synchronization → Status
   - Users → Buscar usuario sincronizado
   - Los usuarios con rol `AgenteCallCenter` deben tener `sip_extension` y `sip_password` poblados

## Pruebas Unitarias

Ver `tests/unit/test-mappings.groovy` - Pruebas Groovy para:
- Generación de extensión automática
- Validación de roles
- Formato de extensiones (4 dígitos)
- Política de contraseñas (min 8 chars)
- Formato de auditoría

## Pruebas de Integración

```bash
# Prueba rápida del script de provision
./midpoint/scripts/test-provision.sh

# Suite completa de integración (PowerShell)
pwsh tests/run-all-tests.ps1

# Test de flujo completo (crear usuario → ver extensión)
pwsh tests/integration/test-provisioning-flow.ps1

# Verificar CDRs
pwsh tests/integration/test-cdr-verification.ps1

# Generar reporte de auditoría
pwsh tests/integration/test-audit-security.ps1
```

## Resolución de Problemas

| Síntoma | Causa | Solución |
|---------|-------|----------|
| midPoint no ve nuevos usuarios | Live Sync no activado | Verificar recurso → Sync → Enable |
| No se genera extensión SIP | Mappings del object template no aplican | Verificar que el rol `AgenteCallCenter` esté asignado |
| midPoint no arranca | PostgreSQL no ready | Esperar 2-3 min, verificar `docker compose logs db` |
| Extension duplicada | Conflictos en tabla `users` | Verificar `sip_extension` único en BD |
| Softphone no registra | Puerto no expuesto | Verificar `docker compose ps` puerto 5060/8088 |
| CDR vacío | `extconfig.conf` mal configurado | Verificar conexión a PostgreSQL desde Asterisk |
| Fallo en import inicial | midPoint no responde aún | El script `init-midpoint.sh` reintenta hasta que el healthcheck OK |
