import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { PlatformProductsService } from './platform-products.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';
import type { Request } from 'express';
import {
  createPlatformProductSchema,
  updatePlatformProductSchema,
  platformProductQuerySchema,
} from './platform-products.validation';
import { EmptyBodyDto } from '../../common/types/empty-body.dto';

@Controller('admin')
export class PlatformProductsController {
  constructor(private readonly platformProducts: PlatformProductsService) {}

  @Permissions('PLATFORM_PRODUCT_READ')
  @Get('platform-products')
  async listPlatformProducts(@Query() query: unknown) {
    const parsed = platformProductQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid query parameters.' } });
    }
    return this.platformProducts.getPlatformProducts(parsed.data);
  }

  @Permissions('PLATFORM_PRODUCT_READ')
  @Get('platform-products/:id')
  async getPlatformProduct(@Param('id') id: string) {
    return this.platformProducts.getPlatformProduct(id);
  }

  @Permissions('PLATFORM_PRODUCT_CREATE')
  @Post('platform-products')
  async createPlatformProduct(
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const parsed = createPlatformProductSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid product data', details: parsed.error.format() },
      });
    }

    const ctx = {
      actorUserId: actor.userId,
      actorRoleCodes: actor.roles,
      requestId: req.id as string,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    };

    return this.platformProducts.createPlatformProduct(parsed.data, ctx);
  }

  @Permissions('PLATFORM_PRODUCT_UPDATE')
  @Patch('platform-products/:id')
  async updatePlatformProduct(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const parsed = updatePlatformProductSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid update data', details: parsed.error.format() },
      });
    }

    const ctx = {
      actorUserId: actor.userId,
      actorRoleCodes: actor.roles,
      requestId: req.id as string,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    };

    return this.platformProducts.updatePlatformProduct(id, parsed.data, ctx);
  }

  @Permissions('PLATFORM_PRODUCT_ACTIVATE')
  @Post('platform-products/:id/activate')
  @HttpCode(200)
  async activatePlatformProduct(
    @Param('id') id: string,
    @Body() body: EmptyBodyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const ctx = {
      actorUserId: actor.userId,
      actorRoleCodes: actor.roles,
      requestId: req.id as string,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    };
    return this.platformProducts.activatePlatformProduct(id, ctx);
  }

  @Permissions('PLATFORM_PRODUCT_DEACTIVATE')
  @Post('platform-products/:id/deactivate')
  @HttpCode(200)
  async deactivatePlatformProduct(
    @Param('id') id: string,
    @Body() body: EmptyBodyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const ctx = {
      actorUserId: actor.userId,
      actorRoleCodes: actor.roles,
      requestId: req.id as string,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    };
    return this.platformProducts.deactivatePlatformProduct(id, ctx);
  }
}
