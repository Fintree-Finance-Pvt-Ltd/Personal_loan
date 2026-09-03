import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ApplicationFaceMatchStatus, Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import { AxiosError } from 'axios';
import * as FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  DigitapFaceMatchResponse,
  RunFaceMatchOptions,
} from './interfaces/face-match.interface';

/**
 * Digitap FaceMatch — compares the customer's captured live photo (person side) with
 * the photo on their DigiLocker Aadhaar (card side).
 *
 * Advisory only: this never blocks the customer journey. Every outcome, including a
 * provider failure or a missing input document, is persisted as an ApplicationFaceMatch
 * row so the credit reviewer always sees *why* there is or isn't a score.
 */
@Injectable()
export class FaceMatchService {
  private readonly logger = new Logger(FaceMatchService.name);

  private readonly apiUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // FaceMatch is the same Digitap fmfl product as face-liveness, on the same host with
    // the same credentials — derive the URL from the liveness one so a single env change
    // (UAT <-> prod) moves both, but still allow an explicit override.
    const livenessUrl = this.configService.getOrThrow<string>('FACE_LIVENESS_API_URL');
    this.apiUrl =
      this.configService.get<string>('FACE_MATCH_API_URL') ||
      livenessUrl.replace(/face-liveness\/?$/, 'face-match');

    // Digitap issues separate credentials per product: the fmfl pair (face-liveness /
    // face-match) is NOT the same account as the ent/v1 pair used for DigiLocker Aadhaar
    // KYC, and the two currently point at different environments (fmfl -> svcdemo UAT,
    // ent/v1 -> svc.digitap.ai prod). FaceMatch is an fmfl endpoint, so it defaults to the
    // face-liveness pair; FACE_MATCH_CLIENT_ID/SECRET override it without a code change if
    // Digitap ever issues a distinct account for face-match.
    const clientId =
      this.configService.get<string>('FACE_MATCH_CLIENT_ID') ||
      this.configService.getOrThrow<string>('FACE_LIVENESS_CLIENT_ID');
    const clientSecret =
      this.configService.get<string>('FACE_MATCH_CLIENT_SECRET') ||
      this.configService.getOrThrow<string>('FACE_LIVENESS_CLIENT_SECRET');
    this.authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

