# User Stories - CallCenter Integration

## Épica 1: Infraestructura Base

| ID | Como... | Quiero... | Para... | Prioridad | Fase |
|----|---------|-----------|---------|-----------|------|
| US-001 | DevOps | tener Docker Compose con PostgreSQL, midPoint y Asterisk | que el entorno se levante con un solo comando | Alta | 1 |
| US-002 | DevOps | que los contenedores se comuniquen en una red aislada | evitar accesos no autorizados entre servicios | Alta | 1 |
| US-003 | Admin | que la BD inicialice con el esquema de usuarios, CDR y auditoría | tener la estructura de datos lista al arrancar | Alta | 1 |

## Épica 2: Gestión de Identidad (midPoint)

| ID | Como... | Quiero... | Para... | Prioridad | Fase |
|----|---------|-----------|---------|-----------|------|
| US-004 | Admin | importar usuarios seed y roles en midPoint via REST API | tener identidades para autenticación | Alta | 2 |
| US-005 | Admin | que midPoint sincronice usuarios con rol AgenteCallCenter | que automaticamente se creen extensiones SIP | Alta | 3 |
| US-006 | Admin | que midPoint audite quién accedió a qué extensión | cumplir ISO 27001 A.8.16 | Alta | 4 |

## Épica 3: Central Telefónica (Asterisk)

| ID | Como... | Quiero... | Para... | Prioridad | Fase |
|----|---------|-----------|---------|-----------|------|
| US-007 | Agente | registrarme con mi extensión y contraseña | recibir y hacer llamadas | Alta | 2 |
| US-008 | Agente | llamar a otro agente marcando su extensión | comunicarme con el equipo | Alta | 2 |
| US-009 | Supervisor | que las llamadas queden registradas con detalle | revisar CDRs posteriormente | Alta | 3 |
| US-010 | Admin | que el tráfico SIP vaya cifrado con TLS | proteger las comunicaciones | Media | 4 |

## Épica 4: Seguridad y Cumplimiento

| ID | Como... | Quiero... | Para... | Prioridad | Fase |
|----|---------|-----------|---------|-----------|------|
| US-011 | Auditor | verificar que las contraseñas no viajan en texto plano en logs | cumplir ISO 27001 | Alta | 4 |
| US-012 | Auditor | ejecutar un escaneo de vulnerabilidades en las imágenes Docker | identificar CVEs conocidos | Alta | 4 |
| US-013 | QA | simular 10 llamadas concurrentes | validar capacidad del sistema | Media | 4 |

## Épica 5: Documentación y Entrega

| ID | Como... | Quiero... | Para... | Prioridad | Fase |
|----|---------|-----------|---------|-----------|------|
| US-014 | Equipo | tener un tablero Kanban con el progreso | visualizar el avance del proyecto | Alta | 1 |
| US-015 | Equipo | que cada integrante trabaje en su rama de Git | evitar conflictos y tener trazabilidad | Alta | 1 |
| US-016 | Profesor | un video de 2-3 min mostrando una llamada exitosa | evaluar el prototipo funcional | Alta | 5 |
