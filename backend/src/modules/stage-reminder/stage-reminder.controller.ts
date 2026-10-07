import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApplicationReminderStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { StageReminderQueueService } from './stage-reminder-queue.service';
import { StageResolverService } from './stage-resolver.service';

@Controller('stage-reminders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StageReminderController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: StageReminderQueueService,
    private readonly stageResolver: StageResolverService,
  ) {}

  /**
   * Lists stage reminders with optional filters.
   */
  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get()
  async getReminders(
    @Query('applicationId') applicationId?: string,
    @Query('stage') stage?: string,
    @Query('status') status?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(limitStr || '20', 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (applicationId?.trim()) {
      where.applicationId = BigInt(applicationId.trim());
    }
    if (stage?.trim()) {
      where.stage = stage.trim();
    }
    if (status?.trim()) {
      where.status = status.trim() as ApplicationReminderStatus;
    }

    const [total, records] = await Promise.all([
      this.prisma.plApplicationStageReminder.count({ where }),
      this.prisma.plApplicationStageReminder.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          application: {
            select: {
              applicationNumber: true,
              status: true,
              customer: {
                select: {
                  fullName: true,
                  mobileNumber: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const formatted = records.map((r) => ({
      id: r.id.toString(),
      applicationId: r.applicationId.toString(),
      applicationNumber: r.application?.applicationNumber || null,
      customerName: r.application?.customer?.fullName || null,
      customerMobile: r.application?.customer?.mobileNumber || null,
      stage: r.stage,
      stuckSince: r.stuckSince,
      lastReminderSentAt: r.lastReminderSentAt,
      reminderCount: r.reminderCount,
      weeklyReminderCount: r.weeklyReminderCount,
      nextReminderDate: r.nextReminderDate,
      status: r.status,
      lastJobId: r.lastJobId,
      stopReason: r.stopReason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return {
      success: true,
      total,
      page,
      limit,
      results: formatted,
    };
  }

  /**
   * Retrieves active reminders for a specific application.
   */
  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get('applications/:applicationId')
  async getApplicationReminders(@Param('applicationId') applicationId: string) {
    if (!/^[1-9][0-9]*$/.test(applicationId)) {
      throw new BadRequestException('Invalid application ID.');
    }

    const appIdBigInt = BigInt(applicationId);
    const records = await this.prisma.plApplicationStageReminder.findMany({
      where: { applicationId: appIdBigInt },
      orderBy: { createdAt: 'desc' },
    });

    const app = await this.prisma.plApplication.findUnique({
      where: { id: appIdBigInt },
      include: { customer: true, loans: { take: 1, orderBy: { id: 'desc' } } },
    });

    const currentResolution = app ? this.stageResolver.resolveStage(app) : null;

    return {
      success: true,
      applicationId,
      currentStage: currentResolution?.stage || null,
      currentStageDisplayName: currentResolution?.stageDisplayName || null,
      isTerminal: currentResolution?.isTerminal || false,
      reminders: records.map((r) => ({
        id: r.id.toString(),
        stage: r.stage,
        stuckSince: r.stuckSince,
        lastReminderSentAt: r.lastReminderSentAt,
        reminderCount: r.reminderCount,
        weeklyReminderCount: r.weeklyReminderCount,
        nextReminderDate: r.nextReminderDate,
        status: r.status,
        lastJobId: r.lastJobId,
        stopReason: r.stopReason,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  }

  /**
   * Triggers a scan to schedule reminders for all stuck applications.
   */
  @Permissions('LOAN_MANAGE')
  @Post('scan-stuck')
  @HttpCode(HttpStatus.OK)
  async scanStuckApplications() {
    const result = await this.queueService.scanStuckApplications();
    return {
      success: true,
      message: 'Scanned stuck applications and scheduled pending reminders.',
      ...result,
    };
  }

  /**
   * Enrolls an application or schedules the first reminder on demand.
   */
  @Permissions('LOAN_MANAGE')
  @Post('applications/:applicationId/enroll')
  @HttpCode(HttpStatus.OK)
  async enrollApplication(@Param('applicationId') applicationId: string) {
    if (!/^[1-9][0-9]*$/.test(applicationId)) {
      throw new BadRequestException('Invalid application ID.');
    }

    const appIdBigInt = BigInt(applicationId);
    const app = await this.prisma.plApplication.findUnique({
      where: { id: appIdBigInt },
      include: { customer: true, loans: { take: 1, orderBy: { id: 'desc' } } },
    });

    if (!app) {
      throw new BadRequestException(`Application #${applicationId} not found.`);
    }

    const resolution = this.stageResolver.resolveStage(app);
    if (resolution.isTerminal) {
      throw new BadRequestException(
        `Application #${applicationId} is in terminal status: ${resolution.stage} (${resolution.terminalReason})`,
      );
    }

    const jobId = await this.queueService.scheduleFirstReminder(appIdBigInt, resolution.stage);

    return {
      success: true,
      applicationId,
      stage: resolution.stage,
      stageDisplayName: resolution.stageDisplayName,
      jobId,
    };
  }
}
