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
var QpayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QpayService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const nestjs_1 = require("@mikro-orm/nestjs");
const core_1 = require("@mikro-orm/core");
const rxjs_1 = require("rxjs");
const qpay_payment_entity_1 = require("./entities/qpay-payment.entity");
const qpay_request_log_entity_1 = require("./entities/qpay-request-log.entity");
let QpayService = QpayService_1 = class QpayService {
    httpService;
    configService;
    paymentRepo;
    logRepo;
    logger = new common_1.Logger(QpayService_1.name);
    payUrl = process.env.PAY_URL;
    accessToken = null;
    tokenExpiresAt = 0;
    constructor(httpService, configService, paymentRepo, logRepo) {
        this.httpService = httpService;
        this.configService = configService;
        this.paymentRepo = paymentRepo;
        this.logRepo = logRepo;
    }
    safeJson(value) {
        try {
            return value !== undefined ? JSON.stringify(value) : undefined;
        }
        catch {
            return String(value);
        }
    }
    async upsertPayment(data) {
        let payment = await this.paymentRepo.findOne({ invoiceId: data.invoiceId });
        if (!payment) {
            payment = new qpay_payment_entity_1.QpayPayment();
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
    async logRequest(payment, type, request, response, note) {
        const log = new qpay_request_log_entity_1.QpayRequestLog();
        log.payment = payment;
        log.type = type;
        log.requestPayload = this.safeJson(request);
        log.responsePayload = this.safeJson(response);
        log.note = note;
        await this.logRepo.getEntityManager().persistAndFlush(log);
        return log;
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
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.payUrl}/auth/token`, {}, {
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
        const cleanOrderId = String(orderId).trim();
        const cleanAmount = Math.round(Number(amount));
        const body = {
            invoice_code: invoiceCode,
            sender_invoice_no: cleanOrderId,
            invoice_receiver_code: 'terminal',
            invoice_description: `Order #${cleanOrderId} - ${cleanAmount}₮`,
            sender_branch_code: 'ONLINE',
            amount: cleanAmount,
            callback_url: callbackUrl,
        };
        try {
            this.logger.log(`Invoice үүсгэж байна: order=${cleanOrderId}, amount=${cleanAmount}`);
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.payUrl}/invoice`, body, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }));
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
        }
        catch (error) {
            const err = error;
            this.logger.error(`Invoice үүсгэхэд алдаа: order=${cleanOrderId}`, err?.response?.data ?? err?.message);
            throw new common_1.InternalServerErrorException('QPay invoice үүсгэхэд алдаа гарлаа');
        }
    }
    async checkPayment(invoiceId) {
        const token = await this.getAccessToken();
        try {
            this.logger.log(`Төлбөр шалгаж байна: invoice_id=${invoiceId}`);
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.payUrl}/payment/check`, {
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
        }
        catch (error) {
            const err = error;
            this.logger.error(`Төлбөр шалгахад алдаа: invoice_id=${invoiceId}`, err?.response?.data ?? err?.message);
            throw new common_1.InternalServerErrorException('QPay төлбөр шалгахад алдаа гарлаа');
        }
    }
    async registerCallback(body) {
        const invoiceId = body.invoice_id || body.payment_id;
        const result = await this.checkPayment(invoiceId);
        const existing = await this.paymentRepo.findOne({ invoiceId });
        const payment = await this.upsertPayment({
            orderId: existing?.orderId,
            invoiceId,
            amount: existing?.amount,
            qpayShortUrl: existing?.qpayShortUrl,
            paymentId: body.qpay_payment_id ?? body.payment_id ?? invoiceId,
            status: result.paid ? 'PAID' : 'UNPAID',
            paid: result.paid,
            paidAmount: result.data.paid_amount,
            paidAt: result.paid ? new Date() : existing?.paidAt,
            callbackReceivedAt: new Date(),
        });
        await this.logRequest(payment, 'CALLBACK', body, result.data, 'QPay callback ирж бүртгэв');
    }
    async cancelInvoice(invoiceId) {
        const token = await this.getAccessToken();
        try {
            await (0, rxjs_1.firstValueFrom)(this.httpService.delete(`${this.payUrl}/invoice/${invoiceId}`, {
                headers: { Authorization: `Bearer ${token}` },
            }));
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
    __param(2, (0, nestjs_1.InjectRepository)(qpay_payment_entity_1.QpayPayment)),
    __param(3, (0, nestjs_1.InjectRepository)(qpay_request_log_entity_1.QpayRequestLog)),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        core_1.EntityRepository,
        core_1.EntityRepository])
], QpayService);
//# sourceMappingURL=qpay.service.js.map