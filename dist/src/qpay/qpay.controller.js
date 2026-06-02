"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var QpayController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QpayController = void 0;
const common_1 = require("@nestjs/common");
const qpay_service_1 = require("./qpay.service");
class CreateInvoiceRequest {
    orderId;
    amount;
    callbackUrl;
}
let QpayController = QpayController_1 = class QpayController {
    qpayService;
    logger = new common_1.Logger(QpayController_1.name);
    baseUrl = 'https://qpay-payment-1.onrender.com';
    constructor(qpayService) {
        this.qpayService = qpayService;
    }
    async createInvoice(body) {
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
    async checkPayment(invoiceId) {
        const result = await this.qpayService.checkPayment(invoiceId);
        return {
            success: true,
            paid: result.paid,
        };
    }
    async handleCallback(body) {
        this.logger.log(`QPay callback ирлээ: ${JSON.stringify(body)}`);
        const invoiceId = body.invoice_id || body.payment_id;
        if (!invoiceId) {
            this.logger.error('Callback дата дотроос invoice_id эсвэл payment_id олдсонгүй');
            return { received: false };
        }
        const result = await this.qpayService.checkPayment(invoiceId);
        if (result.paid) {
            this.logger.log(`Төлбөр баталгаажлаа: invoice_id=${invoiceId}`);
        }
        else {
            this.logger.warn(`Төлбөр баталгаажаагүй: invoice_id=${invoiceId}`);
        }
        return { received: true };
    }
    async cancelInvoice(invoiceId) {
        await this.qpayService.cancelInvoice(invoiceId);
        return { success: true, message: 'Invoice цуцлагдлаа' };
    }
    async handleCheckout(orderId, amount, res) {
        try {
            this.logger.log(`Shopify-оос шинэ захиалга ирлээ. ID: ${orderId}, Дүн: ${amount}`);
            const callbackUrl = `${this.baseUrl}/qpay/callback?order_id=${orderId}`;
            const qpayResponse = await this.qpayService.createInvoice(orderId, amount, callbackUrl);
            const invoiceId = qpayResponse.invoice_id;
            const bankUrls = qpayResponse.urls || [];
            let bankButtonsHtml = '';
            if (bankUrls.length === 0) {
                bankButtonsHtml = '<p style="color: red;">Төлбөрийн линк олдсонгүй. Түр дараа дахин оролдоно уу.</p>';
            }
            else {
                bankUrls.forEach((bank) => {
                    bankButtonsHtml += `
            <a href="${bank.link}" class="bank-button">
              <span>${bank.description || bank.name}</span>
            </a>
          `;
                });
            }
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
            this.logger.error(`Төлбөрийн хуудас үүсгэхэд алдаа гарлаа: ${message}`);
            return res.status(500).send('<h3>Төлбөрийн системд алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.</h3>');
        }
    }
};
exports.QpayController = QpayController;
__decorate([
    (0, common_1.Post)('invoice'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateInvoiceRequest]),
    __metadata("design:returntype", Promise)
], QpayController.prototype, "createInvoice", null);
__decorate([
    (0, common_1.Get)('check/:invoiceId'),
    __param(0, (0, common_1.Param)('invoiceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], QpayController.prototype, "checkPayment", null);
__decorate([
    (0, common_1.Post)('callback'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], QpayController.prototype, "handleCallback", null);
__decorate([
    (0, common_1.Delete)('invoice/:invoiceId'),
    __param(0, (0, common_1.Param)('invoiceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], QpayController.prototype, "cancelInvoice", null);
__decorate([
    (0, common_1.Get)('checkout'),
    __param(0, (0, common_1.Query)('order_id')),
    __param(1, (0, common_1.Query)('amount')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Object]),
    __metadata("design:returntype", Promise)
], QpayController.prototype, "handleCheckout", null);
exports.QpayController = QpayController = QpayController_1 = __decorate([
    (0, common_1.Controller)('qpay'),
    __metadata("design:paramtypes", [qpay_service_1.QpayService])
], QpayController);
//# sourceMappingURL=qpay.controller.js.map