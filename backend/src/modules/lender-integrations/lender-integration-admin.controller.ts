import { Controller, Param, Post } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { LenderIntegrationOutboxService } from './lender-integration-outbox.service';

@Controller('admin/lender-integrations')
export class LenderIntegrationAdminController {
  constructor(private readonly outbox: LenderIntegrationOutboxService) {}

  @Permissions('LENDER_UPDATE')
  @Post('events/:id/replay')
  replay(@Param('id') id: string) {
    return this.outbox.replayFailedEvent(id);
  }
}
