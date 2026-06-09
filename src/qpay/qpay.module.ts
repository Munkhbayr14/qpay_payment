import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { QpayService } from './qpay.service';
import { QpayController } from './qpay.controller';
import { QpayPayment } from './entities/qpay-payment.entity';
import { QpayRequestLog } from './entities/qpay-request-log.entity';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,       // 10 секунд timeout
      maxRedirects: 3,
    }),
    MikroOrmModule.forFeature([QpayPayment, QpayRequestLog]),
    EmailModule
  ],
  controllers: [QpayController],
  providers: [QpayService],
  exports: [QpayService],   // Shopify module-д ашиглах боломжтой
})
export class QpayModule {}