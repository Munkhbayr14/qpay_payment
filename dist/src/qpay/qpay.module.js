"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QpayModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const nestjs_1 = require("@mikro-orm/nestjs");
const qpay_service_1 = require("./qpay.service");
const qpay_controller_1 = require("./qpay.controller");
const qpay_payment_entity_1 = require("./entities/qpay-payment.entity");
const qpay_request_log_entity_1 = require("./entities/qpay-request-log.entity");
let QpayModule = class QpayModule {
};
exports.QpayModule = QpayModule;
exports.QpayModule = QpayModule = __decorate([
    (0, common_1.Module)({
        imports: [
            axios_1.HttpModule.register({
                timeout: 10_000,
                maxRedirects: 3,
            }),
            nestjs_1.MikroOrmModule.forFeature([qpay_payment_entity_1.QpayPayment, qpay_request_log_entity_1.QpayRequestLog]),
        ],
        controllers: [qpay_controller_1.QpayController],
        providers: [qpay_service_1.QpayService],
        exports: [qpay_service_1.QpayService],
    })
], QpayModule);
//# sourceMappingURL=qpay.module.js.map