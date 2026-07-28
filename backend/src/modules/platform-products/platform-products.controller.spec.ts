import { Test, TestingModule } from '@nestjs/testing';
import { PlatformProductsController } from './platform-products.controller';

describe('PlatformProductsController', () => {
  let controller: PlatformProductsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformProductsController],
    }).compile();

    controller = module.get<PlatformProductsController>(PlatformProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
