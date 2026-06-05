import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { firstValueFrom } from 'rxjs';
import {
  QpayTokenResponse,
  QpayInvoiceResponse,
  QpayPaymentCheckResponse,
  CreateInvoiceDto,
} from './interface/qpay.interface';
import { QpayPayment } from './entities/qpay-payment.entity';
import { QpayRequestLog } from './entities/qpay-request-log.entity';

@Injectable()
export class QpayService {
  private readonly logger = new Logger(QpayService.name);
  private readonly payUrl = process.env.PAY_URL;

  // Token cache — production дээр Redis ашиглахыг зөвлөнө
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(QpayPayment)
    private readonly paymentRepo: EntityRepository<QpayPayment>,
    @InjectRepository(QpayRequestLog)
    private readonly logRepo: EntityRepository<QpayRequestLog>,
  ) {}

  private safeJson(value: any): string | undefined {
    try {
      return value !== undefined ? JSON.stringify(value) : undefined;
    } catch {
      return String(value);
    }
  }

  private async upsertPayment(data: {
    orderId?: string;
    invoiceId: string;
    amount?: number;
    qpayShortUrl?: string;
    status?: string;
    paid?: boolean;
    paidAmount?: number;
    paymentId?: string;
    paidAt?: Date;
    callbackReceivedAt?: Date;
  }): Promise<QpayPayment> {
    let payment = await this.paymentRepo.findOne({ invoiceId: data.invoiceId });

    if (!payment) {
      payment = new QpayPayment();
      payment.orderId = data.orderId ?? '';
      payment.invoiceId = data.invoiceId;
      payment.amount = data.amount ?? 0;
      payment.createdAt = new Date();
    }

    if (data.orderId !== undefined && data.orderId !== '') {
      payment.orderId = data.orderId;
    }
    if (data.amount !== undefined) {
      payment.amount = data.amount;
    }
    if (data.qpayShortUrl !== undefined) {
      payment.qpayShortUrl = data.qpayShortUrl;
    }
    if (data.status !== undefined) {
      payment.status = data.status;
    }
    if (data.paid !== undefined) {
      payment.paid = data.paid;
    }
    if (data.paidAmount !== undefined) {
      payment.paidAmount = data.paidAmount;
    }
    if (data.paymentId !== undefined) {
      payment.paymentId = data.paymentId;
    }
    if (data.paidAt !== undefined) {
      payment.paidAt = data.paidAt;
    }
    if (data.callbackReceivedAt !== undefined) {
      payment.callbackReceivedAt = data.callbackReceivedAt;
    }

    payment.updatedAt = new Date();
    await this.paymentRepo.getEntityManager().persistAndFlush(payment);
    return payment;
  }

  private async logRequest(
    payment: QpayPayment,
    type: string,
    request: any,
    response: any,
    note?: string,
  ): Promise<QpayRequestLog> {
    const log = new QpayRequestLog();
    log.payment = payment;
    log.type = type;
    log.requestPayload = this.safeJson(request);
    log.responsePayload = this.safeJson(response);
    log.note = note;
    await this.logRepo.getEntityManager().persistAndFlush(log);
    return log;
  }

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
          `${this.payUrl}/auth/token`,
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
    orderId: string, // ЗАСВАР: Төрлийг уян хатан болгов
    amount: any,  // ЗАСВАР: Төрлийг уян хатан болгов
    callbackUrl: string,
  ): Promise<QpayInvoiceResponse> {
    const token = await this.getAccessToken();
    const invoiceCode = this.configService.get<string>('QPAY_INVOICE_CODE') || 'ORDER_INVOICE';

    const cleanOrderId = String(orderId).trim().substring(0, 45); 
    const cleanAmount = Math.round(Number(amount));

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
          `${this.payUrl}/invoice`,
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

      const payment = await this.upsertPayment({
        orderId: cleanOrderId,
        invoiceId: data.invoice_id,
        amount: cleanAmount,
        qpayShortUrl: data.qPay_shortUrl,
        status: 'PENDING',
        paid: false,
      });

      await this.logRequest(payment, 'CREATE_INVOICE', body, data, 'Invoice үүсгэх хүсэлт');
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
          `${this.payUrl}/payment/check`,
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

      const existing = await this.paymentRepo.findOne({ invoiceId });
      const payment = await this.upsertPayment({
        orderId: existing?.orderId,
        invoiceId,
        amount: existing?.amount,
        qpayShortUrl: existing?.qpayShortUrl,
        status: paid ? 'PAID' : 'PENDING',
        paid,
        paidAmount: data.paid_amount,
        paymentId: existing?.paymentId,
        paidAt: paid ? new Date() : existing?.paidAt,
      });

      await this.logRequest(payment, 'CHECK_PAYMENT', { invoiceId }, data, 'Төлбөр шалгах хүсэлт');
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

async registerCallback(body: Record<string, any>): Promise<void> {
    const invoiceId = body.invoice_id || body.payment_id;
    const result = await this.checkPayment(invoiceId);
    const existing = await this.paymentRepo.findOne({ invoiceId });

    // 1. ШАЛГАЛТ: Хэрэв existing олдоогүй бол цааш үргэлжлүүлэхгүй
    if (!existing) {
      this.logger.error(`Callback ирсэн боловч датабаазаас бичлэг олдсонгүй: ${invoiceId}`);
      return;
    }

    // 2. Хэрэв төлбөр төлөгдсөн бөгөөд өмнө нь захиалга үүсгээгүй бол (status !== 'PAID')
    // Одоо existing нь null биш гэдгийг TypeScript баттай мэдэж байна
    if (result.paid && existing.status !== 'PAID') {
      await this.createShopifyOrder(existing);
    }

    // 3. Үргэлжлүүлэн өгөгдлөө шинэчлэх
    const payment = await this.upsertPayment({
      orderId: existing.orderId,
      invoiceId,
      amount: existing.amount,
      qpayShortUrl: existing.qpayShortUrl,
      paymentId: body.qpay_payment_id ?? body.payment_id ?? invoiceId,
      status: result.paid ? 'PAID' : 'UNPAID',
      paid: result.paid,
      paidAmount: result.data.paid_amount,
      paidAt: result.paid ? new Date() : existing.paidAt,
      callbackReceivedAt: new Date(),
    });

    await this.logRequest(payment, 'CALLBACK', body, result.data, 'QPay callback ирж бүртгэв');
  }

  // ─── 4. Invoice цуцлах ────────────────────────────────────────────────────

  async cancelInvoice(invoiceId: string): Promise<void> {
    const token = await this.getAccessToken();

    try {
      await firstValueFrom(
        this.httpService.delete(`${this.payUrl}/invoice/${invoiceId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      const existing = await this.paymentRepo.findOne({ invoiceId });
      if (existing) {
        const payment = await this.upsertPayment({
          orderId: existing.orderId,
          invoiceId,
          amount: existing.amount,
          status: 'CANCELLED',
          paid: false,
          paymentId: existing.paymentId,
        });
        await this.logRequest(payment, 'CANCEL_INVOICE', { invoiceId }, null, 'Invoice цуцлах хүсэлт');
      }

      this.logger.log(`Invoice цуцлагдлаа: ${invoiceId}`);
    } catch (error) {
      const err = error as any;
      this.logger.error(`Invoice цуцлахад алдаа: ${invoiceId}`, err?.response?.data ?? err?.message);
      throw new InternalServerErrorException('Invoice цуцлахад алдаа гарлаа');
    }
  }
async createShopifyOrder(payment: QpayPayment) {
    const storeDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
    const accessToken = this.configService.get<string>('SHOPIFY_ACCESS_TOKEN');

    // Хэрэв тохиргоо байхгүй бол шууд алдаа шидэх (Аюулгүй байдал)
    if (!storeDomain || !accessToken) {
      this.logger.error('Shopify тохиргоо дутуу байна: Domain эсвэл Access Token олдсонгүй');
      throw new InternalServerErrorException('Shopify тохиргооны алдаа');
    }
    
    const url = `https://${storeDomain}/admin/api/2026-04/orders.json`;

    const orderPayload = {
      order: {
        note: `QPay-ээр төлөгдсөн. Сагсны ID: ${payment.orderId}`,
        financial_status: "paid",
        line_items: [
          {
            title: "QPay Төлбөр",
            price: payment.amount,
            quantity: 1
          }
        ]
      }
    };

    try {
      this.logger.log(`Shopify руу захиалга илгээж байна...`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          // Энд accessToken нь дээрх if-ээр шалгагдсан тул string гэдэг нь тодорхой болно
          'X-Shopify-Access-Token': accessToken, 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        // Shopify-аас ирсэн алдааны мессежийг нарийн харах
        this.logger.error(`Shopify API Error: ${JSON.stringify(data)}`);
        throw new Error(JSON.stringify(data));
      }

      this.logger.log(`Shopify захиалга амжилттай үүслээ: ${data.order.id}`);
      return data;
    } catch (error) {
      this.logger.error('Shopify дээр захиалга үүсгэхэд алдаа гарлаа', error);
      throw new InternalServerErrorException('Shopify захиалга үүсгэж чадсангүй');
    }
  }
}