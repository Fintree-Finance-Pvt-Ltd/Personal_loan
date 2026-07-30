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

  findFileInUploads(filename: string): string | null {
    if (!filename) return null;
    const cleanName = path.basename(filename);

    const searchDir = (dir: string): string | null => {
      if (!fs.existsSync(dir)) return null;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const res = searchDir(full);
          if (res) return res;
        } else if (entry.isFile() && entry.name === cleanName) {
          return full;
        }
      }
      return null;
    };

    return searchDir(this.baseDir);
  }

  readBuffer(filePath: string): Buffer {
    if (filePath && fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }

    // Fallback: Resolve cross-environment path by searching local uploads directory by filename
    if (filePath) {
      const resolvedLocal = this.findFileInUploads(filePath);
      if (resolvedLocal && fs.existsSync(resolvedLocal)) {
        return fs.readFileSync(resolvedLocal);
      }
    }

    throw new Error(`Document file not found at path: ${filePath}`);
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
