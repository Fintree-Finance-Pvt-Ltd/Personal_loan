import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SigningStorageService {
  private readonly logger = new Logger(SigningStorageService.name);
  private readonly baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), 'uploads', 'customer-documents', 'electronic-sign');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  getYearMonthDir(): string {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const targetDir = path.join(this.baseDir, year, month);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    return targetDir;
  }

  saveBuffer(filename: string, buffer: Buffer): string {
    const targetDir = this.getYearMonthDir();
    const fullPath = path.join(targetDir, filename);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  }

  readBuffer(filePath: string): Buffer {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Document file not found at path: ${filePath}`);
    }
    return fs.readFileSync(filePath);
  }

  deleteFile(filePath: string): void {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err: any) {
        this.logger.warn(`Could not delete temp file ${filePath}: ${err?.message}`);
      }
    }
  }
}
