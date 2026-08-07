import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductCalculationService } from './product-calculation.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductCalculationService],
  exports: [ProductCalculationService],
})
export class ProductsModule {}
