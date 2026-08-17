// ──────────────────────────────────────────────────────────────────────────
// Partner API – Controller
// ──────────────────────────────────────────────────────────────────────────
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  HttpException,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PartnerAuthGuard, PARTNER_CLIENT_CONTEXT_KEY } from './partner-auth.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { PartnerApplicationService } from './partner-application.service';
import { PartnerApiError } from './partner-api.errors';
import {
  AuthorizeMandateDto,
  CreatePartnerApplicationDto,
  RecordConsentsDto,
  RequestDisbursementDto,
  RequestPreApprovalDto,
  UpdateOnboardingDto,
  UpdateProfileDto,
} from './partner-api.dto';

type AnyRecord = Record<string, unknown>;

// Public here means "skip the global admin JWT guard" — this controller is
// authenticated by PartnerAuthGuard's HMAC signature check below instead,
// which is the actual auth mechanism for external partner callers (they have
// no admin session to hold a JWT for).
@Public()
@UseGuards(PartnerAuthGuard)
@UseInterceptors(IdempotencyInterceptor)
@Controller('partner/v1/applications')
export class PartnerApplicationController {
  constructor(private readonly service: PartnerApplicationService) {}

  private getClientDbId(req: Request): string {
    const client = ((req as unknown) as AnyRecord)[PARTNER_CLIENT_CONTEXT_KEY] as { id: string };
    return client.id;
  }

  private handleError(err: unknown): never {
    if (err instanceof PartnerApiError) {
      // HttpExceptionFilter only reads a documented error.code out of a NESTED
      // { error: { code, message } } body — it treats a bare string `error`
      // as unstructured and falls back to a generic HTTP-status code
      // (CONFLICT/NOT_FOUND/INVALID_REQUEST). A flat `{ error: err.code, ... }`
      // silently loses every specific PartnerApiError code on the wire.
      throw new HttpException({ error: { code: err.code, message: err.message } }, err.httpStatus);
    }
    throw err;
  }

  // ── POST / ──────────────────────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Body() dto: CreatePartnerApplicationDto) {
    try {
      return await this.service.createApplication(this.getClientDbId(req), dto);
    } catch (err) {
      this.handleError(err);
    }
  }

  // ── POST /:id/consents ──────────────────────────────────────────────────
  @Post(':partnerApplicationId/consents')
  @HttpCode(HttpStatus.OK)
  async recordConsents(
    @Req() req: Request,
    @Param('partnerApplicationId') partnerApplicationId: string,
    @Body() dto: RecordConsentsDto,
  ) {
    try {
      return await this.service.recordConsents(this.getClientDbId(req), partnerApplicationId, dto);
    } catch (err) {
      this.handleError(err);
    }
  }

  // ── PUT /:id/profile ────────────────────────────────────────────────────
  @Put(':partnerApplicationId/profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: Request,
    @Param('partnerApplicationId') partnerApplicationId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    try {
      return await this.service.updateProfile(this.getClientDbId(req), partnerApplicationId, dto);
    } catch (err) {
      this.handleError(err);
    }
  }

  // ── POST /:id/pre-approval ──────────────────────────────────────────────
  @Post(':partnerApplicationId/pre-approval')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPreApproval(
    @Req() req: Request,
    @Param('partnerApplicationId') partnerApplicationId: string,
    @Body() dto: RequestPreApprovalDto,
  ) {
    try {
      return await this.service.requestPreApproval(this.getClientDbId(req), partnerApplicationId, dto);
    } catch (err) {
      this.handleError(err);
    }
  }

  // ── PUT /:id/onboarding ─────────────────────────────────────────────────
  @Put(':partnerApplicationId/onboarding')
  @HttpCode(HttpStatus.OK)
  async updateOnboarding(
    @Req() req: Request,
    @Param('partnerApplicationId') partnerApplicationId: string,
    @Body() dto: UpdateOnboardingDto,
  ) {
    try {
      return await this.service.updateOnboarding(this.getClientDbId(req), partnerApplicationId, dto);
    } catch (err) {
      this.handleError(err);
    }
  }

  // ── POST /:id/final-approval ────────────────────────────────────────────
  @Post(':partnerApplicationId/final-approval')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestFinalApproval(
    @Req() req: Request,
    @Param('partnerApplicationId') partnerApplicationId: string,
  ) {
    try {
      return await this.service.requestFinalApproval(this.getClientDbId(req), partnerApplicationId);
    } catch (err) {
      this.handleError(err);
    }
  }

  // ── PUT /:id/mandate ────────────────────────────────────────────────────
  @Put(':partnerApplicationId/mandate')
  @HttpCode(HttpStatus.OK)
  async authorizeMandate(
    @Req() req: Request,
    @Param('partnerApplicationId') partnerApplicationId: string,
    @Body() dto: AuthorizeMandateDto,
  ) {
    try {
      return await this.service.authorizeMandate(this.getClientDbId(req), partnerApplicationId, dto);
    } catch (err) {
      this.handleError(err);
    }
  }

  // ── POST /:id/disbursements ─────────────────────────────────────────────
  @Post(':partnerApplicationId/disbursements')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestDisbursement(
    @Req() req: Request,
    @Param('partnerApplicationId') partnerApplicationId: string,
    @Body() dto: RequestDisbursementDto,
  ) {
    try {
      return await this.service.requestDisbursement(this.getClientDbId(req), partnerApplicationId, dto);
    } catch (err) {
      this.handleError(err);
    }
  }

  // ── GET /:id/status ─────────────────────────────────────────────────────
  @Get(':partnerApplicationId/status')
  @HttpCode(HttpStatus.OK)
  async getStatus(
    @Req() req: Request,
    @Param('partnerApplicationId') partnerApplicationId: string,
  ) {
    try {
      return await this.service.getStatus(this.getClientDbId(req), partnerApplicationId);
    } catch (err) {
      this.handleError(err);
    }
  }
}
