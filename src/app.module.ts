import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import type { Options } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';

import { QpayModule } from './qpay/qpay.module';
import { QpayPayment } from './qpay/entities/qpay-payment.entity';
import { QpayRequestLog } from './qpay/entities/qpay-request-log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MikroOrmModule.forRootAsync({
      useFactory: (): Options => ({
        driver: PostgreSqlDriver,
        host: process.env.DB_HOST, 
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        dbName: process.env.DB_NAME,
        entities: [QpayPayment, QpayRequestLog],
        allowGlobalContext: true,
        debug: process.env.NODE_ENV !== 'production',
      }),
    }),
    QpayModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
