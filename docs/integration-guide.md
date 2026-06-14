# Guía de Integración: midPoint → Asterisk

## Arquitectura de Integración

```
┌──────────────┐     ScriptedSQL      ┌──────────────┐
│   MariaDB    │◄────────────────────►│   midPoint   │
│  (users DB)  │   JDBC Connector     │  (IAM Core)  │
└──────────────┘                      └──────┬───────┘
                                             │
                                   Groovy Script
                                   (Synchronization
                                    Reaction)
                                             │
                                    ┌────────▼────────┐
                                    │  provision-     │
                                    │  asterisk.py    │
                                    │  (Python)       │
                                    └────────┬────────┘
                                             │
                                  HTTP / ARI  │  SSH
                                             │
                                    ┌────────▼────────┐
                                    │   Asterisk      │
                                    │  (PBX / PJSIP)  │
                                    └─────────────────┘
```

## Flujo de Aprovisionamiento

1. **Usuario nuevo** se inserta en `users` de MariaDB con `role = AgenteCallCenter`
2. **midPoint** ejecuta Live Sync cada N segundos consultando la BD vía ScriptedSQL
3. **Correlación**: midPoint identifica si el usuario existe en su repositorio interno por `username`
4. **Situación**: Si es nuevo → `linked`, si se elimina → `unlinked`
5. **Reacción** (Groovy): Cuando `situation = linked` y `role = AgenteCallCenter`, ejecuta:
   ```groovy
   Runtime.getRuntime().exec(["python3", "/opt/midpoint/scripts/provision-asterisk.py",
       id, name, telephoneNumber, password, fullName])
   ```
6. **Python script**: `provision-asterisk.py` intenta:
   - **Primario**: Llamar a la ARI de Asterisk vía HTTP (puerto 8088)
   - **Fallback**: Ejecutar `provision_extension.sh` dentro del contenedor
7. **Shell script**: `provision_extension.sh` añade al `pjsip.conf` y ejecuta `pjsip reload`
8. **Softphone**: El agente configura su softphone con extensión y contraseña → se registra

## Recursos de midPoint Creados

| Recurso | OID | Archivo | Propósito |
|---------|-----|---------|-----------|
| CallCenter DB | `...0001` | `resource-scripted-sql.xml` | Conector a MariaDB vía ScriptedSQL |
| Rol AgenteCallCenter | `...0010` | `role-agentecallcenter.xml` | Rol con inducción para aprovisionar SIP |
| Object Template | `...0020` | `object-template-user.xml` | Mappings para generación de extensión |

## Configuración de Sync en midPoint

1. **Importar recursos** (vía API REST o interfaz web):
   ```bash
   # Import resource
   curl -u administrator:Chang3M3! -X POST \
     -H "Content-Type: application/xml" \
     -d @/opt/midpoint/init/resource-scripted-sql.xml \
     http://localhost:8080/midpoint/ws/rest/resources/import

   # Import role
   curl -u administrator:Chang3M3! -X POST \
     -H "Content-Type: application/xml" \
     -d @/opt/midpoint/init/role-agentecallcenter.xml \
     http://localhost:8080/midpoint/ws/rest/roles/import
   ```

2. **Verificar sincronización** en midPoint UI:
   - Resource → CallCenter DB → Synchronization → Status
   - Users → Buscar usuario sincronizado
   - Debe mostrar "Linked" para usuarios con extensión SIP

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
| Script de provision no se ejecuta | Groovy no encuentra python3 | Usar ruta absoluta `/usr/bin/python3` |
| Extension duplicada | pjsip.conf tiene entradas repetidas | El script ya maneja duplicados (grep previo) |
| ARI rechaza conexión | Credenciales incorrectas | Verificar `ari.conf` usuario/password |
| pjsip reload falla | Permisos de escritura | Asegurar que `/etc/asterisk` es writable |
| Softphone no registra | Puerto no expuesto | Verificar `docker compose ps` puerto 5060 |
| CDR vacío | cdr_mysql.conf incorrecto | Verificar host/port/user/pass en el archivo |
