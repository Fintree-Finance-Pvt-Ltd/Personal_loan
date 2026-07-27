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
import { ProductsService } from './products.service';
import { ProductCalculationService } from './product-calculation.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';
import type { Request } from 'express';
import { EmptyBodyDto } from '../../common/types/empty-body.dto';
import {
  createProductSchema,
  updateProductIdentitySchema,
  updateProductVersionSchema,
  replaceOfferTiersSchema,
  rejectProductVersionSchema,
  productQuerySchema,
  simulateProductAmountSchema,
} from './products.validation';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

@Controller('admin')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly calc: ProductCalculationService,
  ) {}

  @Permissions('PRODUCT_READ')
  @Get('products')
  async listProducts(@Query() query: unknown) {
    const parsed = productQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: 'Invalid query parameters.' } });
    }
    return this.products.getProducts(parsed.data);
  }

  @Permissions('PRODUCT_READ')
  @Get('products/:productId')
  async getProduct(@Param('productId') productId: string) {
    return this.products.getProduct(productId);
  }

  @Permissions('PRODUCT_CREATE')
  @Post('products')
  async createProduct(
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: parsed.error.errors.map(e => e.message).join('; ') } });
    }
    return this.products.createProduct(parsed.data, this.context(actor, request));
  }

  @Permissions('PRODUCT_UPDATE')
  @Patch('products/:productId')
  async updateProductIdentity(
    @Param('productId') productId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsed = updateProductIdentitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: parsed.error.errors.map(e => e.message).join('; ') } });
    }
    return this.products.updateProductIdentity(productId, parsed.data, this.context(actor, request));
  }

  @Permissions('PRODUCT_UPDATE')
  @Patch('product-versions/:versionId')
  async updateProductVersion(
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsed = updateProductVersionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: parsed.error.errors.map(e => e.message).join('; ') } });
    }
    return this.products.updateProductVersion(versionId, parsed.data, this.context(actor, request));
  }

  @Permissions('PRODUCT_UPDATE')
  @Put('product-versions/:versionId/tiers')
  async replaceOfferTiers(
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsed = replaceOfferTiersSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: parsed.error.errors.map(e => e.message).join('; ') } });
    }
    return this.products.replaceOfferTiers(versionId, parsed.data, this.context(actor, request));
  }

  @Permissions('PRODUCT_SUBMIT')
  @Post('product-versions/:versionId/submit')
  @HttpCode(200)
  async submitVersion(
    @Param('versionId') versionId: string,
    @Body() _body: EmptyBodyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.submitVersion(versionId, this.context(actor, request));
  }

  @Permissions('PRODUCT_APPROVE')
  @Post('product-versions/:versionId/approve')
  @HttpCode(200)
  async approveVersion(
    @Param('versionId') versionId: string,
    @Body() _body: EmptyBodyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.approveVersion(versionId, this.context(actor, request));
  }

  @Permissions('PRODUCT_REJECT')
  @Post('product-versions/:versionId/reject')
  @HttpCode(200)
  async rejectVersion(
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const parsed = rejectProductVersionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: parsed.error.errors.map(e => e.message).join('; ') } });
    }
    return this.products.rejectVersion(versionId, parsed.data, this.context(actor, request));
  }

  @Permissions('PRODUCT_ACTIVATE')
  @Post('product-versions/:versionId/activate')
  @HttpCode(200)
  async activateVersion(
    @Param('versionId') versionId: string,
    @Body() _body: EmptyBodyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.activateVersion(versionId, this.context(actor, request));
  }

  @Permissions('PRODUCT_VERSION_CREATE')
  @Post('products/:productId/versions')
  async createNextVersion(
    @Param('productId') productId: string,
    @Body() _body: EmptyBodyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.products.createNextVersion(productId, this.context(actor, request));
  }

  @Permissions('PRODUCT_READ')
  @Post('product-versions/:versionId/simulate')
  @HttpCode(200)
  async simulateProductAmount(
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    const parsed = simulateProductAmountSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: { code: 'INVALID_REQUEST', message: parsed.error.errors.map(e => e.message).join('; ') } });
    }

    const { calc, products } = this;
    const version: any = await this.products['prisma'].lenderProductVersion.findUnique({
      where: { id: versionId },
      include: { offerTiers: true },
    });
    if (!version) throw new BadRequestException({ error: { code: 'NOT_FOUND', message: 'Version not found.' } });
    
    return calc.simulate(
      parsed.data.completedLoans,
      parsed.data.lenderApprovedAmount ?? null,
      version as any,
      version.offerTiers
    );
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
