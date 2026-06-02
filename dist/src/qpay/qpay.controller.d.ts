import type { Response } from 'express';
import { QpayService } from './qpay.service';
declare class CreateInvoiceRequest {
    orderId: string;
    amount: number;
    callbackUrl: string;
}
export declare class QpayController {
    private readonly qpayService;
    private readonly logger;
    private readonly baseUrl;
    constructor(qpayService: QpayService);
    createInvoice(body: CreateInvoiceRequest): Promise<{
        success: boolean;
        invoice_id: string;
        qr_image: string;
        qr_text: string;
        short_url: string;
        bank_urls: import("./interface/qpay.interface").QpayInvoiceUrl[];
    }>;
    checkPayment(invoiceId: string): Promise<{
        success: boolean;
        paid: boolean;
    }>;
    handleCallback(body: Record<string, any>): Promise<{
        received: boolean;
    }>;
    cancelInvoice(invoiceId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    handleCheckout(query: Record<string, any>, res: Response): Promise<Response<any, Record<string, any>>>;
}
export {};
