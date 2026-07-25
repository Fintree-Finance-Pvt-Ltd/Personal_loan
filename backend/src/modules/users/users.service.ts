import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SecurityEventsService } from '../security-events/security-events.service';
import { AuthService } from '../auth/auth.service';
import { Prisma, UserStatus } from '@prisma/client';
import { validatePasswordStrength } from '../../common/utils/password.utils';
import {
  CreateUserDto,
  ReplaceUserRolesDto,
  UpdateUserDto,
  UserQuery,
} from './users.validation';

interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  actorUserId?: string;
  actorRoleCodes?: string[];
}

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  failedLoginCount: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: { select: { id: true, code: true, name: true, status: true } },
      assignedAt: true,
    },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
    private readonly securityEvents: SecurityEventsService,
    private readonly authService: AuthService,
  ) {}

  async getUsers(query: UserQuery) {
    const where: Prisma.UserWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { email: { contains: query.search } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.roleCode) {
      where.roles = { some: { role: { code: query.roleCode } } };
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: SAFE_USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map(this.formatUser),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...SAFE_USER_SELECT,
        roles: {
          select: {
            role: {
              select: {
                id: true,
                code: true,
                name: true,
                status: true,
                permissions: { select: { permission: { select: { code: true } } } },
              },
            },
            assignedAt: true,
          },
        },
        _count: { select: { sessions: { where: { revokedAt: null } } } },
      },
    });

    if (!user) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
    }

    const effectivePermissions = [
      ...new Set<string>(
        user.roles.flatMap(({ role }) =>
          role.permissions.map(({ permission }) => permission.code),
        ),
      ),
    ];

    return {
      ...this.formatUser(user),
      effectivePermissions,
      activeSessionCount: user._count.sessions,
    };
  }

  async createUser(dto: CreateUserDto, context: RequestContext) {
    const errors = validatePasswordStrength(dto.password);
    if (errors.length > 0) {
      throw new BadRequestException({
        error: { code: 'INVALID_REQUEST', message: `Password ${errors.join(', ')}.` },
      });
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({ error: { code: 'CONFLICT', message: 'Email already in use.' } });
    }

    const uniqueRoleIds = [...new Set(dto.roleIds)];
    const roles = await this.prisma.role.findMany({
      where: { id: { in: uniqueRoleIds } },
      select: { id: true, code: true, status: true },
    });

    if (roles.length !== uniqueRoleIds.length) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'One or more role IDs are invalid.' } });
    }

    const inactiveRoles = roles.filter(r => r.status !== 'ACTIVE');
    if (inactiveRoles.length > 0) {
      throw new BadRequestException({
        error: { code: 'INVALID_REQUEST', message: 'All assigned roles must be ACTIVE.' },
      });
    }

    const passwordHash = await this.authService.hashPassword(dto.password);
    const now = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          status: dto.status,
          passwordChangedAt: now,
        },
        select: { id: true, name: true, email: true, status: true, createdAt: true },
      });

      await tx.userRole.createMany({
        data: uniqueRoleIds.map(roleId => ({
          userId: created.id,
          roleId,
          assignedBy: context.actorUserId,
        })),
      });

      return created;
    });

    await this.audit.record({
      actorUserId: context.actorUserId,
      actorRoleCodes: context.actorRoleCodes,
      permissionCode: 'USER_CREATE',
      module: 'USERS',
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: user.id,
      outcome: 'SUCCESS',
      newValue: { name: user.name, email: user.email, status: user.status, roleCodes: roles.map(r => r.code) },
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { id: user.id, name: user.name, email: user.email, status: user.status };
  }

  async updateUser(userId: string, dto: UpdateUserDto, context: RequestContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'User not found.' } });

    if (dto.email && dto.email !== user.email) {
      const conflict = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (conflict) {
        throw new ConflictException({ error: { code: 'CONFLICT', message: 'Email already in use.' } });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name, email: dto.email },
      select: { id: true, name: true, email: true, status: true },
    });

    await this.audit.record({
      actorUserId: context.actorUserId,
      actorRoleCodes: context.actorRoleCodes,
      permissionCode: 'USER_UPDATE',
      module: 'USERS',
      action: 'USER_UPDATED',
      entityType: 'USER',
      entityId: userId,
      outcome: 'SUCCESS',
      previousValue: { name: user.name, email: user.email },
      newValue: { name: updated.name, email: updated.email },
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return updated;
  }

  async replaceUserRoles(userId: string, dto: ReplaceUserRolesDto, context: RequestContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!user) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'User not found.' } });

    const uniqueRoleIds = [...new Set(dto.roleIds)];

    const roles = await this.prisma.role.findMany({
      where: { id: { in: uniqueRoleIds } },
      select: { id: true, code: true, status: true },
    });

    if (roles.length !== uniqueRoleIds.length) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'One or more role IDs are invalid.' } });
    }

    const inactiveRoles = roles.filter(r => r.status !== 'ACTIVE');
    if (inactiveRoles.length > 0) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'All assigned roles must be ACTIVE.' } });
    }

    // Prevent removing own SUPERADMIN role
    const actorIsSelf = context.actorUserId === userId;
    const hadSuperadmin = user.roles.some(ur => ur.role.code === 'SUPERADMIN');
    const newHasSuperadmin = roles.some(r => r.code === 'SUPERADMIN');

    if (actorIsSelf && hadSuperadmin && !newHasSuperadmin) {
      throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'You cannot remove your own SUPERADMIN role.' } });
    }

    // Protect last active SUPERADMIN
    if (hadSuperadmin && !newHasSuperadmin) {
      const superadminCount = await this.prisma.userRole.count({
        where: {
          role: { code: 'SUPERADMIN' },
          user: { status: 'ACTIVE' },
          userId: { not: userId },
        },
      });
      if (superadminCount === 0) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Cannot remove the last active SUPERADMIN role assignment.' } });
      }
    }

    const previousCodes = user.roles.map(ur => ur.role.code);
    const newCodes = roles.map(r => r.code);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: uniqueRoleIds.map(roleId => ({
          userId,
          roleId,
          assignedBy: context.actorUserId,
        })),
      });
      // Increment authVersion to invalidate existing tokens
      await tx.user.update({ where: { id: userId }, data: { authVersion: { increment: 1 } } });
      // Revoke all active sessions
      const sessions = await tx.session.findMany({
        where: { userId, revokedAt: null },
        select: { id: true },
      });
      if (sessions.length > 0) {
        const ids = sessions.map(s => s.id);
        await tx.session.updateMany({
          where: { id: { in: ids }, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'ROLES_CHANGED' },
        });
        await tx.refreshToken.updateMany({
          where: { sessionId: { in: ids }, revokedAt: null },
          data: { revokedAt: now },
        });
      }
    });

    await Promise.all([
      this.audit.record({
        actorUserId: context.actorUserId,
        actorRoleCodes: context.actorRoleCodes,
        permissionCode: 'ROLE_ASSIGN',
        module: 'USERS',
        action: 'USER_ROLES_REPLACED',
        entityType: 'USER',
        entityId: userId,
        outcome: 'SUCCESS',
        previousValue: { roleCodes: previousCodes },
        newValue: { roleCodes: newCodes },
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      }),
      this.securityEvents.record({
        userId,
        eventType: 'USER_ROLES_CHANGED',
        severity: 'MEDIUM',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { previousRoles: previousCodes, newRoles: newCodes },
      }),
    ]);

    return { success: true };
  }

  async activateUser(userId: string, context: RequestContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'User not found.' } });

    if (user.status === 'ACTIVE') return { success: true };

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ACTIVE,
        failedLoginCount: 0,
        lockedUntil: null,
        authVersion: { increment: 1 },
      },
    });

    await this.audit.record({
      actorUserId: context.actorUserId,
      actorRoleCodes: context.actorRoleCodes,
      permissionCode: 'USER_UPDATE',
      module: 'USERS',
      action: 'USER_ACTIVATED',
      entityType: 'USER',
      entityId: userId,
      outcome: 'SUCCESS',
      previousValue: { status: user.status },
      newValue: { status: 'ACTIVE' },
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { success: true };
  }

  async disableUser(userId: string, context: RequestContext) {
    if (context.actorUserId === userId) {
      throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'You cannot disable your own account.' } });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!user) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'User not found.' } });

    const isSuperadmin = user.roles.some(ur => ur.role.code === 'SUPERADMIN');
    if (isSuperadmin) {
      const activeCount = await this.prisma.user.count({
        where: {
          status: 'ACTIVE',
          id: { not: userId },
          roles: { some: { role: { code: 'SUPERADMIN' } } },
        },
      });
      if (activeCount === 0) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Cannot disable the last active SUPERADMIN.' } });
      }
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: UserStatus.DISABLED, authVersion: { increment: 1 } },
      });
      const sessions = await tx.session.findMany({
        where: { userId, revokedAt: null },
        select: { id: true },
      });
      if (sessions.length > 0) {
        const ids = sessions.map(s => s.id);
        await tx.session.updateMany({
          where: { id: { in: ids }, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'USER_DISABLED' },
        });
        await tx.refreshToken.updateMany({
          where: { sessionId: { in: ids }, revokedAt: null },
          data: { revokedAt: now },
        });
      }
    });

    await Promise.all([
      this.audit.record({
        actorUserId: context.actorUserId,
        actorRoleCodes: context.actorRoleCodes,
        permissionCode: 'USER_DISABLE',
        module: 'USERS',
        action: 'USER_DISABLED',
        entityType: 'USER',
        entityId: userId,
        outcome: 'SUCCESS',
        previousValue: { status: user.status },
        newValue: { status: 'DISABLED' },
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      }),
      this.securityEvents.record({
        userId,
        eventType: 'USER_DISABLED',
        severity: 'HIGH',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      }),
    ]);

    return { success: true };
  }

  async revokeUserSessions(userId: string, context: RequestContext) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'User not found.' } });

    const now = new Date();
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });

    const ids = sessions.map(s => s.id);
    let revokedCount = 0;

    if (ids.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.session.updateMany({
          where: { id: { in: ids }, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'ADMIN_REVOKED' },
        });
        await tx.refreshToken.updateMany({
          where: { sessionId: { in: ids }, revokedAt: null },
          data: { revokedAt: now },
        });
        revokedCount = result.count;
      });
    }

    await Promise.all([
      this.audit.record({
        actorUserId: context.actorUserId,
        actorRoleCodes: context.actorRoleCodes,
        permissionCode: 'SESSION_REVOKE_ALL',
        module: 'USERS',
        action: 'USER_SESSIONS_REVOKED',
        entityType: 'USER',
        entityId: userId,
        outcome: 'SUCCESS',
        newValue: { revokedCount },
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      }),
      this.securityEvents.record({
        userId,
        eventType: 'ALL_SESSIONS_REVOKED_BY_ADMIN',
        severity: 'HIGH',
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { revokedCount },
      }),
    ]);

    return { revokedCount };
  }

  private formatUser(user: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: user.roles.map((ur: any) => ({
        id: ur.role.id,
        code: ur.role.code,
        name: ur.role.name,
        status: ur.role.status,
        assignedAt: ur.assignedAt,
      })),
    };
  }
}
