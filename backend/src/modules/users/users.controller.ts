import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  Req,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';
import type { Request } from 'express';
import { EmptyBodyDto } from '../../common/types/empty-body.dto';
import {
  createUserSchema,
  replaceUserRolesSchema,
  updateUserSchema,
  userIdSchema,
  userQuerySchema,
} from './users.validation';

@Controller('admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Permissions('USER_READ')
  @Get()
  async list(@Query() query: unknown) {
    const parsed = userQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid query parameters.' } });
    }
    return this.users.getUsers(parsed.data);
  }

  @Permissions('USER_READ')
  @Get(':userId')
  async getDetails(@Param() params: unknown) {
    const parsed = userIdSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid user ID.' } });
    }
    return this.users.getUser(parsed.data.userId);
  }

  @Permissions('USER_CREATE')
  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: parsed.error.errors.map(e => e.message).join('; ') } });
    }
    return this.users.createUser(parsed.data, this.context(actor, request));
  }

  @Permissions('USER_UPDATE')
  @Patch(':userId')
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsedParams = userIdSchema.safeParse(params);
    if (!parsedParams.success) throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid user ID.' } });
    const parsedBody = updateUserSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: parsedBody.error.errors.map(e => e.message).join('; ') } });
    }
    return this.users.updateUser(parsedParams.data.userId, parsedBody.data, this.context(actor, request));
  }

  @Permissions('ROLE_ASSIGN')
  @Put(':userId/roles')
  async replaceRoles(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsedParams = userIdSchema.safeParse(params);
    if (!parsedParams.success) throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid user ID.' } });
    const parsedBody = replaceUserRolesSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid roles payload.' } });
    }
    return this.users.replaceUserRoles(parsedParams.data.userId, parsedBody.data, this.context(actor, request));
  }

  @Permissions('USER_UPDATE')
  @Post(':userId/activate')
  @HttpCode(200)
  async activate(
    @Param() params: unknown,
    @Body() _body: EmptyBodyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsed = userIdSchema.safeParse(params);
    if (!parsed.success) throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid user ID.' } });
    return this.users.activateUser(parsed.data.userId, this.context(actor, request));
  }

  @Permissions('USER_DISABLE')
  @Post(':userId/disable')
  @HttpCode(200)
  async disable(
    @Param() params: unknown,
    @Body() _body: EmptyBodyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsed = userIdSchema.safeParse(params);
    if (!parsed.success) throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid user ID.' } });
    return this.users.disableUser(parsed.data.userId, this.context(actor, request));
  }

  @Permissions('SESSION_REVOKE_ALL')
  @Post(':userId/revoke-sessions')
  @HttpCode(200)
  async revokeSessions(
    @Param() params: unknown,
    @Body() _body: EmptyBodyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsed = userIdSchema.safeParse(params);
    if (!parsed.success) throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid user ID.' } });
    return this.users.revokeUserSessions(parsed.data.userId, this.context(actor, request));
  }

  private context(actor: AuthenticatedUser, request: Request) {
    return {
      actorUserId: actor.userId,
      actorRoleCodes: actor.roleCodes,
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };
  }
}
