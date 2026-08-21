import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { signDocumentUrl } from '../../common/utils/document-url-signer.helper';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async saveCustomerLivePhoto(customerId: bigint, file: any, body: any) {
    if (!file) {
      throw new BadRequestException('No image file provided.');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, customerCode: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const applicationIdHint = String(body?.applicationId || '').trim();
    if (!/^[1-9][0-9]*$/.test(applicationIdHint)) {
      throw new BadRequestException('Canonical application ID is required.');
    }
    const application = await this.prisma.plApplication.findFirst({
      where: { id: BigInt(applicationIdHint), customerId },
    });
    if (!application) {
      throw new NotFoundException('Canonical application not found for customer.');
    }
    const livenessVerificationId = String(body?.livenessVerificationId || '').trim();
    const liveness = livenessVerificationId
      ? await this.prisma.applicationLiveness.findFirst({
          where: { id: livenessVerificationId, applicationId: application.id, verificationStatus: 'VERIFIED' },
        })
      : null;
    if (!liveness?.verifiedAt) {
      throw new BadRequestException('A server-verified liveness result is required before uploading the photo.');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Image file size exceeds maximum limit of 5 MB.');
    }

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const uploadsBaseDir = join(process.cwd(), 'uploads', 'customer-documents', 'live-photo', year, month);
    if (!existsSync(uploadsBaseDir)) {
      mkdirSync(uploadsBaseDir, { recursive: true });
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const fileName = `customer-${customer.id}-live-photo-${now.getTime()}-${randomSuffix}.jpg`;
    const fullPath = join(uploadsBaseDir, fileName);

    const relativePath = `uploads/customer-documents/live-photo/${year}/${month}/${fileName}`;
    const fileUrl = `/${relativePath}`;

    const fileBuffer = file.buffer || (file.path ? readFileSync(file.path) : null);
    if (!fileBuffer) {
      throw new BadRequestException('Could not read uploaded file content.');
    }

    try {
      writeFileSync(fullPath, fileBuffer);
    } catch (err: any) {
      this.logger.error('Failed to write uploaded image file to disk:', err);
      throw new BadGatewayException('Failed to save document file to disk.');
    }

    const lat = body?.latitude && !isNaN(Number(body.latitude)) ? Number(body.latitude) : null;
    const lon = body?.longitude && !isNaN(Number(body.longitude)) ? Number(body.longitude) : null;
    const acc = body?.accuracy && !isNaN(Number(body.accuracy)) ? Number(body.accuracy) : null;

    const capturedAtDate = body?.capturedAt ? new Date(body.capturedAt) : new Date();

    try {
      const document = await this.prisma.$transaction(async (tx) => {
        await tx.plCustomerDocument.updateMany({
          where: { customerId, applicationId: application.id, documentType: 'CUSTOMER_LIVE_PHOTO', status: 'VERIFIED' },
          data: { status: 'REPLACED' },
        });

        const metadataJson = JSON.stringify({
          capturedAt: capturedAtDate.toISOString(),
          latitude: lat,
          longitude: lon,
          accuracy: acc,
          formattedAddress: body?.formattedAddress || null,
          city: body?.city || null,
          state: body?.state || null,
          country: body?.country || 'India',
          postalCode: body?.postalCode || null,
        });

        const formattedAddress = body?.formattedAddress || null;
        const city = body?.city || null;
        const state = body?.state || null;
        const country = body?.country || 'India';
        const postalCode = body?.postalCode || null;
        const originalName = file.originalname || fileName;
        const fileSize = file.size || 0;
        const created = await tx.plCustomerDocument.create({
          data: {
            customerId,
            applicationId: application.id,
            documentType: 'CUSTOMER_LIVE_PHOTO',
            applicantType: 'BORROWER',
            status: 'VERIFIED',
            fileName,
            originalFileName: originalName,
            filePath: relativePath,
            fileUrl,
            mimeType: file.mimetype,
            fileSize,
            source: 'PROFILE_DETAILS',
            latitude: lat,
            longitude: lon,
            accuracy: acc,
            formattedAddress,
            city,
            state,
            country,
            postalCode,
            capturedAt: capturedAtDate,
            faceLivenessStatus: 'VERIFIED',
            faceLivenessScore: liveness.score,
            faceLivenessProviderApplicationId: liveness.providerTransactionId,
            metadataJson,
          },
        });
        await tx.applicationLiveness.update({ where: { id: liveness.id }, data: { photoDocumentId: created.id } });
        await tx.customer.update({ where: { id: customerId }, data: { lastActivityAt: new Date() } });
        return created;
      });

      this.logger.log(`Live photo document saved successfully for customer ${customer.customerCode}.`);

      return {
        success: true,
        message: 'Live photo document uploaded and saved successfully.',
        data: this.serializeDocument(document),
      };
    } catch (dbError: any) {
      this.logger.error('Database transaction failed while saving document:', dbError);
      throw new BadGatewayException(dbError?.message || 'Failed to save document metadata in database.');
    }
  }

  async getCustomerLivePhoto(customerId: bigint) {
    const document = await this.prisma.plCustomerDocument.findFirst({
      where: { customerId, documentType: 'CUSTOMER_LIVE_PHOTO', status: 'VERIFIED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!document) {
      return {
        success: true,
        data: null,
      };
    }

    return {
      success: true,
      data: this.serializeDocument(document),
    };
  }

  private serializeDocument(doc: any) {
    if (!doc) return null;
    return {
      ...doc,
      id: doc.id.toString(),
      customerId: doc.customerId.toString(),
      applicationId: doc.applicationId?.toString() ?? null,
      createdBy: doc.createdBy?.toString() ?? null,
      updatedBy: doc.updatedBy?.toString() ?? null,
      fileUrl: signDocumentUrl(doc.fileUrl),
    };
  }
}
