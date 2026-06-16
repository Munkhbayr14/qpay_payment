import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { QpayService } from './qpay.service';
import * as crypto from 'crypto'; // 🔥 HMAC-SHA256 гарын үсэг шалгахад хэрэгтэй

class CreateInvoiceRequest {
  orderId!: string;
  amount!: number;
  callbackUrl!: string;
}

@Controller('qpay')
export class QpayController {
  private readonly logger = new Logger(QpayController.name);
  private readonly baseUrl = process.env.BASE_URL;

  // 🔥 Фронт талтай яг ижилхэн Нууц Түлхүүр (Secret Salt)
  private readonly SECRET_SALT = 'DriftUB_Secure_Salt_2026_Key!';

  private getSecureBaseUrl(): string {
    const url = this.baseUrl || 'https://pay.driftub.store';
    return url.startsWith('http://') ? url.replace('http://', 'https://') : url;
  }

  constructor(private readonly qpayService: QpayService) {}

  @Post('invoice')
  @HttpCode(HttpStatus.CREATED)
  async createInvoice(@Body() body: CreateInvoiceRequest, @Query('cart_token') cartToken: string) {
    this.logger.log(`Ирсэн body мэдээлэл: ${JSON.stringify(body)}`);
    const { amount, callbackUrl } = body;
    if (!cartToken) {
      throw new BadRequestException('Cart token шаардлагатай!');
    }
    const pureToken = cartToken.split('?')[0];
    const invoice = await this.qpayService.createInvoice(pureToken, amount, callbackUrl);
    return {
      success: true,
      invoice_id: invoice.invoice_id,
      qr_image: invoice.qr_image,
      qr_text: invoice.qr_text,
      short_url: invoice.qPay_shortUrl,
      bank_urls: invoice.urls,
    };
  }

