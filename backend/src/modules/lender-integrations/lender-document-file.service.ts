import {
  Injectable,
} from '@nestjs/common';
import {
  ConfigService,
} from '@nestjs/config';
import {
  createHash,
} from 'crypto';
import {
  promises as fs,
} from 'fs';
import path from 'path';

import {
  LenderIntegrationError,
} from './lender-integration.errors';

const MAX_ORIGINAL_FILE_BYTES =
  3_670_016; // 3.5 MiB

@Injectable()
export class LenderDocumentFileService {
  constructor(
    private readonly config:
      ConfigService,
  ) {}

  async loadDocument(
    input: {
      filePath: string;
      declaredMimeType: string;
    },
  ): Promise<{
    bytes: Buffer;
    fileSize: number;
    mimeType: string;
    fileSha256: string;
    contentBase64: string;
  }> {
    const configuredRoot =
      this.config.get<string>(
        'PL_DOCUMENT_UPLOAD_ROOT',
      );

    if (!configuredRoot) {
      throw new LenderIntegrationError(
        'DOCUMENT_UPLOAD_ROOT_NOT_CONFIGURED',
        'Document upload root is not configured.',
        'AUTHENTICATION_CONFIGURATION',
      );
    }

    const rootPath =
      await fs.realpath(
        path.resolve(
          configuredRoot,
        ),
      );

    const requestedPath =
      path.isAbsolute(
        input.filePath,
      )
        ? path.resolve(
            input.filePath,
          )
        : path.resolve(
            rootPath,
            input.filePath,
          );

    let actualPath: string;

    try {
      actualPath =
        await fs.realpath(
          requestedPath,
        );
    } catch {
      throw new LenderIntegrationError(
        'LENDER_DOCUMENT_FILE_NOT_FOUND',
        'The stored document file was not found.',
        'PERMANENT_VALIDATION',
      );
    }

    const isInsideRoot =
      actualPath === rootPath ||
      actualPath.startsWith(
        `${rootPath}${path.sep}`,
      );

    if (!isInsideRoot) {
      throw new LenderIntegrationError(
        'LENDER_DOCUMENT_PATH_BLOCKED',
        'Document path is outside the approved upload root.',
        'PERMANENT_VALIDATION',
      );
    }

    const stat =
      await fs.stat(
        actualPath,
      );

    if (!stat.isFile()) {
      throw new LenderIntegrationError(
        'LENDER_DOCUMENT_NOT_A_FILE',
        'The stored document path is not a file.',
        'PERMANENT_VALIDATION',
      );
    }

    if (
      stat.size >
      MAX_ORIGINAL_FILE_BYTES
    ) {
      throw new LenderIntegrationError(
        'LENDER_DOCUMENT_TOO_LARGE',
        'The original lender document exceeds the 3.5 MiB limit.',
        'PERMANENT_VALIDATION',
      );
    }

    const bytes =
      await fs.readFile(
        actualPath,
      );

    if (
      bytes.length >
      MAX_ORIGINAL_FILE_BYTES
    ) {
      throw new LenderIntegrationError(
        'LENDER_DOCUMENT_TOO_LARGE',
        'The original lender document exceeds the 3.5 MiB limit.',
        'PERMANENT_VALIDATION',
      );
    }

    const mimeType =
      input.declaredMimeType
        .trim()
        .toLowerCase();

    this.validateFileSignature(
      bytes,
      mimeType,
    );

    const fileSha256 =
      createHash('sha256')
        .update(bytes)
        .digest('hex');

    return {
      bytes,

      fileSize:
        bytes.length,

      mimeType,

      fileSha256,

      contentBase64:
        bytes.toString(
          'base64',
        ),
    };
  }

  private validateFileSignature(
    bytes:
      Buffer,

    mimeType:
      string,
  ): void {
    if (
      mimeType ===
      'application/pdf'
    ) {
      if (
        bytes
          .subarray(0, 5)
          .toString('ascii') !==
        '%PDF-'
      ) {
        throw new LenderIntegrationError(
          'LENDER_DOCUMENT_MIME_MISMATCH',
          'The stored file is not a valid PDF.',
          'PERMANENT_VALIDATION',
        );
      }

      return;
    }

    if (
      mimeType ===
        'application/xml' ||
      mimeType ===
        'text/xml'
    ) {
      const beginning =
        bytes
          .subarray(
            0,
            Math.min(
              bytes.length,
              512,
            ),
          )
          .toString('utf8')
          .replace(/^\uFEFF/, '')
          .trimStart();

      if (
        !beginning.startsWith('<')
      ) {
        throw new LenderIntegrationError(
          'LENDER_DOCUMENT_MIME_MISMATCH',
          'The stored file is not valid XML.',
          'PERMANENT_VALIDATION',
        );
      }

      return;
    }

    throw new LenderIntegrationError(
      'LENDER_DOCUMENT_MIME_UNSUPPORTED',
      'The document MIME type is not supported for Fintree upload.',
      'PERMANENT_VALIDATION',
    );
  }
}