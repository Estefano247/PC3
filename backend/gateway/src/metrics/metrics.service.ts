import { Injectable, Logger } from '@nestjs/common';
import * as promClient from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private register: promClient.Registry;

  public httpRequestTotal: promClient.Counter<string>;
  public httpRequestDuration: promClient.Histogram<string>;
  public httpRequestInFlight: promClient.Gauge<string>;

  public callsProcessedTotal: promClient.Counter<string>;
  public authFailuresTotal: promClient.Counter<string>;
  public activeSessions: promClient.Gauge<string>;

  public microserviceRequestDuration: promClient.Histogram<string>;
  public microserviceErrorsTotal: promClient.Counter<string>;

  public appBuildInfo: promClient.Gauge<string>;

  constructor() {
    this.register = new promClient.Registry();
    promClient.collectDefaultMetrics({ register: this.register });

    this.httpRequestTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status_code'],
      registers: [this.register],
    });

    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
      registers: [this.register],
    });

    this.httpRequestInFlight = new promClient.Gauge({
      name: 'http_requests_in_flight',
      help: 'Current number of HTTP requests being processed',
      labelNames: ['method'],
      registers: [this.register],
    });

    this.callsProcessedTotal = new promClient.Counter({
      name: 'calls_processed_total',
      help: 'Total number of calls processed',
      labelNames: ['status'],
      registers: [this.register],
    });

    this.authFailuresTotal = new promClient.Counter({
      name: 'auth_failures_total',
      help: 'Total number of authentication failures',
      labelNames: ['reason'],
      registers: [this.register],
    });

    this.activeSessions = new promClient.Gauge({
      name: 'active_sessions',
      help: 'Current number of active user sessions',
      labelNames: [],
      registers: [this.register],
    });
    this.activeSessions.set(0);

    this.microserviceRequestDuration = new promClient.Histogram({
      name: 'microservice_request_duration_seconds',
      help: 'Duration of requests to internal microservices',
      labelNames: ['service', 'operation'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
      registers: [this.register],
    });

    this.microserviceErrorsTotal = new promClient.Counter({
      name: 'microservice_errors_total',
      help: 'Total number of errors from internal microservices',
      labelNames: ['service', 'operation'],
      registers: [this.register],
    });

    this.appBuildInfo = new promClient.Gauge({
      name: 'app_build_info',
      help: 'Build information for the application',
      labelNames: ['version', 'commit', 'environment'],
      registers: [this.register],
    });

    this.appBuildInfo.set({ version: '1.0.0', commit: 'unknown', environment: process.env.NODE_ENV || 'development' }, 1);
  }

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  getContentType(): string {
    return this.register.contentType;
  }
}
