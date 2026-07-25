import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface GetPermissionsQuery {
  search?: string;
  module?: string;
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissions(query: GetPermissionsQuery) {
    const where: Prisma.PermissionWhereInput = {};
    if (query.module) {
      where.module = query.module;
    }
    if (query.search) {
      where.OR = [
        { code: { contains: query.search } },
        { description: { contains: query.search } },
        { module: { contains: query.search } },
      ];
    }

    const items = await this.prisma.permission.findMany({
      where,
      orderBy: [
        { module: 'asc' },
        { code: 'asc' },
      ],
      select: {
        id: true,
        code: true,
        module: true,
        description: true,
        createdAt: true,
      },
    });

    return { items };
  }
}
