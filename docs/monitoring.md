# Monitoreo — Prometheus + Grafana

## Arquitectura de Monitoreo

```
┌─────────────────────────────────────────────────────────────────────┐
│                       callcenter-net                                │
│                                                                     │
│  ┌──────────────┐    scrape /metrics    ┌──────────────────┐        │
│  │  api-gateway  │─────────────────────►│   Prometheus      │        │
│  │  :3001        │  http_requests_total  │   :9090           │        │
│  │  (metrics)    │  http_request_duration│                    │        │
│  └──────────────┘  microservice_*       │                    │        │
│                     calls_processed     │                    │        │
│                     auth_failures       │                    │        │
│                     active_sessions     │                    │        │
│                     default metrics     │                    │        │
│                                         │                    │        │
│  ┌──────────────┐    scrape :9187       │                    │        │
│  │  postgres-    │─────────────────────►│                    │        │
│  │  exporter     │  pg_stat_database_*  │                    │        │
│  └──────────────┘                       └────────┬───────────┘        │
│                                                  │                    │
│                                                  ▼                    │
│                                         ┌──────────────────┐         │
│                                         │   Grafana         │         │
│                                         │   :3006           │         │
│                                         │   dashboards:     │         │
│                                         │   SLO Dashboard   │         │
│                                         └──────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
```

## Métricas Instrumentadas

Todas las métricas se instrumentan desde el **API Gateway** (`api-gateway:3001`) vía `prom-client`, excepto las de PostgreSQL que vienen del `postgres-exporter`.

### 1. Las 4 Señales Doradas (Obligatorias)

| Métrica | Tipo | Labels | Dónde se genera |
|---------|------|--------|----------------|
| `http_requests_total` | Counter | `method`, `path`, `status_code` | MetricsInterceptor (gateway) |
| `http_request_duration_seconds` | Histogram | `method`, `path`, `status_code` | MetricsInterceptor (gateway) |
| `http_requests_in_flight` | Gauge | `method` | MetricsInterceptor (gateway) |
| `process_resident_memory_bytes` | Gauge (default) | — | prom-client default metrics |
| `process_cpu_seconds_total` | Counter (default) | — | prom-client default metrics |

> La **tasa de errores** se deriva en las queries de Grafana con `http_requests_total{status_code=~"5.."}` y `{status_code=~"4.."}`.

### 2. Salud Interna del Runtime (Node.js)

| Métrica | Tipo | Dónde se genera |
|---------|------|----------------|
| `nodejs_heap_size_used_bytes` | Gauge | prom-client default |
| `nodejs_heap_size_total_bytes` | Gauge | prom-client default |
| `nodejs_eventloop_lag_seconds` | Gauge | prom-client default |
| `process_open_fds` | Gauge | prom-client default (solo Linux) |

### 3. Dependencias Externas

| Métrica | Tipo | Labels | Dónde se genera |
|---------|------|--------|----------------|
| `pg_stat_database_numbackends` | Gauge | — | postgres-exporter |
| `microservice_request_duration_seconds` | Histogram | `service`, `operation` | AppController (gateway) |
| `microservice_errors_total` | Counter | `service`, `operation` | AppController (gateway) |

### 4. Métricas de Negocio (Call Center)

| Métrica | Tipo | Labels | Dónde se genera |
|---------|------|--------|----------------|
| `calls_processed_total` | Counter | `status` | AppController (endpoint CDR) |
| `auth_failures_total` | Counter | `reason` | AppController (login/register) |
| `active_sessions` | Gauge | — | AppController (login exitoso) |

### 5. Métricas Básicas

| Métrica | Tipo | Labels | Dónde se genera |
|---------|------|--------|----------------|
| `up` | Gauge | `job`, `instance` | Prometheus (built-in) |
| `app_build_info` | Gauge | `version`, `commit`, `environment` | MetricsService (gateway) |

## Alertas Configuradas (`monitoring/prometheus/alerts.yml`)

| Alerta | Condición | Severidad | Descripción |
|--------|-----------|-----------|-------------|
| `HighErrorRate` | `rate(5xx) / rate(total) > 5%` por 2m | critical | Tasa de error superior al 5% |
| `HighLatency` | P95 > 2s por 2m | warning | Latencia alta para el percentil 95 |
| `HighMemoryUsage` | RAM > 500MB por 5m | warning | Posible memory leak |
| `InstanceDown` | `up == 0` por 1m | critical | El servicio dejó de responder |
| `HighActiveConnections` | Conexiones DB > 80% del max por 5m | warning | Pool de conexiones near capacity |
| `HighInFlightRequests` | In-flight > 100 por 2m | warning | Peticiones concurrentes elevadas |

## Scrape Targets (Prometheus)

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alerts.yml"

scrape_configs:
  - job_name: 'api-gateway'
    static_configs:
      - targets: ['api-gateway:3001']

  - job_name: 'postgres'
    static_configs:
      - targets: ['db:9187']
```

## Dashboard de Grafana

El dashboard `SLO Dashboard` se carga automáticamente vía provisioning desde `monitoring/grafana/dashboards/slo-dashboard.json`.

### Paneles del Dashboard

| # | Panel | Métrica(s) | Estado |
|---|-------|------------|--------|
| 1 | Tráfico — RPS | `rate(http_requests_total[5m])` por method + status | ✅ Datos desde gateway |
| 2 | Latencia — Percentiles | p50, p95, p99 de `http_request_duration_seconds` | ✅ Datos desde gateway |
| 3 | Tasa de Errores | `rate(5xx)/rate(total)`, `rate(4xx)/rate(total)` | ✅ Datos desde gateway |
| 4 | Memoria RAM | `process_resident_memory_bytes` | ✅ prom-client default |
| 4b | CPU | `rate(process_cpu_seconds_total[1m])` | ✅ prom-client default |
| 5 | Heap Memory | `nodejs_heap_size_used_bytes / total_bytes` | ✅ prom-client default |
| 6 | Event Loop Lag | `nodejs_eventloop_lag_seconds` | ✅ prom-client default |
| 7 | Open File Descriptors | `process_open_fds` | ⚠️ Solo Linux |
| 8 | Microservice Latency | P95 de `microservice_request_duration_seconds` | ✅ AppController |
| 9 | Microservice Errors | `rate(microservice_errors_total[5m])` | ✅ AppController |
| 10 | Calls Processed | `rate(calls_processed_total[5m])` | ✅ AppController (endpoints CDR) |
| 11 | Auth Failures | `rate(auth_failures_total[5m])` | ✅ AppController (login/register) |
| 12 | Active Sessions | `active_sessions` | ✅ AppController (login) |
| 13 | In-Flight Requests | `sum(http_requests_in_flight)` | ✅ MetricsInterceptor |
| 14 | Up / Build Info | `up{job="api-gateway"}`, `app_build_info` | ✅ Prometheus + gateway |
| 15 | DB Conexiones | `pg_stat_database_numbackends` | ✅ postgres-exporter |

## Regla de Oro — Cardinalidad

Para evitar saturar Prometheus:

- **Nunca** usar IDs de usuarios, emails o IPs como labels
- Las URLs se normalizan automáticamente: `/api/user/123` → `/api/user/{id}`
- Histogramas en vez de Summary para latencias (permiten agregar percentiles entre instancias)
- Buckets balanceados para latencia HTTP: `[0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10]`

## Acceso

| Servicio | URL | Credenciales |
|----------|-----|-------------|
| Prometheus | `http://localhost:9090` | — |
| Grafana | `http://localhost:3006` | admin / grafana |
