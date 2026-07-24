import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JsonLoggerService } from '../../infrastructure/logging/json-logger.service';

const STATUS_CODES: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'NOT_AUTHENTICATED',
  403: 'NOT_AUTHORIZED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  423: 'ACCOUNT_TEMPORARILY_LOCKED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttp ? exception.getResponse() : null;
    const structured = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const explicitError =
      typeof structured.error === 'object' && structured.error
        ? (structured.error as Record<string, unknown>)
        : undefined;
    const validationMessage = Array.isArray(structured.message) ? structured.message.join('; ') : undefined;
    const message =
      (typeof explicitError?.message === 'string' && explicitError.message) ||
      validationMessage ||
      (status >= 500 ? 'An unexpected error occurred.' : 'The request could not be completed.');
    const code =
      (typeof explicitError?.code === 'string' && explicitError.code) ||
      STATUS_CODES[status] ||
      'REQUEST_FAILED';

    if (status >= 500) {
      this.logger.error(
        { event: 'unhandled_exception', requestId: request.requestId, status },
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    response.status(status).json({
      success: false,
      error: { code, message },
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
