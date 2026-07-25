import { Controller, Get, Post, Patch, Put, Body, Param, Query, Req, BadRequestException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';
import type { Request } from 'express';
import { EmptyBodyDto } from '../../common/types/empty-body.dto';
import {
  createRoleSchema,
  replaceRolePermissionsSchema,
  roleIdSchema,
  roleQuerySchema,
  updateRoleSchema
} from './roles.validation';

@Controller('admin/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Permissions('ROLE_READ')
  @Get()
  async list(@Query() query: unknown) {
    const parsed = roleQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid query parameters.' } });
    }
    return this.roles.getRoles(parsed.data);
  }

  @Permissions('ROLE_READ')
  @Get(':roleId')
  async getDetails(@Param() params: unknown) {
    const parsed = roleIdSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid role ID parameter.' } });
    }
    return this.roles.getRole(parsed.data.roleId);
  }

  @Permissions('ROLE_CREATE')
  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: parsed.error.errors.map(e => e.message).join('; ') } });
    }
    return this.roles.createRole(parsed.data, this.context(user, request));
  }

  @Permissions('ROLE_UPDATE')
  @Patch(':roleId')
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsedParams = roleIdSchema.safeParse(params);
    if (!parsedParams.success) throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid role ID parameter.' } });
    
    const parsedBody = updateRoleSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: parsedBody.error.errors.map(e => e.message).join('; ') } });
    }
    return this.roles.updateRole(parsedParams.data.roleId, parsedBody.data, this.context(user, request));
  }

  @Permissions('ROLE_UPDATE', 'PERMISSION_READ')
  @Put(':roleId/permissions')
  async replacePermissions(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsedParams = roleIdSchema.safeParse(params);
    if (!parsedParams.success) throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid role ID parameter.' } });
    
    const parsedBody = replaceRolePermissionsSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid permissions payload.' } });
    }
    return this.roles.replacePermissions(parsedParams.data.roleId, parsedBody.data, this.context(user, request));
  }

  @Permissions('ROLE_UPDATE')
  @Post(':roleId/activate')
  async activate(
    @Param() params: unknown,
    @Body() _body: EmptyBodyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsedParams = roleIdSchema.safeParse(params);
    if (!parsedParams.success) throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid role ID parameter.' } });
    return this.roles.activateRole(parsedParams.data.roleId, this.context(user, request));
  }

  @Permissions('ROLE_UPDATE')
  @Post(':roleId/deactivate')
  async deactivate(
    @Param() params: unknown,
    @Body() _body: EmptyBodyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsedParams = roleIdSchema.safeParse(params);
    if (!parsedParams.success) throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid role ID parameter.' } });
    return this.roles.deactivateRole(parsedParams.data.roleId, this.context(user, request));
  }

  private context(user: AuthenticatedUser, request: Request) {
    return {
      actorUserId: user.userId,
      actorRoleCodes: user.roleCodes,
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };
  }
}
