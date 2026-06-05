import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { EntityRepository } from '@mikro-orm/core';
import { QpayInvoiceResponse, QpayPaymentCheckResponse } from './interface/qpay.interface';
import { QpayPayment } from './entities/qpay-payment.entity';
import { QpayRequestLog } from './entities/qpay-request-log.entity';
export declare class QpayService {
    private readonly httpService;
    private readonly configService;
    private readonly paymentRepo;
    private readonly logRepo;
    private readonly logger;
    private readonly payUrl;
    private accessToken;
    private tokenExpiresAt;
    constructor(httpService: HttpService, configService: ConfigService, paymentRepo: EntityRepository<QpayPayment>, logRepo: EntityRepository<QpayRequestLog>);
    private safeJson;
    private upsertPayment;
    private logRequest;
    getAccessToken(): Promise<string>;
    createInvoice(orderId: any, amount: any, callbackUrl: string): Promise<QpayInvoiceResponse>;
    checkPayment(invoiceId: string): Promise<{
        paid: boolean;
        data: QpayPaymentCheckResponse;
    }>;
    registerCallback(body: Record<string, any>): Promise<void>;
    cancelInvoice(invoiceId: string): Promise<void>;
}
