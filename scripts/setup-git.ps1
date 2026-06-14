# setup-git.ps1 - Inicializa el repositorio Git con estructura de ramas
# Ejecutar desde la raíz del proyecto

# 1. Inicializar repositorio
git init

# 2. Crear rama principal
git checkout -b main

# 3. Crear ramas por feature (para el equipo de 4 integrantes)
git branch feature/db-setup
git branch feature/asterisk-config
git branch feature/midpoint-integracion
git branch feature/security-tls
git branch feature/load-testing
git branch feature/documentacion

# 4. Hacer commit inicial
git add .
git commit -m "feat: initial project structure

- Docker Compose with MariaDB, midPoint, Asterisk
- Asterisk config (PJSIP, extensions, CDR)
- midPoint Scripted SQL resource for provisioning
- DB init schema (users, CDR, audit_log)
- Test scenarios (SIPp, Trivy, TLS check)
- Documentation (architecture, ISO compliance)
- Git branching model

Co-authored-by: Equipo Laboratorio"

# 5. Mostrar instrucciones
Write-Host ""
Write-Host "=== Repositorio inicializado ==="
Write-Host "Ramas creadas:"
git branch --list
Write-Host ""
Write-Host "Próximos pasos:"
Write-Host "  1. Crear repositorio en GitHub"
Write-Host "  2. git remote add origin <repo-url>"
Write-Host "  3. git push -u origin main --all"
Write-Host "  4. Crear tablero Kanban en GitHub Projects"
Write-Host ""
Write-Host "Asignación sugerida de ramas por integrante:"
Write-Host "  Integrante 1 (PO): feature/documentacion, Kanban"
Write-Host "  Integrante 2 (DevOps): feature/db-setup, feature/asterisk-config"
Write-Host "  Integrante 3 (DevOps): feature/midpoint-integracion"
Write-Host "  Integrante 4 (QA): feature/security-tls, feature/load-testing"
