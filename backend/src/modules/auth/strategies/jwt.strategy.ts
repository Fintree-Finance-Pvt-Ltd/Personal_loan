import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

interface AccessClaims {
  sub: string;
  sid: string;
  type: string;
  authVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      issuer: config.getOrThrow<string>('JWT_ISSUER'),
      audience: config.getOrThrow<string>('JWT_AUDIENCE'),
    });
  }

  async validate(payload: AccessClaims) {
    if (payload.type !== 'access' || !payload.sub || !payload.sid) throw new UnauthorizedException();
    const now = new Date();
    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        absoluteExpiresAt: { gt: now },
        idleExpiresAt: { gt: now },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            authVersion: true,
            roles: {
              where: { role: { status: 'ACTIVE' } },
              select: {
                role: {
                  select: {
                    code: true,
                    permissions: { select: { permission: { select: { code: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!session || session.user.status !== 'ACTIVE' || session.user.authVersion !== payload.authVersion) {
      throw new UnauthorizedException();
    }
    return {
      userId: session.user.id,
      sessionId: session.id,
      authVersion: session.user.authVersion,
      name: session.user.name,
      email: session.user.email,
      roleCodes: session.user.roles.map(({ role }) => role.code),
      permissionCodes: [
        ...new Set(
          session.user.roles.flatMap(({ role }) =>
            role.permissions.map(({ permission }) => permission.code),
          ),
        ),
      ],
    };
  }
}
