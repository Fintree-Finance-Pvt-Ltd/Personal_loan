import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PartnerApiClientStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface CreateMarketingPartnerDto {
  displayName: string;
  clientCode: string;
  authenticationType?: 'CAMPAIGN_LINK' | 'HMAC_SHA256';
  allowedIpAddresses?: string | null;
  webhookUrl?: string | null;
  status?: PartnerApiClientStatus;
}

export interface UpdateMarketingPartnerDto {
  displayName?: string;
  authenticationType?: 'CAMPAIGN_LINK' | 'HMAC_SHA256';
  allowedIpAddresses?: string | null;
  webhookUrl?: string | null;
  status?: PartnerApiClientStatus;
}

@Injectable()
export class PartnerAdminService {
  private readonly logger = new Logger(PartnerAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all registered marketing partners and agencies with their performance metrics.
   */
  async listPartners() {
    const clients = await this.prisma.partnerApiClient.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            applications: true,
          },
        },
      },
    });

    // Also get attribution metrics by partnerCode
    const attributions = await this.prisma.applicationAttribution.findMany({
      where: {
        partnerCode: { not: null },
      },
      select: {
        partnerCode: true,
        applicationId: true,
      },
    });

    const appIdsByPartner = new Map<string, bigint[]>();
    for (const attr of attributions) {
      if (attr.partnerCode) {
        const list = appIdsByPartner.get(attr.partnerCode) || [];
        list.push(attr.applicationId);
        appIdsByPartner.set(attr.partnerCode, list);
      }
    }

    // Query loans for disbursed amounts
    const disbursedLoans = await this.prisma.plLoan.findMany({
      where: {
        status: 'DISBURSED',
      },
      select: {
        applicationId: true,
        approvedAmount: true,
      },
    });

    const disbursedByAppId = new Map<string, number>();
    for (const loan of disbursedLoans) {
      disbursedByAppId.set(loan.applicationId.toString(), loan.approvedAmount ? Number(loan.approvedAmount) : 0);
    }

    return clients.map((client) => {
      const attributedAppIds = appIdsByPartner.get(client.clientCode) || [];
      const totalAttributed = attributedAppIds.length;
      const apiApps = client._count.applications;
      const totalApplications = Math.max(totalAttributed, apiApps);

      let totalDisbursedAmount = 0;
      let disbursedCount = 0;

      for (const appId of attributedAppIds) {
        const amt = disbursedByAppId.get(appId.toString());
        if (amt !== undefined) {
          disbursedCount++;
          totalDisbursedAmount += amt;
        }
      }

      return {
        id: client.id,
        displayName: client.displayName,
        clientCode: client.clientCode,
        clientId: client.clientId,
        authenticationType: client.authenticationType,
        allowedIpAddresses: client.allowedIpAddresses,
        webhookUrl: client.webhookUrl,
        status: client.status,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
        metrics: {
          totalApplications,
          disbursedCount,
          totalDisbursedAmount,
        },
      };
    });
  }

  /**
   * Registers a new marketing partner or agency.
   * Generates secure clientId and HMAC secret.
   */
  async createPartner(dto: CreateMarketingPartnerDto) {
    const cleanCode = dto.clientCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');

    const existingCode = await this.prisma.partnerApiClient.findUnique({
      where: { clientCode: cleanCode },
    });
    if (existingCode) {
      throw new ConflictException(`Partner code '${cleanCode}' is already registered.`);
    }

    const generatedClientId = `ptn_${randomBytes(8).toString('hex')}`;
    const rawSecret = randomBytes(24).toString('base64url');

    const partner = await this.prisma.partnerApiClient.create({
      data: {
        clientCode: cleanCode,
        displayName: dto.displayName.trim(),
        clientId: generatedClientId,
        secretReference: rawSecret, // Plain reference for display/HMAC validation in partner auth
        authenticationType: dto.authenticationType || 'CAMPAIGN_LINK',
        allowedIpAddresses: dto.allowedIpAddresses?.trim() || null,
        webhookUrl: dto.webhookUrl?.trim() || null,
        webhookSecretReference: dto.webhookUrl ? randomBytes(20).toString('hex') : null,
        status: dto.status || PartnerApiClientStatus.ACTIVE,
      },
    });

    this.logger.log(`Created new marketing partner: ${partner.displayName} (${partner.clientCode})`);

    return {
      id: partner.id,
      displayName: partner.displayName,
      clientCode: partner.clientCode,
      clientId: partner.clientId,
      secret: rawSecret, // Revealed on creation for agency setup
      webhookSecret: partner.webhookSecretReference,
      authenticationType: partner.authenticationType,
      allowedIpAddresses: partner.allowedIpAddresses,
      webhookUrl: partner.webhookUrl,
      status: partner.status,
      createdAt: partner.createdAt,
    };
  }

  /**
   * Updates partner details.
   */
  async updatePartner(id: string, dto: UpdateMarketingPartnerDto) {
    const existing = await this.prisma.partnerApiClient.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Partner with ID '${id}' not found.`);
    }

    const updated = await this.prisma.partnerApiClient.update({
      where: { id },
      data: {
        displayName: dto.displayName !== undefined ? dto.displayName.trim() : undefined,
        authenticationType: dto.authenticationType ?? undefined,
        allowedIpAddresses: dto.allowedIpAddresses !== undefined ? dto.allowedIpAddresses?.trim() || null : undefined,
        webhookUrl: dto.webhookUrl !== undefined ? dto.webhookUrl?.trim() || null : undefined,
        status: dto.status ?? undefined,
      },
    });

    return {
      id: updated.id,
      displayName: updated.displayName,
      clientCode: updated.clientCode,
      clientId: updated.clientId,
      authenticationType: updated.authenticationType,
      allowedIpAddresses: updated.allowedIpAddresses,
      webhookUrl: updated.webhookUrl,
      status: updated.status,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Toggles status (ACTIVE/INACTIVE).
   */
  async toggleStatus(id: string, status: PartnerApiClientStatus) {
    const existing = await this.prisma.partnerApiClient.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Partner with ID '${id}' not found.`);
    }

    return this.prisma.partnerApiClient.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        displayName: true,
        clientCode: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Rotates partner secret key.
   */
  async rotateSecret(id: string) {
    const existing = await this.prisma.partnerApiClient.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Partner with ID '${id}' not found.`);
    }

    const newSecret = randomBytes(24).toString('base64url');
    await this.prisma.partnerApiClient.update({
      where: { id },
      data: { secretReference: newSecret },
    });

    this.logger.log(`Rotated secret for partner: ${existing.displayName} (${existing.clientCode})`);

    return {
      id: existing.id,
      clientId: existing.clientId,
      clientCode: existing.clientCode,
      newSecret,
    };
  }

  /**
   * Aggregated campaign performance & attribution analytics.
   */
  async getAttributionAnalytics() {
    const attributions = await this.prisma.applicationAttribution.findMany({
      orderBy: { capturedAt: 'desc' },
      take: 2000,
    });

    const appIds = attributions.map((a) => a.applicationId);

    // Fetch loan statuses and amounts
    const loans = appIds.length
      ? await this.prisma.plLoan.findMany({
          where: { applicationId: { in: appIds } },
          select: { applicationId: true, status: true, approvedAmount: true },
        })
      : [];

    const loanMap = new Map<string, { status: string; approvedAmount: number }>();
    for (const l of loans) {
      loanMap.set(l.applicationId.toString(), {
        status: l.status,
        approvedAmount: l.approvedAmount ? Number(l.approvedAmount) : 0,
      });
    }

    // Aggregate by campaign
    const campaignStats = new Map<
      string,
      { campaign: string; source: string; applications: number; approved: number; disbursed: number; disbursedAmount: number }
    >();

    // Aggregate by source
    const sourceStats = new Map<
      string,
      { source: string; count: number; disbursed: number; disbursedAmount: number }
    >();

    let totalDisbursedVolume = 0;
    let totalDisbursedCount = 0;
    let totalApprovedCount = 0;

    for (const attr of attributions) {
      const src = attr.acquisitionSource || 'WEBSITE';
      const camp = attr.utmCampaign || '(No Campaign)';
      const loan = loanMap.get(attr.applicationId.toString());

      const isDisbursed = loan?.status === 'DISBURSED';
      const isApproved =
        loan?.status === 'APPROVED' ||
        loan?.status === 'DISBURSED' ||
        loan?.status === 'MANDATE_SUCCESS' ||
        loan?.status === 'AGREEMENT_SIGNED';
      const amt = isDisbursed && loan ? loan.approvedAmount : 0;

      if (isDisbursed) {
        totalDisbursedCount++;
        totalDisbursedVolume += amt;
      }
      if (isApproved) {
        totalApprovedCount++;
      }

      // Campaign aggregation
      const existingCamp = campaignStats.get(camp) || {
        campaign: camp,
        source: src,
        applications: 0,
        approved: 0,
        disbursed: 0,
        disbursedAmount: 0,
      };
      existingCamp.applications++;
      if (isApproved) existingCamp.approved++;
      if (isDisbursed) {
        existingCamp.disbursed++;
        existingCamp.disbursedAmount += amt;
      }
      campaignStats.set(camp, existingCamp);

      // Source aggregation
      const existingSrc = sourceStats.get(src) || {
        source: src,
        count: 0,
        disbursed: 0,
        disbursedAmount: 0,
      };
      existingSrc.count++;
      if (isDisbursed) {
        existingSrc.disbursed++;
        existingSrc.disbursedAmount += amt;
      }
      sourceStats.set(src, existingSrc);
    }

    return {
      summary: {
        totalTrackedApplications: attributions.length,
        totalApprovedCount,
        totalDisbursedCount,
        totalDisbursedVolume,
        conversionRate:
          attributions.length > 0
            ? Number(((totalDisbursedCount / attributions.length) * 100).toFixed(1))
            : 0,
      },
      byCampaign: Array.from(campaignStats.values()).sort((a, b) => b.applications - a.applications),
      bySource: Array.from(sourceStats.values()).sort((a, b) => b.count - a.count),
    };
  }
}
