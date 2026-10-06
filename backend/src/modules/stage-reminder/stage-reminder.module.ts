import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { StageReminderRedisService } from './stage-reminder-redis.service';
import { StageResolverService } from './stage-resolver.service';
import { StageReminderQueueService } from './stage-reminder-queue.service';
import { StageReminderWorker } from './stage-reminder.worker';
import { StageReminderController } from './stage-reminder.controller';

@Module({
  imports: [ConfigModule, PrismaModule, WhatsAppModule],
  controllers: [StageReminderController],
  providers: [
    StageReminderRedisService,
    StageResolverService,
    StageReminderQueueService,
    StageReminderWorker,
  ],
  exports: [StageReminderQueueService, StageResolverService],
})
export class StageReminderModule {}
