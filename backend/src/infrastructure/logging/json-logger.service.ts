import { Injectable, LoggerService } from '@nestjs/common';
import { redactForLog } from '../../common/utils/security.utils';

@Injectable()
export class JsonLoggerService implements LoggerService {
  private write(level: string, message: unknown, context?: string): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: typeof message === 'string' ? message : redactForLog(message),
    };
    const serialized = JSON.stringify(entry);
    if (level === 'error') process.stderr.write(`${serialized}\n`);
    else process.stdout.write(`${serialized}\n`);
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', { message, trace: trace || undefined }, context);
  }
  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string): void {
    if (process.env.LOG_LEVEL === 'debug') this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string): void {
    this.debug(message, context);
  }
}
