import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Prisma, RoleStatus } from '@prisma/client';
import { CreateRoleDto, ReplaceRolePermissionsDto, RoleQuery, UpdateRoleDto } from './roles.validation';

interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  actorUserId?: string;
  actorRoleCodes?: string[];
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
  ) {}

  async getRoles(query: RoleQuery) {
    const where: Prisma.RoleWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { code: { contains: query.search } },
        { description: { contains: query.search } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.isSystem !== undefined) {
      where.isSystem = query.isSystem;
    }

    const [items, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          _count: {
            select: { permissions: true, users: true },
          },
        },
      }),
      this.prisma.role.count({ where }),
    ]);

    return {
      items: items.map(r => ({
        id: r.id,
        name: r.name,
        code: r.code,
        description: r.description,
        status: r.status,
        isSystem: r.isSystem,
        permissionCount: r._count.permissions,
        assignedUserCount: r._count.users,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getRole(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    if (!role) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Role not found' } });
    }

    return {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      status: role.status,
      isSystem: role.isSystem,
      permissions: role.permissions.map(rp => rp.permission),
      assignedUserCount: role._count.users,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async createRole(dto: CreateRoleDto, context: RequestContext) {
    const existing = await this.prisma.role.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException({ error: { code: 'CONFLICT', message: 'Role code already exists.' } });
    }

    const uniquePermissionIds = [...new Set(dto.permissionIds)];
    if (uniquePermissionIds.length > 0) {
      const perms = await this.prisma.permission.findMany({
        where: { id: { in: uniquePermissionIds } },
        select: { id: true },
      });
      if (perms.length !== uniquePermissionIds.length) {
        throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'One or more permission IDs are invalid.' } });
      }
    }

    const role = await this.prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: {
          name: dto.name,
          code: dto.code,
          description: dto.description,
          status: dto.status,
          isSystem: false, // Frontend cannot set this
          permissions: {
            create: uniquePermissionIds.map(id => ({
              permission: { connect: { id } }
            })),
          },
        },
        include: { permissions: { include: { permission: true } } },
      });
      return r;
    });

    await this.audit.record({
      actorUserId: context.actorUserId,
      actorRoleCodes: context.actorRoleCodes,
      permissionCode: 'ROLE_CREATE',
      module: 'ROLES',
      action: 'ROLE_CREATED',
      entityType: 'ROLE',
      entityId: role.id,
      outcome: 'SUCCESS',
      newValue: { name: role.name, code: role.code, status: role.status, permissions: role.permissions.map(p => p.permission.code) },
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      status: role.status,
      isSystem: role.isSystem,
    };
  }

  async updateRole(roleId: string, dto: UpdateRoleDto, context: RequestContext) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Role not found' } });

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });

    await this.audit.record({
      actorUserId: context.actorUserId,
      actorRoleCodes: context.actorRoleCodes,
      permissionCode: 'ROLE_UPDATE',
      module: 'ROLES',
      action: 'ROLE_UPDATED',
      entityType: 'ROLE',
      entityId: role.id,
      outcome: 'SUCCESS',
      previousValue: { name: role.name, description: role.description },
      newValue: { name: updated.name, description: updated.description },
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      id: updated.id,
      name: updated.name,
      code: updated.code,
      description: updated.description,
      status: updated.status,
      isSystem: updated.isSystem,
    };
  }

  async replacePermissions(roleId: string, dto: ReplaceRolePermissionsDto, context: RequestContext) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Role not found' } });

    if (role.code === 'SUPERADMIN') {
      throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'SUPERADMIN permissions cannot be modified.' } });
    }

    const uniquePermissionIds = [...new Set(dto.permissionIds)];
    const perms = await this.prisma.permission.findMany({
      where: { id: { in: uniquePermissionIds } },
      select: { id: true, code: true },
    });
    
    if (perms.length !== uniquePermissionIds.length) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'One or more permission IDs are invalid.' } });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (uniquePermissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: uniquePermissionIds.map(id => ({ roleId, permissionId: id })),
        });
      }
    });

    const previousCodes = role.permissions.map(p => p.permission.code);
    const newCodes = perms.map(p => p.code);

    await this.audit.record({
      actorUserId: context.actorUserId,
      actorRoleCodes: context.actorRoleCodes,
      permissionCode: 'ROLE_UPDATE',
      module: 'ROLES',
      action: 'ROLE_PERMISSIONS_REPLACED',
      entityType: 'ROLE',
      entityId: role.id,
      outcome: 'SUCCESS',
      previousValue: { permissionCodes: previousCodes },
      newValue: { permissionCodes: newCodes },
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { success: true };
  }

  async activateRole(roleId: string, context: RequestContext) {
    return this.changeRoleStatus(roleId, RoleStatus.ACTIVE, 'ROLE_ACTIVATED', context);
  }

  async deactivateRole(roleId: string, context: RequestContext) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (role && role.code === 'SUPERADMIN') {
      throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'SUPERADMIN role cannot be deactivated.' } });
    }
    return this.changeRoleStatus(roleId, RoleStatus.INACTIVE, 'ROLE_DEACTIVATED', context);
  }

  private async changeRoleStatus(roleId: string, status: RoleStatus, action: string, context: RequestContext) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Role not found' } });
    
    if (role.status === status) return { success: true };

    await this.prisma.role.update({
      where: { id: roleId },
      data: { status },
    });

    await this.audit.record({
      actorUserId: context.actorUserId,
      actorRoleCodes: context.actorRoleCodes,
      permissionCode: 'ROLE_UPDATE',
      module: 'ROLES',
      action,
      entityType: 'ROLE',
      entityId: role.id,
      outcome: 'SUCCESS',
      previousValue: { status: role.status },
      newValue: { status },
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { success: true };
  }
}