  @Get('check/:invoiceId')
  async checkPayment(@Param('invoiceId') invoiceId: string) {
    const result = await this.qpayService.checkPayment(invoiceId);
    return { success: true, paid: result.paid };
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async handleCallback(@Body() body: Record<string, any>) {
    this.logger.log(`QPay callback ирлээ: ${JSON.stringify(body)}`);
    const invoiceId = body.invoice_id || body.payment_id;
    if (!invoiceId) {
      this.logger.error('Callback дата дотроос invoice_id эсвэл payment_id олдсонгүй');
      return { received: false };
    }
    await this.qpayService.registerCallback(body);
    return { received: true };
  }

  @Delete('invoice/:invoiceId')
  async cancelInvoice(@Param('invoiceId') invoiceId: string) {
    await this.qpayService.cancelInvoice(invoiceId);
    return { success: true, message: 'Invoice цуцлагдлаа' };
  }

  @Get('checkout')
  async handleCheckout(
    @Query() query: Record<string, any>,
    @Res() res: Response,
  ) {
    try {
      this.logger.log(`Shopify query орж ирлээ: ${JSON.stringify(query)}`);

      const orderId = query.order_id || query.id || query.checkout_id || 'TEST_ORDER_id';
      const amount  = query.amount || query.total_price || '0';
      const phone   = query.phone || '00000000';
      const sign    = query.sign;

      const email = query.email;
      if (!email) {
        throw new BadRequestException('Email шаардлагатай!');
      }

      // ─── 🛡️ ХАМГААЛАЛТ 1: HMAC-SHA256 ДИЖИТАЛ ГАРЫН ҮСЭГ ШАЛГАХ ───
      if (!sign) {
        this.logger.error(`Халдлага илэрлээ: Гарын үсэг (sign) байхгүй байна. OrderId: ${orderId}`);
        throw new BadRequestException('Төлбөрийн аюулгүй байдлын баталгаажуулалт амжилтгүй!');
      }

      const rawDataToVerify = orderId + '|' + amount + '|' + phone;
      const expectedSignature = crypto
        .createHmac('sha256', this.SECRET_SALT)
        .update(rawDataToVerify)
        .digest('hex');

      if (sign !== expectedSignature) {
        this.logger.error(`🚨 ХАЛДЛАГА: Гарын үсэг зөрлөө! Зассан дүн орж ирсэн байх магадлалтай. Ирсэн: ${sign}, Хүлээгдэж байсан: ${expectedSignature}`);
        throw new BadRequestException('Уучлаарай, төлбөрийн дата хүчингүй байна! (Price Tampering Detected)');
      }

      // Items-ийг аюулгүй унших
      let itemsArray: any[] = [];
      if (query.items) {
        try {
          itemsArray = typeof query.items === 'string' 
            ? JSON.parse(query.items) 
            : query.items;
        } catch {
          this.logger.warn('checkout query дахь items JSON задлахад алдаа гарлаа');
        }
      }

      // ─── 🛡️ ХАМГААЛАЛТ 2: БАРААНУУДЫН ҮНИЙГ СЕРВЕР ТАЛД ДАВХАР БОДОЖ ТУЛГАХ ───
      let calculatedTotalPrice = 0;
      if (itemsArray && itemsArray.length > 0) {
        itemsArray.forEach((item: any) => {
          const itemPrice = Number(item.price) || 0;
          const itemQty = Number(item.quantity) || 1;
          calculatedTotalPrice += (itemPrice * itemQty);
        });

        // Хэрэв бодсон дүн болон ирсэн amount зөрвөл ("Buy it now" sessionStorage халдлага)
        if (Math.abs(calculatedTotalPrice - Number(amount)) > 1) {
          this.logger.error(`🚨 ХАЛДЛАГА: Сагсны нийт дүн засагдсан байна! Бодсон: ${calculatedTotalPrice}, Ирсэн: ${amount}`);
          throw new BadRequestException('Захиалгын үнийн бүтцэд өөрчлөлт орсон тул цуцлагдлаа.');
        }
      }

      const secureUrl  = this.getSecureBaseUrl();
      const callbackUrl = `${secureUrl}/qpay/callback`;

      // Хэрэв items дотор бараа байвал "Барааны нэр - Өнгө (xТоо)" хэлбэрээр жагсаалт үүсгэнэ
      const generatedDetails = itemsArray.length > 0
        ? itemsArray.map(item => `${item.title}${item.variant_title ? ' - ' + item.variant_title : ''} (x${item.quantity || 1})`).join(', ')
        : 'Drift.ub Захиалга';

      const checkoutDto: Record<string, any> = {
        orderId,
        amount:          Number(amount),
        email,
        first_name:      query.first_name     || 'Үйлчлүүлэгч',
        last_name:       query.last_name       || '',
        address:         query.address         || 'Улаанбаатар',
        city:            query.city            || 'Улаанбаатар',
        phone,
        product_details: query.product_details || generatedDetails,
        callbackUrl,
        items:           itemsArray, 
      };

      // QPay рүү 100% баталгаажсан, шалгагдсан amount-ийг илгээнэ ✅
      const qpayResponse = await this.qpayService.createInvoice(
        orderId,
        Number(amount),
        callbackUrl,
        `Drift.ub Захиалга #${orderId}`, 
        checkoutDto,                      
      );

      const invoiceId       = qpayResponse.invoice_id;
      const qrImage         = qpayResponse.qr_image || '';
      const bankUrls: any[] = qpayResponse.urls || [];

      let bankButtonsHtml = '';
      if (bankUrls.length === 0) {
        bankButtonsHtml = `<p style="color:#D84315;font-size:14px;text-align:center;padding:1rem 0;">Төлбөрийн линк олдсонгүй.</p>`;
      } else {
        bankUrls.forEach((bank: any) => {
          const name     = bank.description || bank.name || 'Банк';
          const logo     = bank.logo || '';
          const link     = bank.link || '#';
          const initials = name.substring(0, 2).toUpperCase();
          bankButtonsHtml += `
            <a href="${link}" class="bank-btn" target="_blank" rel="noopener noreferrer">
              ${logo
                ? `<img src="${logo}" alt="${name}" class="bank-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="bank-logo-fallback" style="display:none">${initials}</div>`
                : `<div class="bank-logo-fallback">${initials}</div>`
              }
              <span class="bank-name">${name}</span>
            </a>`;
        });
      }

      const htmlPage = `<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QPay Төлбөр</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f4f6f8; display: flex; justify-content: center; padding: 24px 16px; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); width: 100%; max-width: 480px; overflow: hidden; position: relative; }
    .card-header { padding: 20px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 12px; }
    .header-logo { width: 44px; height: 44px; border-radius: 10px; background: #1565C0; display: flex; align-items: center; justify-content: center; }
    .header-logo svg { width: 26px; height: 26px; fill: white; }
    .header-info { flex: 1; min-width: 0; }
    .header-title { font-size: 16px; font-weight: 600; color: #202223; }
    .header-order { font-size: 13px; color: #6d7175; margin-top: 2px; }
    .header-amount { font-size: 20px; font-weight: 700; color: #008060; white-space: nowrap; }
    .bank-section { padding: 16px 20px 20px; }
    .bank-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
    .bank-btn { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #e8e8e8; border-radius: 10px; background: #fafafa; text-decoration: none; color: #202223; font-size: 13px; font-weight: 500; overflow: hidden; transition: background 0.15s, border-color 0.15s; }
    .bank-btn:hover { background: #f0f4ff; border-color: #1565C0; }
    .bank-logo { width: 32px; height: 32px; border-radius: 8px; object-fit: contain; }
    .bank-logo-fallback { width: 32px; height: 32px; border-radius: 8px; background: #1565C0; color: white; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; flex-shrink: 0; }
    .bank-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qr-section { padding: 24px 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
    .qr-img-wrap { width: 200px; height: 200px; border: 1px solid #e8e8e8; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: #fff; }
    .qr-img-wrap img { width: 180px; height: 180px; }
    .qr-hint { font-size: 13px; color: #6d7175; text-align: center; }
    @media (min-width: 600px) {
      .card { max-width: 560px; }
      .desktop-layout { display: grid; grid-template-columns: 1fr 220px; }
      .desktop-layout .bank-section { border-right: 1px solid #f0f0f0; }
      .desktop-qr { display: flex !important; }
    }
    @media (max-width: 599px) { .desktop-qr { display: none; } }
    .status-bar { padding: 12px 20px; border-top: 1px solid #f0f0f0; display: flex; align-items: center; gap: 8px; background: #fafafa; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #EF9F27; animation: pulse 1.5s infinite; }
    .status-dot.paid { background: #008060; animation: none; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
    .status-text { font-size: 13px; color: #6d7175; }

    .success-overlay {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: #fff; flex-direction: column; align-items: center;
      justify-content: center; gap: 16px; z-index: 10; display: none;
      padding: 32px;
    }
    .success-icon {
      width: 72px; height: 72px; background: #e6f4ea; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .success-icon svg { width: 40px; height: 40px; fill: #137333; }
    .success-title { font-size: 22px; font-weight: 700; color: #202124; }
    .success-desc { font-size: 14px; color: #5f6368; text-align: center; line-height: 1.6; }
    .success-btn {
      margin-top: 8px; padding: 12px 28px; background: #111; color: #fff;
      border: none; border-radius: 8px; font-size: 15px; font-weight: 600;
      cursor: pointer; text-decoration: none; display: inline-block;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="success-overlay" id="success-screen">
      <div class="success-icon">
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      </div>
      <div class="success-title">Төлбөр амжилттай!</div>
      <div class="success-desc">
        Захиалга баталгаажлаа.<br>
       Захиалгын мэдээлэл <b>${email}</b> хаяг руу илгээгдлээ.
      </div>
      <a href="https://www.driftub.store/" class="success-btn">Дэлгүүр рүү буцах</a>
    </div>

    <div class="card-header">
      <div class="header-logo">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
      </div>
      <div class="header-info">
        <div class="header-title">DRIFT.UB</div>
        <div class="header-order">Захиалга #${orderId}</div>
      </div>
      <div class="header-amount">${Number(amount).toLocaleString('mn-MN')} ₮</div>
    </div>

    <div class="desktop-layout">
      <div class="bank-section">
        <div class="bank-grid">${bankButtonsHtml}</div>
      </div>
      <div class="qr-section desktop-qr">
        <div class="qr-img-wrap">
          ${qrImage
            ? `<img src="data:image/png;base64,${qrImage}" alt="QPay QR код">`
            : `<svg width="80" height="80" viewBox="0 0 24 24" style="opacity:0.2"><path fill="#333" d="M3 3h7v7H3zm1 1v5h5V4zm1 1h3v3H5zm8-2h7v7h-7zm1 1v5h5V4zm1 1h3v3h-3zM3 13h7v7H3zm1 1v5h5v-5zm1 1h3v3H5zm8 0h2v2h-2zm0 4h2v2h-2zm4-4h2v2h-2zm0 4h2v2h-2z"/></svg>`
          }
        </div>
        <p class="qr-hint">Банкны аппаараа QR уншуулж төлнө үү</p>
      </div>
    </div>

    <div class="status-bar">
      <div class="status-dot" id="status-dot"></div>
      <span class="status-text" id="status-text">Төлбөрийн төлөв шалгаж байна...</span>
    </div>
  </div>

  <script>
    const invoiceId = "${invoiceId}";
    const secureUrl = "${secureUrl}";

    const interval = setInterval(async () => {
      try {
        const res  = await fetch(secureUrl + '/qpay/check/' + invoiceId);
        const data = await res.json();

        if (data.success && data.paid) {
          clearInterval(interval);
          document.getElementById('status-dot').classList.add('paid');
          document.getElementById('status-text').innerText = 'Төлбөр амжилттай!';
          document.getElementById('success-screen').style.display = 'flex';
        }
      } catch (err) {
        console.error('Шалгахад алдаа:', err);
      }
    }, 3000);
  </script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      return res.send(htmlPage);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
      this.logger.error(`Төлбөрийн хуудас үүсгэхэд алдаа: ${message}`);
      return res.status(500).send(`
        <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f4f6f8;">
          <div style="text-align:center;padding:2rem;">
            <h3 style="color:#D84315;">Төлбөрийн системд алдаа гарлаа</h3>
            <p style="color:#6d7175;margin-top:8px;">${message}</p>
          </div>
        </body></html>`);
    }
  }
}