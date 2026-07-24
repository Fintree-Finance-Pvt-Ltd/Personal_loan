import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { requestId: string }>();
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: data ?? null,
        requestId: request.requestId,
      })),
    );
  }
}
