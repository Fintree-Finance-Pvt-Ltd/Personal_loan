import { Module } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { ExternalApiModule } from '../external-api/external-api.module';

@Module({
  // For FaceMatchService, backing the manual re-run endpoint.
  imports: [ExternalApiModule],
  providers: [ApplicationsService],
  controllers: [ApplicationsController],
})
export class ApplicationsModule {}
