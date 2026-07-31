import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

interface CustomerAccessClaims {
  sub: string;
  sid: string;
  type: string;
}

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('CUSTOMER_JWT_ACCESS_SECRET'),
      issuer: config.getOrThrow<string>('JWT_ISSUER'),
      audience: 'personal-loan-customer',
    });
  }

  async validate(payload: CustomerAccessClaims) {
    if (payload.type !== 'customer-access' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid customer token format');
    }

    const now = new Date();
    
    // Validate session against DB
    const session = await this.prisma.customerSession.findFirst({
      where: {
        id: payload.sid,
        customerId: BigInt(payload.sub),
        revokedAt: null,
        absoluteExpiresAt: { gt: now },
        idleExpiresAt: { gt: now },
      },
      select: {
        id: true,
        customer: {
          select: {
            id: true,
            customerCode: true,
            accountStatus: true,
          }
        }
      }
    });

    if (!session || session.customer.accountStatus !== 'ACTIVE') {
      throw new UnauthorizedException('Customer session invalid or account inactive');
    }

    return {
      customerId: session.customer.id.toString(),
      customerCode: session.customer.customerCode,
      sessionId: session.id,
      audience: 'personal-loan-customer'
    };
  }
}
