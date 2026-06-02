import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { QpayService } from './qpay.service';
import { QpayController } from './qpay.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,       // 10 секунд timeout
      maxRedirects: 3,
    }),
  ],
  controllers: [QpayController],
  providers: [QpayService],
  exports: [QpayService],   // Shopify module-д ашиглах боломжтой
})
export class QpayModule {}