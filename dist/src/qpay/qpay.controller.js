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
    async handleCheckout(query, res) {
        try {
            this.logger.log(`Shopify query: ${JSON.stringify(query)}`);
            const orderId = query.order_id || query.id || query.checkout_id || 'TEST_ORDER';
            const amount = query.amount || query.total_price || 100;
            this.logger.log(`ID: ${orderId}, Дүн: ${amount}`);
            const callbackUrl = `${this.baseUrl}/qpay/callback?order_id=${orderId}`;
            const qpayResponse = await this.qpayService.createInvoice(orderId, Number(amount), callbackUrl);
            const invoiceId = qpayResponse.invoice_id;
            const qrImage = qpayResponse.qr_image || '';
            const bankUrls = qpayResponse.urls || [];
            let bankButtonsHtml = '';
            if (bankUrls.length === 0) {
                bankButtonsHtml = `<p style="color:#D84315;font-size:14px;text-align:center;padding:1rem 0;">
          Төлбөрийн линк олдсонгүй. Түр дараа дахин оролдоно уу.
        </p>`;
            }
            else {
                bankUrls.forEach((bank) => {
                    const name = bank.description || bank.name || 'Банк';
                    const logo = bank.logo || '';
                    const link = bank.link || '#';
                    const initials = name.substring(0, 2).toUpperCase();
                    bankButtonsHtml += `
            <a href="${link}" class="bank-btn">
              ${logo
                        ? `<img src="${logo}"
                       alt="${name}"
                       class="bank-logo"
                       onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                   <div class="bank-logo-fallback" style="display:none">${initials}</div>`
                        : `<div class="bank-logo-fallback">${initials}</div>`}
              <span class="bank-name">${name}</span>
            </a>
          `;
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

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f4f6f8;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 24px 16px;
    }

    .card {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      width: 100%;
      max-width: 480px;
      overflow: hidden;
    }

    /* ── Header ── */
    .card-header {
      padding: 20px 20px 16px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-logo {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: #1565C0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .header-logo svg { width: 26px; height: 26px; fill: white; }
    .header-info { flex: 1; min-width: 0; }
    .header-title { font-size: 16px; font-weight: 600; color: #202223; }
    .header-order { font-size: 13px; color: #6d7175; margin-top: 2px; }
    .header-amount {
      font-size: 20px;
      font-weight: 700;
      color: #008060;
      white-space: nowrap;
    }

    /* ── Tabs ── */
    .tabs {
      display: flex;
      gap: 0;
      padding: 16px 20px 0;
    }
    .tab-btn {
      flex: 1;
      padding: 10px 8px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: #6d7175;
      border-bottom: 2px solid transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab-btn.active {
      color: #1565C0;
      border-bottom-color: #1565C0;
    }
    .tab-btn svg { width: 18px; height: 18px; }

    /* ── Bank grid ── */
    .bank-section { padding: 16px 20px 20px; }
    .bank-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px;
    }

    @media (max-width: 360px) {
      .bank-grid { grid-template-columns: repeat(2, 1fr); }
    }

    .bank-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid #e8e8e8;
      border-radius: 10px;
      background: #fafafa;
      text-decoration: none;
      color: #202223;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
      cursor: pointer;
      overflow: hidden;
    }
    .bank-btn:hover {
      background: #f0f4ff;
      border-color: #1565C0;
      transform: translateY(-1px);
    }
    .bank-btn:active { transform: translateY(0); }

    .bank-logo {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      object-fit: contain;
      flex-shrink: 0;
      background: #fff;
    }
    .bank-logo-fallback {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: #1565C0;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .bank-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── QR section ── */
    .qr-section {
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .qr-img-wrap {
      width: 200px;
      height: 200px;
      border: 1px solid #e8e8e8;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      overflow: hidden;
    }
    .qr-img-wrap img {
      width: 180px;
      height: 180px;
      object-fit: contain;
    }
    .qr-hint {
      font-size: 13px;
      color: #6d7175;
      text-align: center;
      line-height: 1.5;
      max-width: 280px;
    }

    /* ── Desktop: QR байнга харагдах ── */
    @media (min-width: 600px) {
      .card { max-width: 560px; }
      .desktop-layout {
        display: grid;
        grid-template-columns: 1fr 220px;
        gap: 0;
      }
      .desktop-layout .bank-section {
        border-right: 1px solid #f0f0f0;
      }
      .desktop-layout .qr-section {
        padding: 20px 16px;
        justify-content: center;
      }
      .tabs { display: none; }
      .mobile-only { display: none; }
      .desktop-qr { display: flex !important; }
    }

    @media (max-width: 599px) {
      .desktop-qr { display: none; }
    }

    .hidden { display: none !important; }

    /* ── Status ── */
    .status-bar {
      padding: 12px 20px;
      border-top: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #fafafa;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #EF9F27;
      flex-shrink: 0;
      animation: pulse 1.5s ease-in-out infinite;
    }
    .status-dot.paid { background: #008060; animation: none; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
    .status-text { font-size: 13px; color: #6d7175; }
  </style>
</head>
<body>
  <div class="card">

    <!-- Header -->
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

    <!-- Mobile tabs -->
    <div class="tabs mobile-only">
      <button class="tab-btn active" id="tab-app" onclick="switchTab('app')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>
        Банкны апп
      </button>
      <button class="tab-btn" id="tab-qr" onclick="switchTab('qr')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="4" height="4"/></svg>
        QR код
      </button>
    </div>

    <!-- Desktop: хоёр багана layout -->
    <div class="desktop-layout">

      <!-- Банкны жагсаалт -->
      <div class="bank-section" id="section-app">
        <div class="bank-grid">
          ${bankButtonsHtml}
        </div>
      </div>

      <!-- QR хэсэг — desktop дээр байнга харагдана -->
      <div class="qr-section desktop-qr" id="section-qr">
        <div class="qr-img-wrap">
          ${qrImage
                ? `<img src="data:image/png;base64,${qrImage}" alt="QPay QR код">`
                : `<svg width="140" height="140" viewBox="0 0 140 140" style="opacity:0.3">
                <rect x="10" y="10" width="40" height="40" fill="none" stroke="#333" stroke-width="4"/>
                <rect x="20" y="20" width="20" height="20" fill="#333"/>
                <rect x="90" y="10" width="40" height="40" fill="none" stroke="#333" stroke-width="4"/>
                <rect x="100" y="20" width="20" height="20" fill="#333"/>
                <rect x="10" y="90" width="40" height="40" fill="none" stroke="#333" stroke-width="4"/>
                <rect x="20" y="100" width="20" height="20" fill="#333"/>
              </svg>`}
        </div>
        <p class="qr-hint">Банкны аппаараа QR кодыг уншуулж төлнө үү</p>
      </div>

    </div>

    <!-- Status bar -->
    <div class="status-bar">
      <div class="status-dot" id="status-dot"></div>
      <span class="status-text" id="status-text">Төлбөрийн төлөв шалгаж байна...</span>
    </div>

  </div>

  <script>
    const invoiceId = "${invoiceId}";
    const orderId = "${orderId}";
    const baseUrl = "${this.baseUrl}";

    // Mobile tab switch
    function switchTab(tab) {
      const appSection = document.getElementById('section-app');
      const qrSection = document.getElementById('section-qr');
      const tabApp = document.getElementById('tab-app');
      const tabQr = document.getElementById('tab-qr');

      if (tab === 'app') {
        appSection.classList.remove('hidden');
        qrSection.classList.add('hidden');
        tabApp.classList.add('active');
        tabQr.classList.remove('active');
      } else {
        appSection.classList.add('hidden');
        qrSection.classList.remove('hidden');
        tabApp.classList.remove('active');
        tabQr.classList.add('active');
      }
    }

    // Төлбөрийн төлөв 3 секунд тутамд шалгана
    const interval = setInterval(async () => {
      try {
        const response = await fetch(baseUrl + '/qpay/check/' + invoiceId);
        const data = await response.json();

        if (data.success && data.paid) {
          clearInterval(interval);
          document.getElementById('status-dot').classList.add('paid');
          document.getElementById('status-text').innerText = 'Төлбөр амжилттай! Буцаж байна...';

          setTimeout(() => {
            window.location.href = 'https://driftub.mn/checkout/orders/' + orderId + '/thank_you';
          }, 1500);
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
            this.logger.error(`Төлбөрийн хуудас үүсгэхэд алдаа: ${message}`);
            return res.status(500).send(`
        <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f4f6f8;">
          <div style="text-align:center;padding:2rem;">
            <h3 style="color:#D84315;">Төлбөрийн системд алдаа гарлаа</h3>
            <p style="color:#6d7175;margin-top:8px;">Түр хүлээгээд дахин оролдоно уу.</p>
          </div>
        </body></html>
      `);
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
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], QpayController.prototype, "handleCheckout", null);
exports.QpayController = QpayController = QpayController_1 = __decorate([
    (0, common_1.Controller)('qpay'),
    __metadata("design:paramtypes", [qpay_service_1.QpayService])
], QpayController);
//# sourceMappingURL=qpay.controller.js.map