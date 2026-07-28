import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { z } from 'zod';
import {
  createPlatformProductSchema,
  updatePlatformProductSchema,
  platformProductQuerySchema,
} from './platform-products.validation';
import { PlatformProductStatus, Prisma } from '@prisma/client';

type AuthContext = {
  actorUserId: string;
  actorRoleCodes: string[];
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class PlatformProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
  ) {}

  private async auditLog(action: string, productId: string, outcome: 'SUCCESS' | 'FAILURE', previousValue: any, newValue: any, context: AuthContext) {
    await this.audit.record({
      action,
      actorUserId: context.actorUserId,
      actorRoleCodes: context.actorRoleCodes,
      module: 'PLATFORM_PRODUCT',
      entityType: 'PlatformProduct',
      entityId: productId,
      outcome,
      previousValue,
      newValue,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async getPlatformProducts(query: z.infer<typeof platformProductQuerySchema>) {
    const where: Prisma.PlatformProductWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    return this.prisma.platformProduct.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPlatformProduct(id: string) {
    const product = await this.prisma.platformProduct.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Platform Product not found' } });
    }
    return product;
  }

  async createPlatformProduct(input: z.infer<typeof createPlatformProductSchema>, ctx: AuthContext) {
    const existing = await this.prisma.platformProduct.findUnique({
      where: { code: input.code },
    });
    if (existing) {
      throw new ConflictException({ error: { code: 'CONFLICT', message: 'Platform Product code must be unique' } });
    }

    const product = await this.prisma.platformProduct.create({
      data: {
        name: input.name,
        code: input.code,
        description: input.description,
        createdById: ctx.actorUserId,
        updatedById: ctx.actorUserId,
      },
    });

    await this.auditLog('CREATE_PLATFORM_PRODUCT', product.id, 'SUCCESS', null, product, ctx);
    return product;
  }

  async updatePlatformProduct(id: string, input: z.infer<typeof updatePlatformProductSchema>, ctx: AuthContext) {
    const product = await this.getPlatformProduct(id);
    
    const updated = await this.prisma.platformProduct.update({
      where: { id },
      data: {
        ...input,
        updatedById: ctx.actorUserId,
      },
    });

    await this.auditLog('UPDATE_PLATFORM_PRODUCT', id, 'SUCCESS', product, updated, ctx);
    return updated;
  }

  async activatePlatformProduct(id: string, ctx: AuthContext) {
    const product = await this.getPlatformProduct(id);
    
    if (product.status === PlatformProductStatus.ACTIVE) {
      return product;
    }

    const updated = await this.prisma.platformProduct.update({
      where: { id },
      data: {
        status: PlatformProductStatus.ACTIVE,
        updatedById: ctx.actorUserId,
      },
    });

    await this.auditLog('ACTIVATE_PLATFORM_PRODUCT', id, 'SUCCESS', product, updated, ctx);
    return updated;
  }

  async deactivatePlatformProduct(id: string, ctx: AuthContext) {
    const product = await this.getPlatformProduct(id);
    
    if (product.status === PlatformProductStatus.INACTIVE) {
      return product;
    }

    const updated = await this.prisma.platformProduct.update({
      where: { id },
      data: {
        status: PlatformProductStatus.INACTIVE,
        updatedById: ctx.actorUserId,
      },
    });

    await this.auditLog('DEACTIVATE_PLATFORM_PRODUCT', id, 'SUCCESS', product, updated, ctx);
    return updated;
  }
}
