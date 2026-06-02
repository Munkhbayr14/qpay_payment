import { Module } from '@nestjs/common';

import { QpayModule } from './qpay/qpay.module';
import { ConfigModule } from '@nestjs/config'
@Module({
  imports: [ ConfigModule.forRoot({ isGlobal: true }),
    QpayModule,],
  controllers: [],
  providers: [],
})
export class AppModule {}
