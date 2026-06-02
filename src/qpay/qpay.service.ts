import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  QpayTokenResponse,
  QpayInvoiceResponse,
  QpayPaymentCheckResponse,
  CreateInvoiceDto,
} from './interface/qpay.interface';

@Injectable()
export class QpayService {
  private readonly logger = new Logger(QpayService.name);
  private readonly baseUrl = 'https://merchant.qpay.mn/v2';

  // Token cache — production дээр Redis ашиглахыг зөвлөнө
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // ─── 1. Access Token авах ──────────────────────────────────────────────────

  async getAccessToken(): Promise<string> {
    // Token хүчинтэй байвал cache-ээс буцаа (30 секунд нөөцтэй)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) {
      return this.accessToken;
    }

    const username = this.configService.get<string>('QPAY_USERNAME');
    const password = this.configService.get<string>('QPAY_PASSWORD');
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    try {
      this.logger.log('QPay access token авж байна...');

      const { data } = await firstValueFrom(
        this.httpService.post<QpayTokenResponse>(
          `${this.baseUrl}/auth/token`,
          {},
          {
            headers: {
              Authorization: `Basic ${credentials}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

      this.logger.log('QPay token амжилттай авлаа');
      return this.accessToken;
    } catch (error) {
      const err = error as any;
      this.logger.error('QPay token авахад алдаа гарлаа', err?.response?.data ?? err?.message);
      throw new InternalServerErrorException('QPay authentication амжилтгүй боллоо');
    }
  }

  // ─── 2. Invoice үүсгэх ────────────────────────────────────────────────────

  async createInvoice(
    orderId: any, // ЗАСВАР: Төрлийг уян хатан болгов
    amount: any,  // ЗАСВАР: Төрлийг уян хатан болгов
    callbackUrl: string,
  ): Promise<QpayInvoiceResponse> {
    const token = await this.getAccessToken();

    const invoiceCode = this.configService.get<string>('QPAY_INVOICE_CODE') || 'ORDER_INVOICE';

    // ЗАСВАР: Shopify-оос ирж буй утгуудыг QPay API-д яг таг тааруулж хөрвүүлнэ
    const cleanOrderId = String(orderId).trim(); // Текст рүү хөрвүүлж хоосон зайг арилгана
    const cleanAmount = Math.round(Number(amount)); // Тоо рүү хөрвүүлээд бутархайг нь бүхэлтгэнэ (QPay бутархай дүнд дургүй)

    const body: CreateInvoiceDto = {
      invoice_code: invoiceCode,
      sender_invoice_no: cleanOrderId, // Цэвэрлэгдсэн ID
      invoice_receiver_code: 'terminal',
      invoice_description: `Order #${cleanOrderId} - ${cleanAmount}₮`,
      sender_branch_code: 'ONLINE',
      amount: cleanAmount, // Заавал тоо (Number) очих ёстой
      callback_url: callbackUrl,
    };

    try {
      this.logger.log(`Invoice үүсгэж байна: order=${cleanOrderId}, amount=${cleanAmount}`);

      const { data } = await firstValueFrom(
        this.httpService.post<QpayInvoiceResponse>(
          `${this.baseUrl}/invoice`,
          body,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.logger.log(`Invoice амжилттай үүслээ: invoice_id=${data.invoice_id}`);
      return data;
    } catch (error) {
      const err = error as any;
      this.logger.error(
        `Invoice үүсгэхэд алдаа: order=${cleanOrderId}`,
        err?.response?.data ?? err?.message,
      );
      throw new InternalServerErrorException('QPay invoice үүсгэхэд алдаа гарлаа');
    }
  }

  // ─── 3. Төлбөр шалгах ────────────────────────────────────────────────────

  async checkPayment(invoiceId: string): Promise<{ paid: boolean; data: QpayPaymentCheckResponse }> {
    const token = await this.getAccessToken();

    try {
      this.logger.log(`Төлбөр шалгаж байна: invoice_id=${invoiceId}`);

      const { data } = await firstValueFrom(
        this.httpService.post<QpayPaymentCheckResponse>(
          `${this.baseUrl}/payment/check`,
          {
            object_type: 'INVOICE',
            object_id: invoiceId,
            offset: { page_number: 1, page_limit: 100 },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const paid = data.count > 0 && data.rows.some((r) => r.payment_status === 'PAID');

      this.logger.log(`Төлбөрийн төлөв: invoice_id=${invoiceId}, paid=${paid}`);
      return { paid, data };
    } catch (error) {
      const err = error as any;
      this.logger.error(
        `Төлбөр шалгахад алдаа: invoice_id=${invoiceId}`,
        err?.response?.data ?? err?.message,
      );
      throw new InternalServerErrorException('QPay төлбөр шалгахад алдаа гарлаа');
    }
  }

  // ─── 4. Invoice цуцлах ────────────────────────────────────────────────────

  async cancelInvoice(invoiceId: string): Promise<void> {
    const token = await this.getAccessToken();

    try {
      await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}/invoice/${invoiceId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      this.logger.log(`Invoice цуцлагдлаа: ${invoiceId}`);
    } catch (error) {
      const err = error as any;
      this.logger.error(`Invoice цуцлахад алдаа: ${invoiceId}`, err?.response?.data ?? err?.message);
      throw new InternalServerErrorException('Invoice цуцлахад алдаа гарлаа');
    }
  }
}