    this.timeoutMs = Number(
      this.configService.get<string>('FACE_MATCH_API_TIMEOUT_MS') ||
        this.configService.get<string>('FACE_LIVENESS_API_TIMEOUT_MS', '15000'),
    );
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      this.timeoutMs = 15000;
    }
  }

  /**
   * Fire-and-forget entry point for the Aadhaar KYC flow. Face match is advisory, so a
   * failure here must never surface as a KYC failure to the customer.
   */
  runInBackground(applicationId: bigint, options: RunFaceMatchOptions = {}): void {
    this.runForApplication(applicationId, options).catch((error: any) => {
      this.logger.error(
        `Background face match failed for application ${applicationId}: ${error?.message}`,
      );
    });
  }

  async runForApplication(applicationId: bigint, options: RunFaceMatchOptions = {}) {
    const application = await this.prisma.plApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, customerId: true, applicationNumber: true },
    });
    if (!application) throw new NotFoundException('Application not found.');

    if (!options.force) {
      const existing = await this.prisma.applicationFaceMatch.findUnique({
        where: { applicationId },
      });
      // Only a conclusive result short-circuits. SKIPPED/ERROR rows are re-attempted, so a
      // match recorded before the Aadhaar PDF finished downloading resolves on the next run.
      if (existing && ['MATCHED', 'NOT_MATCHED'].includes(existing.status)) {
        return existing;
      }
    }

    // Prefer this application's own selfie as the strongest evidence, but fall back to the
    // customer's most recent verified one. Repeat customers don't re-capture a live photo
    // for a second loan (same reason they don't redo DigiLocker — see
    // CustomerService.saveApplicationAddress), so scoping strictly to this application
    // would report "no live photograph" for every returning borrower. The Aadhaar lookup
    // below is already customer-wide for exactly this reason. Whichever document is used is
    // recorded as livePhotoDocumentId so a reviewer can always trace the comparison back.
    const livePhoto =
      (await this.prisma.plCustomerDocument.findFirst({
        where: {
          customerId: application.customerId,
          documentType: 'CUSTOMER_LIVE_PHOTO',
          status: 'VERIFIED',
          OR: [{ applicationId }, { applicationId: null }],
        },
        orderBy: { uploadedAt: 'desc' },
      })) ??
      (await this.prisma.plCustomerDocument.findFirst({
        where: {
          customerId: application.customerId,
          documentType: 'CUSTOMER_LIVE_PHOTO',
          status: 'VERIFIED',
        },
        orderBy: { uploadedAt: 'desc' },
      }));

    // The DigiLocker Aadhaar arrives as a PDF (stored by
    // CustomerAadhaarKycService.storeDigitapDocuments). Digitap FaceMatch reads the face
    // straight out of a PDF via input_pdf2, so there is no need to rasterize it first.
    const aadhaarDoc = await this.prisma.plCustomerDocument.findFirst({
      where: {
        customerId: application.customerId,
        documentType: 'AADHAAR_CARD',
        status: 'VERIFIED',
      },
      orderBy: { uploadedAt: 'desc' },
    });

    if (!livePhoto) {
      return this.persist(applicationId, 'SKIPPED', {
        failureReason: 'No verified live photograph is on file for this customer.',
        livePhotoDocumentId: null,
        aadhaarDocumentId: aadhaarDoc?.id ?? null,
      });
    }
    if (!aadhaarDoc) {
      return this.persist(applicationId, 'SKIPPED', {
        failureReason: 'No verified DigiLocker Aadhaar document is on file for this customer.',
        livePhotoDocumentId: livePhoto.id,
        aadhaarDocumentId: null,
      });
    }

    const liveBuffer = this.readDocument(livePhoto);
    const aadhaarBuffer = this.readDocument(aadhaarDoc);

    if (!liveBuffer) {
      return this.persist(applicationId, 'SKIPPED', {
        failureReason: `Live photograph file is missing on disk (${livePhoto.filePath}).`,
        livePhotoDocumentId: livePhoto.id,
        aadhaarDocumentId: aadhaarDoc.id,
      });
    }
    if (!aadhaarBuffer) {
      return this.persist(applicationId, 'SKIPPED', {
        failureReason: `Aadhaar document file is missing on disk (${aadhaarDoc.filePath}).`,
        livePhotoDocumentId: livePhoto.id,
        aadhaarDocumentId: aadhaarDoc.id,
      });
    }

    // Provider caps the whole request at 4MB.
    const totalBytes = liveBuffer.length + aadhaarBuffer.length;
    if (totalBytes > 4 * 1024 * 1024) {
      return this.persist(applicationId, 'SKIPPED', {
        failureReason: `Combined image payload is ${(totalBytes / (1024 * 1024)).toFixed(2)}MB, over the provider's 4MB limit.`,
        livePhotoDocumentId: livePhoto.id,
        aadhaarDocumentId: aadhaarDoc.id,
      });
    }

    // client_ref_num is capped at 45 chars by the provider.
    const clientRefNum = `FM_${application.id}_${Date.now()}`.slice(0, 45);

    const formData = new FormData();
    formData.append('input_image1', liveBuffer, {
      filename: livePhoto.fileName || 'live-photo.jpg',
      contentType: livePhoto.mimeType || 'image/jpeg',
    });
    const aadhaarIsPdf = (aadhaarDoc.mimeType || '').includes('pdf');
    formData.append(aadhaarIsPdf ? 'input_pdf2' : 'input_image2', aadhaarBuffer, {
      filename: aadhaarDoc.fileName || (aadhaarIsPdf ? 'aadhaar.pdf' : 'aadhaar.jpg'),
      contentType: aadhaarDoc.mimeType || (aadhaarIsPdf ? 'application/pdf' : 'image/jpeg'),
    });
    formData.append('client_ref_num', clientRefNum);

    let providerData: DigitapFaceMatchResponse;
    try {
      const response = await firstValueFrom(
        this.httpService.post<DigitapFaceMatchResponse>(this.apiUrl, formData, {
          timeout: this.timeoutMs,
          headers: {
            ...formData.getHeaders(),
            accept: 'application/json',
            authorization: this.authHeader,
          },
        }),
      );
      providerData = response.data;
    } catch (error: unknown) {
      const message = this.describeError(error);
      this.logger.error(
        `Face match provider call failed for application ${application.applicationNumber}: ${message}`,
      );
      return this.persist(applicationId, 'ERROR', {
        clientRefNum,
        failureReason: message,
        livePhotoDocumentId: livePhoto.id,
        aadhaarDocumentId: aadhaarDoc.id,
        rawResponse:
          error instanceof AxiosError && error.response?.data
            ? this.stringify(error.response.data)
            : null,
      });
    }

    if (providerData?.status !== 'success' || !providerData.result) {
      return this.persist(applicationId, 'ERROR', {
        clientRefNum,
        providerRequestId: providerData?.req_id || providerData?.req_Id || null,
        failureReason: providerData?.message || 'Face match provider returned an unsuccessful response.',
        livePhotoDocumentId: livePhoto.id,
        aadhaarDocumentId: aadhaarDoc.id,
        rawResponse: this.stringify(providerData),
      });
    }

    const result = providerData.result;
    const isSameFace = this.toBool(result.is_same_face);
    const confidence = this.toNumber(result.same_face_confidence);

    this.logger.log(
      `Face match completed for application ${application.applicationNumber}: is_same_face=${isSameFace}, confidence=${confidence}`,
    );

    return this.persist(applicationId, isSameFace ? 'MATCHED' : 'NOT_MATCHED', {
      clientRefNum: providerData.client_ref_num || clientRefNum,
      providerRequestId: providerData.req_id || providerData.req_Id || null,
      isSameFace,
      sameFaceConfidence: confidence,
      personImageBlurry: this.toBool(result.is_person_image_blurry),
      cardImageBlurry: this.toBool(result.is_card_image_blurry),
      personImageFaceDetected: this.toBool(result.person_image_correctly_identified),
      cardImageFaceDetected: this.toBool(result.card_image_correctly_identified),
      livePhotoDocumentId: livePhoto.id,
      aadhaarDocumentId: aadhaarDoc.id,
      rawResponse: this.stringify(providerData),
      matchedAt: new Date(),
    });
  }

  /** Shape used by the admin application-details payload. */
  async getForApplication(applicationId: bigint) {
    const row = await this.prisma.applicationFaceMatch.findUnique({ where: { applicationId } });
    if (!row) return null;
    return {
      status: row.status,
      provider: row.provider,
      isSameFace: row.isSameFace,
      sameFaceConfidence: row.sameFaceConfidence ? Number(row.sameFaceConfidence) : null,
      personImageBlurry: row.personImageBlurry,
      cardImageBlurry: row.cardImageBlurry,
      personImageFaceDetected: row.personImageFaceDetected,
      cardImageFaceDetected: row.cardImageFaceDetected,
      failureReason: row.failureReason,
      providerRequestId: row.providerRequestId,
      matchedAt: row.matchedAt,
      updatedAt: row.updatedAt,
    };
  }

  private async persist(
    applicationId: bigint,
    status: ApplicationFaceMatchStatus,
    data: {
      clientRefNum?: string | null;
      providerRequestId?: string | null;
      isSameFace?: boolean | null;
      sameFaceConfidence?: number | null;
      personImageBlurry?: boolean | null;
      cardImageBlurry?: boolean | null;
      personImageFaceDetected?: boolean | null;
      cardImageFaceDetected?: boolean | null;
      livePhotoDocumentId?: bigint | null;
      aadhaarDocumentId?: bigint | null;
      rawResponse?: string | null;
      failureReason?: string | null;
      matchedAt?: Date | null;
    },
  ) {
    const payload = {
      provider: 'DIGITAP',
      status,
      clientRefNum: data.clientRefNum ?? null,
      providerRequestId: data.providerRequestId ?? null,
      isSameFace: data.isSameFace ?? null,
      sameFaceConfidence:
        data.sameFaceConfidence == null
          ? null
          : new Prisma.Decimal(data.sameFaceConfidence.toFixed(8)),
      personImageBlurry: data.personImageBlurry ?? null,
      cardImageBlurry: data.cardImageBlurry ?? null,
      personImageFaceDetected: data.personImageFaceDetected ?? null,
      cardImageFaceDetected: data.cardImageFaceDetected ?? null,
      livePhotoDocumentId: data.livePhotoDocumentId ?? null,
      aadhaarDocumentId: data.aadhaarDocumentId ?? null,
      rawResponse: data.rawResponse ?? null,
      failureReason: data.failureReason ?? null,
      matchedAt: data.matchedAt ?? null,
    };

    return this.prisma.applicationFaceMatch.upsert({
      where: { applicationId },
      create: { applicationId, ...payload },
      update: payload,
    });
  }

  /**
   * Live photos store a repo-relative filePath while DigiLocker documents store an
   * absolute one (see DocumentsService vs CustomerAadhaarKycService.storeDigitapDocuments),
   * so both shapes have to resolve here.
   */
  private readDocument(document: { filePath: string; fileUrl: string }): Buffer | null {
    const candidates = [
      document.filePath,
      isAbsolute(document.filePath) ? null : join(process.cwd(), document.filePath),
      join(process.cwd(), document.fileUrl.replace(/^\//, '')),
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      try {
        if (existsSync(candidate)) return readFileSync(candidate);
      } catch {
        // try the next candidate
      }
    }
    return null;
  }

  private toBool(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return null;
  }

  /**
   * same_face_confidence is documented as a 0..1 float. It is clamped rather than trusted
   * because the column is DECIMAL(9,8) — a provider returning a percentage (or anything
   * else out of range) would otherwise overflow and throw away the whole result row.
   */
  private toNumber(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
    if (!Number.isFinite(parsed)) return null;
    return Math.min(1, Math.max(0, parsed > 1 && parsed <= 100 ? parsed / 100 : parsed));
  }

  private stringify(value: unknown): string | null {
    try {
      return JSON.stringify(value).slice(0, 60000);
    } catch {
      return null;
    }
  }

  private describeError(error: unknown): string {
    if (error instanceof AxiosError) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return 'Face match provider did not respond in time.';
      }
      if (!error.response) return 'Face match provider is unreachable.';
      const providerMessage = error.response.data?.message || error.message;
      return `Provider responded ${error.response.status}: ${providerMessage}`;
    }
    if (error instanceof BadRequestException) return error.message;
    return error instanceof Error ? error.message : 'Unknown face match error.';
  }
}
