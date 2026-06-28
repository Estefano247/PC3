Para crear un usuario en midPoint y usarlo en el callcenter, estos son los campos necesarios:
XML del usuario en midPoint:
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
Flujo después de crearlo:
1. El rol AgenteCallCenter induce la creación de una cuenta en la BD (users), mapeando telephoneNumber → sip_extension y name → username
2. En el WebPhone, el usuario ingresa con username (agente3) y password (miPassword123)
3. El auth service valida contra midPoint, y si es correcto:
- Auto-genera un sipPassword aleatorio y lo guarda en la BD
- Crea un passwordHash (bcrypt) como fallback local
- Devuelve el JWT con la extensión SIP (3007)
4. El frontend registra automáticamente la extensión SIP con el sipPassword generado
Prueba: Después de crear el usuario en midPoint (vía API o interfaz web en http://localhost:8080/midpoint), simplemente ingresa en el WebPhone con agente3 / miPassword123 y el sistema vincula todo automáticamente.