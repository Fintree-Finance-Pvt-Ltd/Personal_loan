import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { createHmac } from 'crypto';
import * as request from 'supertest';
import { createThrottlerOptions } from './throttler.config';

const SECRET = 's'.repeat(40);
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (sid: string, secret = SECRET) => {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sid, exp: Math.floor(Date.now() / 1000) + 600 });
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
};

@Controller('probe')
class ProbeController {
  @Get()
  ok() {
    return { ok: true };
  }
}

describe('app-wide rate limit (real HTTP, limit lowered to 3 for the test)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(createThrottlerOptions([SECRET], 3))],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const hit = (authorization?: string) => {
    const call = request(app.getHttpServer()).get('/probe');
    return (authorization ? call.set('Authorization', `Bearer ${authorization}`) : call).then((res) => res.status);
  };

  it('counts each signed-in user separately even though they share one IP address', async () => {
    const results: number[] = [];
    for (let i = 0; i < 4; i += 1) results.push(await hit(token('session-A')));
    expect(results).toEqual([200, 200, 200, 429]);

    // A different user behind the same IP is unaffected by session-A having hit its limit.
    expect(await hit(token('session-B'))).toBe(200);
  });

  it('still counts anonymous requests per IP', async () => {
    const results: number[] = [];
    for (let i = 0; i < 4; i += 1) results.push(await hit());
    expect(results).toEqual([200, 200, 200, 429]);
  });

  it('does not let a forged token escape the per-IP limit (the anonymous bucket is already spent)', async () => {
    // Different made-up sessions signed with the wrong secret: each is treated as anonymous.
    expect(await hit(token('forged-1', 'w'.repeat(40)))).toBe(429);
    expect(await hit(token('forged-2', 'w'.repeat(40)))).toBe(429);
  });
});
