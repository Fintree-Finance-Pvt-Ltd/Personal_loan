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

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async saveCustomerLivePhoto(file: any, body: any) {
    if (!file) {
      throw new BadRequestException('No image file provided.');
    }

    const customerIdInput = body?.customerId || body?.customer?.id;
    if (!customerIdInput) {
      throw new BadRequestException('Customer ID is required.');
    }

    const customerId = BigInt(customerIdInput);

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, customerCode: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
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

    let appId: bigint | null = null;
    const rawAppId = String(body?.applicationId || '').trim();
    if (rawAppId && rawAppId !== 'null' && rawAppId !== 'undefined' && /^\d+$/.test(rawAppId)) {
      try {
        appId = BigInt(rawAppId);
      } catch {
        appId = null;
      }
    }

    const capturedAtDate = body?.capturedAt ? new Date(body.capturedAt) : new Date();

    try {
      const document = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE \`pl_customer_documents\` SET \`status\` = 'REPLACED', \`updated_at\` = NOW(6) WHERE \`customer_id\` = ? AND \`document_type\` = 'CUSTOMER_LIVE_PHOTO' AND \`status\` = 'VERIFIED'`,
          customerId,
        );

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

        const scoreVal = body?.faceLivenessScore && !isNaN(Number(body.faceLivenessScore))
          ? Number(body.faceLivenessScore)
          : null;

        await tx.$executeRawUnsafe(
          `INSERT INTO \`pl_customer_documents\` (
            \`customer_id\`, \`application_id\`, \`document_type\`, \`applicant_type\`, \`status\`,
            \`file_name\`, \`original_file_name\`, \`file_path\`, \`file_url\`, \`mime_type\`, \`file_size\`, \`source\`,
            \`latitude\`, \`longitude\`, \`accuracy\`, \`formatted_address\`, \`city\`, \`state\`, \`country\`, \`postal_code\`,
            \`captured_at\`, \`face_liveness_status\`, \`face_liveness_score\`, \`face_liveness_provider_app_id\`, \`metadata_json\`, \`created_at\`, \`updated_at\`
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
          customerId,
          appId,
          'CUSTOMER_LIVE_PHOTO',
          body?.applicantType || 'BORROWER',
          'VERIFIED',
          fileName,
          file.originalname || fileName,
          relativePath,
          fileUrl,
          'image/jpeg',
          file.size || 0,
          body?.source || 'PROFILE_DETAILS',
          lat,
          lon,
          acc,
          body?.formattedAddress || null,
          body?.city || null,
          body?.state || null,
          body?.country || 'India',
          body?.postalCode || null,
          capturedAtDate,
          body?.faceLivenessStatus || 'VERIFIED',
          scoreVal,
          body?.faceLivenessProviderApplicationId || null,
          metadataJson,
        );

        const insertedRows: any[] = await tx.$queryRawUnsafe(
          `SELECT \`id\`, \`customer_id\` AS customerId, \`application_id\` AS applicationId, \`document_type\` AS documentType, \`applicant_type\` AS applicantType, \`status\`, \`file_name\` AS fileName, \`original_file_name\` AS originalFileName, \`file_path\` AS filePath, \`file_url\` AS fileUrl, \`mime_type\` AS mimeType, \`file_size\` AS fileSize, \`source\`, \`latitude\`, \`longitude\`, \`accuracy\`, \`formatted_address\` AS formattedAddress, \`city\`, \`state\`, \`country\`, \`postal_code\` AS postalCode, \`captured_at\` AS capturedAt, \`uploaded_at\` AS uploadedAt, \`face_liveness_status\` AS faceLivenessStatus, \`face_liveness_score\` AS faceLivenessScore, \`face_liveness_provider_app_id\` AS faceLivenessProviderApplicationId, \`metadata_json\` AS metadataJson, \`created_at\` AS createdAt, \`updated_at\` AS updatedAt FROM \`pl_customer_documents\` WHERE \`id\` = LAST_INSERT_ID()`,
        );

        await tx.$executeRawUnsafe(
          `UPDATE \`customers\` SET \`last_activity_at\` = NOW(0) WHERE \`id\` = ?`,
          customerId,
        );

        return insertedRows[0];
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

  async getCustomerLivePhoto(customerIdInput: string | number) {
    const customerId = BigInt(customerIdInput);

    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT \`id\`, \`customer_id\` AS customerId, \`application_id\` AS applicationId, \`document_type\` AS documentType, \`applicant_type\` AS applicantType, \`status\`, \`file_name\` AS fileName, \`original_file_name\` AS originalFileName, \`file_path\` AS filePath, \`file_url\` AS fileUrl, \`mime_type\` AS mimeType, \`file_size\` AS fileSize, \`source\`, \`latitude\`, \`longitude\`, \`accuracy\`, \`formatted_address\` AS formattedAddress, \`city\`, \`state\`, \`country\`, \`postal_code\` AS postalCode, \`captured_at\` AS capturedAt, \`uploaded_at\` AS uploadedAt, \`face_liveness_status\` AS faceLivenessStatus, \`face_liveness_score\` AS faceLivenessScore, \`face_liveness_provider_app_id\` AS faceLivenessProviderApplicationId, \`metadata_json\` AS metadataJson, \`created_at\` AS createdAt, \`updated_at\` AS updatedAt FROM \`pl_customer_documents\` WHERE \`customer_id\` = ? AND \`document_type\` = 'CUSTOMER_LIVE_PHOTO' AND \`status\` = 'VERIFIED' ORDER BY \`created_at\` DESC LIMIT 1`,
      customerId,
    );

    if (!rows || rows.length === 0) {
      return {
        success: true,
        data: null,
      };
    }

    return {
      success: true,
      data: this.serializeDocument(rows[0]),
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
    };
  }
}
