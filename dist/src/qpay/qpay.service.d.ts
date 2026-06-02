import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { QpayInvoiceResponse, QpayPaymentCheckResponse } from './interface/qpay.interface';
export declare class QpayService {
    private readonly httpService;
    private readonly configService;
    private readonly logger;
    private readonly baseUrl;
    private accessToken;
    private tokenExpiresAt;
    constructor(httpService: HttpService, configService: ConfigService);
    getAccessToken(): Promise<string>;
    createInvoice(orderId: any, amount: any, callbackUrl: string): Promise<QpayInvoiceResponse>;
    checkPayment(invoiceId: string): Promise<{
        paid: boolean;
        data: QpayPaymentCheckResponse;
    }>;
    cancelInvoice(invoiceId: string): Promise<void>;
}
