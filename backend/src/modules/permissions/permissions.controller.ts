import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { z } from 'zod';

const permissionsQuerySchema = z.object({
  search: z.string().max(100).optional(),
  module: z.string().max(80).optional(),
});

@Controller('admin/permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Permissions('PERMISSION_READ')
  @Get()
  async list(@Query() query: unknown) {
    const parsed = permissionsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        error: { code: 'INVALID_REQUEST', message: 'Invalid query parameters.' }
      });
    }
    return this.permissions.getPermissions(parsed.data);
  }
}
