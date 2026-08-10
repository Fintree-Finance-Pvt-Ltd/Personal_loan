import { Test, TestingModule } from '@nestjs/testing';
import { PlatformProductsController } from './platform-products.controller';
import { PlatformProductsService } from './platform-products.service';

describe('PlatformProductsController', () => {
  let controller: PlatformProductsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformProductsController],
      providers: [{ provide: PlatformProductsService, useValue: {} }],
    }).compile();

    controller = module.get<PlatformProductsController>(PlatformProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
