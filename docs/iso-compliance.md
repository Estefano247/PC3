# ISO 27001 & ISO 25010 Compliance Matrix

## ISO 27001 Controls Mapping

| Control | Description | Component | Implementation |
|---------|-------------|-----------|----------------|
| **A.5.1.1** | Information security policy | All | Security policies defined in README and deployment scripts |
| **A.6.1.2** | Segregation of duties | Git / Kanban | Branch protection rules, 4 team members, PR reviews |
| **A.8.1.1** | Inventory of assets | Docker Compose | All services declared in docker-compose.yml with versioning |
| **A.8.2.1** | Classification of information | midPoint | Roles (AgenteCallCenter, Supervisor, Admin) with RBAC |
| **A.8.2.3** | Handling of assets | Backend NestJS | Automated provisioning/deprovisioning via API (asterisk-svc) |
| **A.8.16** | Monitoring activities | midPoint / Audit Log | `audit_log` table in PostgreSQL records who logged in and accessed which extension |
| **A.9.1.2** | Access to networks | Docker networks | Isolated `callcenter-net` bridge network (172.20.0.0/16) |
| **A.9.2.1** | User registration & de-registration | midPoint | Identity lifecycle management via DatabaseTable Connector (Live Sync) |
| **A.9.2.2** | User access provisioning | midPoint → Asterisk | Automatic SIP extension provisioning via object template mappings |
| **A.9.2.4** | Management of secret authentication info | Docker secrets / .env | SIP passwords stored in env vars, not in code |
| **A.9.4.2** | Secure log-on procedures | midPoint / SIP digest | Authentication required for midPoint UI and SIP registration |
| **A.10.1.1** | Policy on use of cryptographic controls | SSH / Docker | Provisioning via SSH with key-based auth; internal network isolation |
| **A.12.4.1** | Event logging | Asterisk CDR / Audit | CDR in PostgreSQL + `audit_log` table for traceability |
| **A.12.6.1** | Management of technical vulnerabilities | Trivy | `trivy-scan.sh` scans Docker images for CVEs |
| **A.13.1.1** | Network controls | Docker + Firewall | Internal bridge network, exposed ports limited to required ones |
| **A.13.2.1** | Information transfer policies | Internal network | All database connections internal to Docker bridge network |

## ISO 25010 Quality Metrics

| Characteristic | Sub-characteristic | How Measured | Tool / Method |
|---------------|-------------------|-------------|---------------|
| **Functional Suitability** | Functional completeness | User creates → extension provisioned | Integration test (midPoint → Asterisk) |
| **Reliability** | Availability | Containers restart=unless-stopped | docker-compose ps, uptime checks |
| | Recoverability | Volume persistence (db-data, midpoint-data) | Restart test: docker-compose down && up |
| **Security** | Confidentiality | Network isolation (Docker bridge), SSH with keys | Network scan, log inspection |
| | Integrity | midPoint as source of truth | Reconciliation sync |
| | Non-repudiation | audit_log table | SELECT * FROM audit_log |
| **Maintainability** | Modularity | Microservices architecture | Docker Compose services |
| | Reusability | Scripts and configs versioned | Git tags, semantic versioning |
| | Testability | Automated tests | Unit tests (mappings), integration tests (API), load tests (sipp) |
| **Compatibility** | Interoperability | midPoint ↔ Asterisk ↔ PostgreSQL | Cross-container communication tests |
| **Performance Efficiency** | Time behavior | Call setup time | CDR duration/billsec fields |
| | Capacity | 10 concurrent calls | SIPp load test results |
