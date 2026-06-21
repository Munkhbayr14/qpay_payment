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
import { EmailService } from '../email/email.service';

@Injectable()
export class QpayService {
  private readonly logger = new Logger(QpayService.name);
  private readonly payUrl = process.env.PAY_URL;

  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(QpayPayment)
    private readonly paymentRepo: EntityRepository<QpayPayment>,
    @InjectRepository(QpayRequestLog)
    private readonly logRepo: EntityRepository<QpayRequestLog>,
    private readonly emailService: EmailService,
  ) { }

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
    metadata?: string;
  }): Promise<QpayPayment> {
    let payment = await this.paymentRepo.findOne({ invoiceId: data.invoiceId });

    if (!payment) {
      payment = new QpayPayment();
      payment.orderId = data.orderId ?? '';
      payment.invoiceId = data.invoiceId;
      payment.amount = data.amount ?? 0;
      payment.metadata = data.metadata;
      payment.createdAt = new Date();
    }

    if (data.orderId !== undefined && data.orderId !== '') payment.orderId = data.orderId;
    if (data.amount !== undefined) payment.amount = data.amount;
    if (data.qpayShortUrl !== undefined) payment.qpayShortUrl = data.qpayShortUrl;
    if (data.status !== undefined) payment.status = data.status;
    if (data.paid !== undefined) payment.paid = data.paid;
    if (data.paidAmount !== undefined) payment.paidAmount = data.paidAmount;
    if (data.paymentId !== undefined) payment.paymentId = data.paymentId;
    if (data.paidAt !== undefined) payment.paidAt = data.paidAt;
    if (data.metadata !== undefined) payment.metadata = data.metadata;
    if (data.callbackReceivedAt !== undefined) payment.callbackReceivedAt = data.callbackReceivedAt;

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

  // ─── 1. Access Token авах ─────────────────────────────────────────────────

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) {
      return this.accessToken;
    }

    this.accessToken = null;
    this.tokenExpiresAt = 0;

    const username = this.configService.get<string>('QPAY_USERNAME');
    const password = this.configService.get<string>('QPAY_PASSWORD');

    if (!username || !password) {
      this.logger.error('QPAY_USERNAME эсвэл QPAY_PASSWORD .env-д тохируулаагүй байна!');
      throw new InternalServerErrorException('QPay credentials тохиргоогүй байна');
    }

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

      if (!data.access_token) {
        throw new Error('QPay-с хоосон token ирлээ');
      }

      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;

      this.logger.log(`QPay token амжилттай авлаа, expires_in=${data.expires_in ?? 3600}s`);
      return this.accessToken;
    } catch (error) {
      const err = error as any;
      this.logger.error('QPay token авахад алдаа:', err?.response?.data ?? err?.message);
      throw new InternalServerErrorException('QPay authentication амжилтгүй боллоо');
    }
  }

  // ─── 2. Checkout боловсруулах ─────────────────────────────────────────────

  async processCheckout(checkoutDto: any) {
    const callbackUrl = checkoutDto.callbackUrl || 'https://pay.driftub.store/qpay/callback';

    const customerMeta = {
      email: checkoutDto.email || '',
      first_name: checkoutDto.first_name || checkoutDto.firstName || '',
      last_name: checkoutDto.last_name || checkoutDto.lastName || '',
      phone: checkoutDto.phone || '',
      address: checkoutDto.address || '',
      city: checkoutDto.city || '',
      product_details: checkoutDto.product_details || checkoutDto.productDetails || '',
      items: checkoutDto.items || [],
    };

    return this.createInvoice(
      checkoutDto.orderId,
      checkoutDto.amount,
      callbackUrl,
      checkoutDto.description,
      customerMeta,
    );
  }

  // ─── 3. Invoice үүсгэх ────────────────────────────────────────────────────

  async createInvoice(
    orderId: string,
    amount: any,
    callbackUrl: string,
    description?: string,
    customerMeta?: Record<string, any>,
  ): Promise<QpayInvoiceResponse> {
    return this._createInvoiceWithRetry(orderId, amount, callbackUrl, description, false, customerMeta);
  }

  private async _createInvoiceWithRetry(
    orderId: string,
    amount: any,
    callbackUrl: string,
    description: string | undefined,
    isRetry: boolean,
    customerMeta?: Record<string, any>,
  ): Promise<QpayInvoiceResponse> {
    const token = await this.getAccessToken(isRetry);
    const invoiceCode = this.configService.get<string>('QPAY_INVOICE_CODE') || 'ORDER_INVOICE';

    const cleanOrderId = String(orderId).trim().substring(0, 45);
    const cleanAmount = Math.round(Number(amount));
    const fallback = `driftub:${cleanOrderId} ${cleanAmount}`;

    const safeDescription =
      description && description.length <= 240 ? description : fallback;

    if (description && description.length > 240) {
      this.logger.warn('invoice_description урт хэтэрсэн тул товчилж байна');
    }

    const body: CreateInvoiceDto = {
      invoice_code: invoiceCode,
      sender_invoice_no: cleanOrderId,
      invoice_receiver_code: 'terminal',
      invoice_description: safeDescription,
      sender_branch_code: 'ONLINE',
      amount: cleanAmount,
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

      const metadataStr = customerMeta
        ? JSON.stringify(customerMeta)
        : (description ?? fallback);

      // ЗАСВАР: status='PENDING' — PAID биш, зөвхөн callback-д л PAID болно
      await this.upsertPayment({
        orderId: cleanOrderId,
        invoiceId: data.invoice_id,
        amount: cleanAmount,
        qpayShortUrl: data.qPay_shortUrl,
        status: 'PENDING',
        paid: false,
        metadata: metadataStr,
      });

      await this.logRequest(
        await this.paymentRepo.findOneOrFail({ invoiceId: data.invoice_id }),
        'CREATE_INVOICE', body, data, 'Invoice үүсгэх хүсэлт',
      );
      return data;
    } catch (error) {
      const err = error as any;
      const status = err?.response?.status;

      if (status === 401 && !isRetry) {
        this.logger.warn('Invoice 401 авлаа — token шинэчилж retry хийж байна...');
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        return this._createInvoiceWithRetry(orderId, amount, callbackUrl, description, true, customerMeta);
      }

      this.logger.error(
        `Invoice үүсгэхэд алдаа: order=${cleanOrderId}`,
        err?.response?.data ?? err?.message,
      );
      throw new InternalServerErrorException('QPay invoice үүсгэхэд алдаа гарлаа');
    }
  }

  // ─── 4. Төлбөр шалгах ────────────────────────────────────────────────────
  // ЗАСВАР: status шинэчлэхгүй — зөвхөн paid/paidAmount хадгална
  // Status-г зөвхөн registerCallback-д л PAID болгоно

  // ─── 4. Төлбөр шалгах ────────────────────────────────────────────────────
  async checkPayment(
    invoiceId: string,
    isRetry = false,
  ): Promise<{ paid: boolean; data: QpayPaymentCheckResponse }> {
    const token = await this.getAccessToken(isRetry);

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

      const isPaid = data.count > 0 && data.rows.some((r) => r.payment_status === 'PAID');
      const existing = await this.paymentRepo.findOne({ invoiceId });

      // Зөвхөн төлөв болон paid state хадгална — email/Shopify энд байхгүй
      await this.upsertPayment({
        orderId: existing?.orderId,
        invoiceId,
        amount: existing?.amount,
        qpayShortUrl: existing?.qpayShortUrl,
        paid: isPaid,
        paidAmount: data.paid_amount,
        paymentId: existing?.paymentId,
        paidAt: isPaid ? new Date() : existing?.paidAt,
        // ⚠️ Status-г энд ӨӨРЧЛӨХГҮЙ — registerCallback л өөрчилнө
        status: existing?.status || 'PENDING',
      });

      this.logger.log(`Төлбөрийн төлөв: invoice_id=${invoiceId}, paid=${isPaid}`);
      return { paid: isPaid, data };
    } catch (error) {
      const err = error as any;

      if (err?.response?.status === 401 && !isRetry) {
        this.logger.warn('checkPayment 401 — token шинэчилж retry хийж байна...');
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        return this.checkPayment(invoiceId, true);
      }

      this.logger.error(
        `Төлбөр шалгахад алдаа: invoice_id=${invoiceId}`,
        err?.response?.data ?? err?.message,
      );
      throw new InternalServerErrorException('QPay төлбөр шалгахад алдаа гарлаа');
    }
  }

  // ─── 5. Callback — төлбөр батлагдсан үед email илгээнэ ───────────────────

  // ─── 5. Callback — Төгс зассан хувилбар ───────────────────

  async registerCallback(body: Record<string, any>): Promise<void> {
    const invoiceId = body.invoice_id || body.payment_id;

    const result = await this.checkPayment(invoiceId);
    const existing = await this.paymentRepo.findOne({ invoiceId });

    if (!existing) {
      this.logger.error(`Callback: датабаазаас бичлэг олдсонгүй: ${invoiceId}`);
      return;
    }

    this.logger.log(`Callback: invoice=${invoiceId}, QPay paid=${result.paid}, DB status=${existing.status}`);

    if (result.paid && existing.status === 'PENDING') {
      this.logger.log(`Төлбөр батлагдлаа: ${invoiceId} — Боловсруулж байна...`);

      // 1. Metadata-аас датагаа унших
      let meta: Record<string, any> = {};
      try {
        meta = existing.metadata ? JSON.parse(existing.metadata) : {};
      } catch {
        this.logger.warn('metadata JSON parse амжилтгүй боллоо');
      }

      // 2. И-мэйл хаягийг маш цэвэрхэн болгож авах (Хоосон зайг устгах .trim())
      let customerEmail = meta.email || '';
      if (customerEmail) {
        customerEmail = customerEmail.trim().toLowerCase();
      }

      // 3. И-МЭЙЛИЙГ ТҮРҮҮЛЖ ИЛГЭЭХ (Shopify-оос болж гацахгүй байх хамгаалалт)
      try {
        await this.emailService.sendOrderConfirmation({
          orderId: existing.orderId,
          amount: existing.amount,
          email: customerEmail || undefined,
          first_name: meta.first_name || meta.firstName || '',
          last_name: meta.last_name || meta.lastName || '',
          address: meta.address || '',
          city: meta.city || '',
          phone: meta.phone || '',
          product_details: meta.product_details || meta.productDetails || '',
          items: Array.isArray(meta.items) ? meta.items : [],
          invoice_id: existing.invoiceId,
          qpay_short_url: existing.qpayShortUrl,
          paid_amount: result.data?.paid_amount ?? existing.paidAmount,
        });

        this.logger.log(`Email амжилттай илгээлээ: ${customerEmail || 'зөвхөн admin'}`);
      } catch (err) {
        // Хэрэв и-мэйл илгээхэд алдаа гарвал энд барьж авна, доорх кодууд хэвийн үргэлжилнэ!
        this.logger.error(`И-мэйл илгээх урсгалд бодит алдаа гарлаа: `);
      }

      // 4. SHOPIFY ЗАХИАЛГА ҮҮСГЭХ УРСГАЛ
      try {
        await this.createShopifyOrder(existing);
      } catch (shopErr) {
        this.logger.error(`Shopify урсгал гацсан ч и-мэйл явсан тул санаа зоволтгүй: $`);
      }
    }

    // 5. Эцэст нь DB статус заавал PAID болно
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

    await this.logRequest(payment, 'CALLBACK', body, result.data, 'QPay callback бүртгв');
  }

  // ─── 6. Invoice цуцлах ────────────────────────────────────────────────────

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

  // ─── 7. Shopify захиалга үүсгэх ──────────────────────────────────────────

  async createShopifyOrder(payment: QpayPayment) {
    const storeDomain = this.configService.get<string>('SHOPIFY_STORE_DOMAIN');
    const accessToken = this.configService.get<string>('SHOPIFY_ACCESS_TOKEN');

    if (!storeDomain || !accessToken) {
      this.logger.error('Shopify тохиргоо дутуу байна');
      throw new InternalServerErrorException('Shopify тохиргооны алдаа');
    }

    const url = `https://${storeDomain}/admin/api/2026-04/orders.json`;

    const orderPayload = {
      order: {
        note: `QPay-ээр төлөгдсөн. Захиалгын ID: ${payment.orderId}`,
        financial_status: 'paid',
        line_items: [{
          title: 'QPay Төлбөр',
          price: payment.amount,
          quantity: 1,
        }],
      },
    };

    try {
      this.logger.log('Shopify руу захиалга илгээж байна...');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(`Shopify API Error: ${JSON.stringify(data)}`);
        throw new Error(JSON.stringify(data));
      }

      this.logger.log(`Shopify захиалга амжилттай үүслээ: ${data.order.id}`);
      return data;
    } catch (error) {
      this.logger.error('Shopify захиалга үүсгэхэд алдаа:', error);
      throw new InternalServerErrorException('Shopify захиалга үүсгэж чадсангүй');
    }
  }
}