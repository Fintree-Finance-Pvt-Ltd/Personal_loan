import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';
import {
  parseCreateLenderBody,
  parseLenderId,
  parseLenderListQuery,
  parseRejectLenderBody,
  parseUpdateLenderBody,
} from './lender.validation';
import { LendersService } from './lenders.service';

@Controller('admin/lenders')
export class LendersController {
  constructor(private readonly lendersService: LendersService) {}

  @Permissions('LENDER_READ')
  @Get()
  findAll(@Query() query: Record<string, unknown>) {
    return this.lendersService.findAll(parseLenderListQuery(query));
  }

  @Permissions('LENDER_READ')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.lendersService.findOne(parseLenderId(id));
  }

  @Permissions('LENDER_CREATE')
  @Post()
  create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.lendersService.create(
      parseCreateLenderBody(body),
      user,
      this.requestContext(request),
    );
  }

  @Permissions('LENDER_UPDATE')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.lendersService.update(
      parseLenderId(id),
      parseUpdateLenderBody(body),
      user,
      this.requestContext(request),
    );
  }

  @Permissions('LENDER_SUBMIT')
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.lendersService.submit(
      parseLenderId(id),
      user,
      this.requestContext(request),
    );
  }

  @Permissions('LENDER_APPROVE')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.lendersService.approve(
      parseLenderId(id),
      user,
      this.requestContext(request),
    );
  }

  @Permissions('LENDER_REJECT')
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const input = parseRejectLenderBody(body);

    return this.lendersService.reject(
      parseLenderId(id),
      input.reason,
      user,
      this.requestContext(request),
    );
  }

  @Permissions('LENDER_ACTIVATE')
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.lendersService.activate(
      parseLenderId(id),
      user,
      this.requestContext(request),
    );
  }

  @Permissions('LENDER_DEACTIVATE')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.lendersService.deactivate(
      parseLenderId(id),
      user,
      this.requestContext(request),
    );
  }

  private requestContext(request: Request) {
    return {
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    };
  }
}
