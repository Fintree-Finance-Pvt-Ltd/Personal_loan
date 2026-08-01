import { Test, TestingModule } from '@nestjs/testing';
import { PlatformProductsService } from './platform-products.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

describe('PlatformProductsService', () => {
  let service: PlatformProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformProductsService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditLogsService, useValue: {} },
      ],
    }).compile();

    service = module.get<PlatformProductsService>(PlatformProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
