import { HttpStatus } from '@nestjs/common';
import { of } from 'rxjs';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { LoggingInterceptor } from '../interceptors/logging.interceptor';
import { reportException, resetErrorReporterForTests } from './error-reporter';

describe('slow request logging', () => {
  const run = (durationMs: number) => {
    const logger: any = { log: jest.fn(), warn: jest.fn() };
    const interceptor = new LoggingInterceptor(logger);
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'r1', method: 'GET', route: { path: '/customer/me' }, path: '/customer/me' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    };
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValueOnce(1_000).mockReturnValueOnce(1_000 + durationMs);
    interceptor.intercept(context, { handle: () => of('ok') } as any).subscribe();
    now.mockRestore();
    return logger;
  };

  afterEach(() => {
    delete process.env.SLOW_REQUEST_MS;
  });

  it('logs an ordinary request at info level, unchanged', () => {
    const logger = run(120);
    expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({ event: 'http_request', durationMs: 120 }));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs a request over the threshold as a warning flagged slow', () => {
    const logger = run(2500);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'http_request', slow: true, durationMs: 2500 }));
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('honours SLOW_REQUEST_MS', () => {
    process.env.SLOW_REQUEST_MS = '100';
    expect(run(150).warn).toHaveBeenCalled();
  });
});

describe('exception filter observability', () => {
  const invoke = (exception: unknown) => {
    const logger: any = { error: jest.fn(), warn: jest.fn() };
    const response: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host: any = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'r1', method: 'GET', route: { path: '/x' }, path: '/x' }),
        getResponse: () => response,
      }),
    };
    new HttpExceptionFilter(logger).catch(exception, host);
    return { logger, response };
  };

  it('still logs an unexpected (non-HTTP) exception as an error and answers 500', () => {
    const { logger, response } = invoke(new Error('database exploded'));
    expect(response.status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'unhandled_exception', errorMessage: 'database exploded' }), expect.anything());
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns "rate_limited" for a real 429 HttpException', () => {
    const { HttpException } = jest.requireActual('@nestjs/common');
    const { logger, response } = invoke(new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS));
    expect(response.status).toHaveBeenCalledWith(429);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'rate_limited', route: '/x' }));
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('optional error reporter', () => {
  beforeEach(() => {
    resetErrorReporterForTests();
    delete process.env.SENTRY_DSN;
  });

  it('is a silent no-op without a DSN', () => {
    expect(() => reportException(new Error('boom'))).not.toThrow();
  });

  it('never throws when a DSN is set but the package is not installed', () => {
    process.env.SENTRY_DSN = 'https://public@example.invalid/1';
    expect(() => reportException(new Error('boom'))).not.toThrow();
    expect(() => reportException(new Error('boom again'))).not.toThrow();
  });
});
