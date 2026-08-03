import { Test, TestingModule } from '@nestjs/testing';
import { LenderIntegrationModule } from './lender-integration.module';
import { LenderAdapterRegistry } from './lender-adapter.registry';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Module, Global } from '@nestjs/common';

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class MockPrismaModule {}

describe('LenderIntegrationModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [LenderIntegrationModule, ConfigModule.forRoot(), MockPrismaModule],
    }).compile();
  });

  it('full runtime registry contains FINTREE_FINANCE_V1 and no mock adapters', () => {
    const registry = module.get<LenderAdapterRegistry>(LenderAdapterRegistry);
    const fintree = registry.resolve('FINTREE_FINANCE_V1', '1');
    expect(fintree).toBeDefined();
    expect(fintree.adapterKey).toBe('FINTREE_FINANCE_V1');

    expect(() => registry.resolve('MOCK_LENDER_A_V1', '1')).toThrow();
    expect(() => registry.resolve('MOCK_LENDER_B_V1', '1')).toThrow();
    expect(() => registry.resolve('PARTNER_A_V1', '1')).toThrow();
  });
});
