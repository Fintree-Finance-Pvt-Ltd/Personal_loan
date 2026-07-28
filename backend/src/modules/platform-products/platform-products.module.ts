import { Module } from '@nestjs/common';
import { PlatformProductsService } from './platform-products.service';
import { PlatformProductsController } from './platform-products.controller';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  providers: [PlatformProductsService],
  controllers: [PlatformProductsController]
})
export class PlatformProductsModule {}
