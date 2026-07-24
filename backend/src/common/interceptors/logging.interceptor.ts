import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { JsonLoggerService } from '../../infrastructure/logging/json-logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: JsonLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      finalize(() =>
        this.logger.log({
          event: 'http_request',
          requestId: request.requestId,
          method: request.method,
          route: request.route?.path ?? request.path,
          status: response.statusCode,
          durationMs: Date.now() - started,
        }),
      ),
    );
  }
}
