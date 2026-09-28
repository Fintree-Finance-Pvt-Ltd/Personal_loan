import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { JsonLoggerService } from '../../infrastructure/logging/json-logger.service';

/** Read per call (not at import) so a value from the .env file is honoured. */
const slowRequestThresholdMs = (): number => {
  const configured = Number(process.env.SLOW_REQUEST_MS);
  return configured > 0 ? configured : 1500;
};

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: JsonLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      finalize(() => {
        const durationMs = Date.now() - started;
        const entry = {
          event: 'http_request',
          requestId: request.requestId,
          method: request.method,
          route: request.route?.path ?? request.path,
          status: response.statusCode,
          durationMs,
        };
        // Slow requests are logged as warnings (slow: true) so they can be picked out, and
        // alerted on, without parsing every line. Threshold: SLOW_REQUEST_MS (default 1500).
        if (durationMs >= slowRequestThresholdMs()) this.logger.warn({ ...entry, slow: true });
        else this.logger.log(entry);
      }),
    );
  }
}
