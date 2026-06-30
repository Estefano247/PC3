import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError, finalize } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { MetricsService } from './metrics.service';

const PATH_PARAM_PATTERN = /\/\d+/g;

function normalizePath(path: string): string {
  if (path === '/metrics') return '/metrics';
  return path.replace(PATH_PARAM_PATTERN, '/{id}').replace(/\/\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g, '/{uuid}');
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const path = normalizePath(request.route?.path || request.url);

    this.metrics.httpRequestInFlight.inc({ method });

    const startTime = performance.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode;
        const duration = (performance.now() - startTime) / 1000;

        this.metrics.httpRequestTotal.inc({ method, path, status_code: statusCode.toString() });
        this.metrics.httpRequestDuration.observe({ method, path, status_code: statusCode.toString() }, duration);
      }),
      catchError((err) => {
        const response = context.switchToHttp().getResponse();
        const statusCode = err?.status || response?.statusCode || 500;
        const duration = (performance.now() - startTime) / 1000;

        this.metrics.httpRequestTotal.inc({ method, path, status_code: statusCode.toString() });
        this.metrics.httpRequestDuration.observe({ method, path, status_code: statusCode.toString() }, duration);

        return throwError(() => err);
      }),
      finalize(() => {
        this.metrics.httpRequestInFlight.dec({ method });
      }),
    );
  }
}
