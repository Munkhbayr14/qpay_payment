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
var QpayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QpayService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
let QpayService = QpayService_1 = class QpayService {
    httpService;
    configService;
    logger = new common_1.Logger(QpayService_1.name);
    baseUrl = 'https://merchant.qpay.mn/v2';
    accessToken = null;
    tokenExpiresAt = 0;
    constructor(httpService, configService) {
        this.httpService = httpService;
        this.configService = configService;
    }
    async getAccessToken() {
        if (this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) {
            return this.accessToken;
        }
        const username = this.configService.get('QPAY_USERNAME');
        const password = this.configService.get('QPAY_PASSWORD');
        const credentials = Buffer.from(`${username}:${password}`).toString('base64');
        try {
            this.logger.log('QPay access token авж байна...');
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.baseUrl}/auth/token`, {}, {
                headers: {
                    Authorization: `Basic ${credentials}`,
                    'Content-Type': 'application/json',
                },
            }));
            this.accessToken = data.access_token;
            this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
            this.logger.log('QPay token амжилттай авлаа');
            return this.accessToken;
        }
        catch (error) {
            const err = error;
            this.logger.error('QPay token авахад алдаа гарлаа', err?.response?.data ?? err?.message);
            throw new common_1.InternalServerErrorException('QPay authentication амжилтгүй боллоо');
        }
    }
    async createInvoice(orderId, amount, callbackUrl) {
        const token = await this.getAccessToken();
        const invoiceCode = this.configService.get('QPAY_INVOICE_CODE') || 'ORDER_INVOICE';
        const body = {
            invoice_code: invoiceCode,
            sender_invoice_no: orderId,
            invoice_receiver_code: 'terminal',
            invoice_description: `Order #${orderId} - ${amount}₮`,
            sender_branch_code: 'ONLINE',
            amount,
            callback_url: callbackUrl,
        };
        try {
            this.logger.log(`Invoice үүсгэж байна: order=${orderId}, amount=${amount}`);
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.baseUrl}/invoice`, body, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }));
            this.logger.log(`Invoice амжилттай үүслээ: invoice_id=${data.invoice_id}`);
            return data;
        }
        catch (error) {
            const err = error;
            this.logger.error(`Invoice үүсгэхэд алдаа: order=${orderId}`, err?.response?.data ?? err?.message);
            throw new common_1.InternalServerErrorException('QPay invoice үүсгэхэд алдаа гарлаа');
        }
    }
    async checkPayment(invoiceId) {
        const token = await this.getAccessToken();
        try {
            this.logger.log(`Төлбөр шалгаж байна: invoice_id=${invoiceId}`);
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.baseUrl}/payment/check`, {
                object_type: 'INVOICE',
                object_id: invoiceId,
                offset: { page_number: 1, page_limit: 100 },
            }, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }));
            const paid = data.count > 0 && data.rows.some((r) => r.payment_status === 'PAID');
            this.logger.log(`Төлбөрийн төлөв: invoice_id=${invoiceId}, paid=${paid}`);
            return { paid, data };
        }
        catch (error) {
            const err = error;
            this.logger.error(`Төлбөр шалгахад алдаа: invoice_id=${invoiceId}`, err?.response?.data ?? err?.message);
            throw new common_1.InternalServerErrorException('QPay төлбөр шалгахад алдаа гарлаа');
        }
    }
    async cancelInvoice(invoiceId) {
        const token = await this.getAccessToken();
        try {
            await (0, rxjs_1.firstValueFrom)(this.httpService.delete(`${this.baseUrl}/invoice/${invoiceId}`, {
                headers: { Authorization: `Bearer ${token}` },
            }));
            this.logger.log(`Invoice цуцлагдлаа: ${invoiceId}`);
        }
        catch (error) {
            const err = error;
            this.logger.error(`Invoice цуцлахад алдаа: ${invoiceId}`, err?.response?.data ?? err?.message);
            throw new common_1.InternalServerErrorException('Invoice цуцлахад алдаа гарлаа');
        }
    }
};
exports.QpayService = QpayService;
exports.QpayService = QpayService = QpayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService])
], QpayService);
//# sourceMappingURL=qpay.service.js.map