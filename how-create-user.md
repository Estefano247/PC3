# Cómo crear un usuario en midPoint

Para crear un usuario en midPoint y usarlo en el callcenter, estos son los campos necesarios:

## XML del usuario en midPoint

```xml
<user xmlns="http://midpoint.evolveum.com/xml/ns/public/common/common-3"
      xmlns:c="http://midpoint.evolveum.com/xml/ns/public/common/common-3">
    <name>agente3</name>                    <!-- username para login -->
    <fullName>Agente Tres</fullName>        <!-- nombre visible -->
    <emailAddress>a3@email.com</emailAddress>
    <credentials>
        <password>
            <value>miPassword123</value>    <!-- contraseña para login -->
        </password>
    </credentials>
    <assignment>
        <targetRef oid="00000000-0000-0000-0000-000000000010" type="c:RoleType"/>
    </assignment>                           <!-- rol AgenteCallCenter -->
    <telephoneNumber>3007</telephoneNumber> <!-- extensión SIP -->
</user>
```

## Método 1: vía REST API (curl dentro del contenedor)

```bash
docker-compose exec midpoint bash -c '
curl -u administrator:5ecr3t \
  -X POST \
  -H "Content-Type: application/xml" \
  -H "Accept: application/xml" \
  -d '"'"'<?xml version="1.0" encoding="UTF-8"?>
<user xmlns="http://midpoint.evolveum.com/xml/ns/public/common/common-3"
      xmlns:c="http://midpoint.evolveum.com/xml/ns/public/common/common-3">
    <name>agente3</name>
    <fullName>Agente Tres</fullName>
    <emailAddress>a3@email.com</emailAddress>
    <credentials>
        <password>
            <value>miPassword123</value>
        </password>
    </credentials>
    <assignment>
        <targetRef oid="00000000-0000-0000-0000-000000000010" type="c:RoleType"/>
    </assignment>
    <telephoneNumber>3007</telephoneNumber>
</user>'"'"' \
  http://localhost:8080/midpoint/ws/rest/users
```

## Método 2: vía UI de midPoint

1. Ingresa a `http://localhost:8080/midpoint` (usuario: `administrator`, contraseña: `5ecr3t`)
2. Ve a **Users → New user**
3. Completa:
   - **Name**: `agente3` (username para login)
   - **Full name**: `Agente Tres`
   - **Email**: `a3@email.com`
   - **Telephone number**: `3007` (extensión SIP)
   - **Password**: `miPassword123`
4. En la pestaña **Assignments**, agrega el rol **AgenteCallCenter**
5. Guarda el usuario

## Flujo después de crearlo

1. El usuario existe en midPoint para autenticación (login valida contra `GET /ws/rest/users/self`)
2. En el WebPhone, ingresa con username (`agente3`) y password (`miPassword123`)
3. El auth-service:
   - Valida contra midPoint
   - Detecta el rol desde midPoint y lo sincroniza en la DB local
   - Auto-genera un `sipPassword` aleatorio y lo guarda en la tabla `users`
   - Devuelve el JWT con la extensión SIP (`3007`)
4. El frontend registra automáticamente la extensión SIP con el `sipPassword` generado

> **Nota:** Los roles en midPoint ya no incluyen inducción a recursos DB
> (el conector DatabaseTable no puede descubrir el schema de PostgreSQL).
> midPoint se usa exclusivamente para autenticación y RBAC.
> La tabla `users` se mantiene desde `init.sql` (seed) y `register()` del auth-service.
