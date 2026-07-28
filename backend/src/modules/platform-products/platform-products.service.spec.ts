import { Test, TestingModule } from '@nestjs/testing';
import { PlatformProductsService } from './platform-products.service';

describe('PlatformProductsService', () => {
  let service: PlatformProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlatformProductsService],
    }).compile();

    service = module.get<PlatformProductsService>(PlatformProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
