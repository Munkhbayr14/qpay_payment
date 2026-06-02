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
} from '@nestjs/common';
import type { Response } from 'express';
import { QpayService } from './qpay.service';

// ─── Request DTOs ─────────────────────────────────────────────────────────────

class CreateInvoiceRequest {
  orderId!: string;
  amount!: number;
  callbackUrl!: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('qpay')
export class QpayController {
  private readonly logger = new Logger(QpayController.name);

  private readonly baseUrl = 'https://qpay-payment-1.onrender.com';

  constructor(private readonly qpayService: QpayService) {}

  /**
   * Invoice үүсгэх
   * POST /qpay/invoice
   */
  @Post('invoice')
  @HttpCode(HttpStatus.CREATED)
  async createInvoice(@Body() body: CreateInvoiceRequest) {
    const { orderId, amount, callbackUrl } = body;
    const invoice = await this.qpayService.createInvoice(orderId, amount, callbackUrl);

    return {
      success: true,
      invoice_id: invoice.invoice_id,
      qr_image: invoice.qr_image,
      qr_text: invoice.qr_text,
      short_url: invoice.qPay_shortUrl,
      bank_urls: invoice.urls,
    };
  }

  /**
   * Төлбөр шалгах (Фронтэндээс эсвэл Скриптээс дуудах AJAX API)
   * GET /qpay/check/:invoiceId
   */
  @Get('check/:invoiceId')
  async checkPayment(@Param('invoiceId') invoiceId: string) {
    const result = await this.qpayService.checkPayment(invoiceId);
    return {
      success: true,
      paid: result.paid,
    };
  }

  /**
   * QPay-ийн Callback — төлбөр хийгдсэний дараа QPay дуудна
   * POST /qpay/callback
   */
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async handleCallback(@Body() body: Record<string, any>) {
    this.logger.log(`QPay callback ирлээ: ${JSON.stringify(body)}`);
    
    // QPay API v2 дээр callback дата нь өөр бүтэцтэй ирж магадгүй тул шалгаарай
    const invoiceId = body.invoice_id || body.payment_id;

    if (!invoiceId) {
      this.logger.error('Callback дата дотроос invoice_id эсвэл payment_id олдсонгүй');
      return { received: false };
    }

    // Төлбөрийг баталгаажуулах
    const result = await this.qpayService.checkPayment(invoiceId);

    if (result.paid) {
      this.logger.log(`Төлбөр баталгаажлаа: invoice_id=${invoiceId}`);
      
      // TODO: Shopify-ийн REST/GraphQL API-ийг дуудаж Order-ийг "Paid" болгох код энд орно.
      // Жишээ нь: await this.shopifyService.markAsPaid(orderId);
      
    } else {
      this.logger.warn(`Төлбөр баталгаажаагүй: invoice_id=${invoiceId}`);
    }

    return { received: true };
  }

  /**
   * Invoice цуцлах
   * DELETE /qpay/invoice/:invoiceId
   */
  @Delete('invoice/:invoiceId')
  async cancelInvoice(@Param('invoiceId') invoiceId: string) {
    await this.qpayService.cancelInvoice(invoiceId);
    return { success: true, message: 'Invoice цуцлагдлаа' };
  }

  /**
   * Shopify-оос Redirect хийж орж ирэх үндсэн хуудас
   * GET /qpay/checkout
   */
  @Get('checkout')
  async handleCheckout(
    @Query('order_id') orderId: string,
    @Query('amount') amount: number,
    @Res() res: Response
  ) {
    try {
      this.logger.log(`Shopify-оос шинэ захиалга ирлээ. ID: ${orderId}, Дүн: ${amount}`);

      // 1. Жинхэнэ localtunnel хаягаа ашиглан callback_url үүсгэнэ
      const callbackUrl = `${this.baseUrl}/qpay/callback?order_id=${orderId}`;
      const qpayResponse = await this.qpayService.createInvoice(orderId, amount, callbackUrl);

      const invoiceId = qpayResponse.invoice_id;
      const bankUrls = qpayResponse.urls || [];

      // 2. Банкны товчлууруудыг HTML хэлбэрээр бэлдэнэ
      let bankButtonsHtml = '';
      if (bankUrls.length === 0) {
        bankButtonsHtml = '<p style="color: red;">Төлбөрийн линк олдсонгүй. Түр дараа дахин оролдоно уу.</p>';
      } else {
        bankUrls.forEach((bank: any) => {
          bankButtonsHtml += `
            <a href="${bank.link}" class="bank-button">
              <span>${bank.description || bank.name}</span>
            </a>
          `;
        });
      }

      // 3. HTML хуудас (Цаанаа 3 секунд тутамд төлбөр орсон уу гэдгийг шалгаж, орсон бол Shopify руу буцна)
      const htmlPage = `
        <!DOCTYPE html>
        <html lang="mn">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QPay Төлбөр Төлөх</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f6f8; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 90vh; }
            .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 400px; width: 100%; text-align: center; }
            h2 { color: #202223; margin-bottom: 5px; }
            .amount { font-size: 24px; font-weight: bold; color: #008060; margin: 20px 0; }
            .instructions { color: #6d7175; font-size: 14px; margin-bottom: 25px; }
            .bank-button { display: flex; align-items: center; justify-content: center; padding: 14px; margin: 12px 0; background: #008060; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .bank-button:hover { background: #006e52; }
            .loading-text { font-size: 12px; color: #8c9196; margin-top: 15px; display: block; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>DRIFT.UB</h2>
            <p style="color: #6d7175;">Захиалгын дугаар: #${orderId}</p>
            <div class="amount">${Number(amount).toLocaleString()} ₮</div>
            <p class="instructions">Төлөх банкныхаа аппликейшнийг сонгоно уу. Сонгосон банкны апп руу шууд шилжих болно.</p>
            <div class="bank-list">
              ${bankButtonsHtml}
            </div>
            <span class="loading-text" id="status-text">Төлбөрийн төлөв шалгаж байна...</span>
          </div>

          <script>
            // 3 секунд тутамд төлбөр төлөгдсөн эсэхийг backend-ээс асууна
            const invoiceId = "${invoiceId}";
            const orderId = "${orderId}";
            
            const interval = setInterval(async () => {
              try {
                const response = await fetch(\`/qpay/check/\${invoiceId}\`);
                const data = await response.json();
                
                if (data.success && data.paid) {
                  document.getElementById('status-text').innerText = "Төлбөр амжилттай! Буцаж байна...";
                  clearInterval(interval);
                  
                  // Төлбөр амжилттай болбол Shopify-ийн захиалга дууссан хуудас руу нь хэрэглэгчийг буцаана
                  // Shopify-ийн дэлгүүрийн хаягаа зөв тавиарай (Жишээ нь drift-ub.myshopify.com)
                  window.location.href = "https://driftub.mn/checkout/orders/" + orderId + "/thank_you";
                }
              } catch (err) {
                console.error("Шалгахад алдаа гарлаа:", err);
              }
            }, 3000);
          </script>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'text/html');
      return res.send(htmlPage);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
      this.logger.error(`Төлбөрийн хуудас үүсгэхэд алдаа гарлаа: ${message}`);
      return res.status(500).send('<h3>Төлбөрийн системд алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.</h3>');
    }
  }
}