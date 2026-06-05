"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nestjs_1 = require("@mikro-orm/nestjs");
const postgresql_1 = require("@mikro-orm/postgresql");
const qpay_module_1 = require("./qpay/qpay.module");
const qpay_payment_entity_1 = require("./qpay/entities/qpay-payment.entity");
const qpay_request_log_entity_1 = require("./qpay/entities/qpay-request-log.entity");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            nestjs_1.MikroOrmModule.forRootAsync({
                useFactory: () => ({
                    driver: postgresql_1.PostgreSqlDriver,
                    host: process.env.DB_HOST,
                    port: Number(process.env.DB_PORT),
                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    dbName: process.env.DB_NAME,
                    entities: [qpay_payment_entity_1.QpayPayment, qpay_request_log_entity_1.QpayRequestLog],
                    allowGlobalContext: true,
                    debug: process.env.NODE_ENV !== 'production',
                }),
            }),
            qpay_module_1.QpayModule,
        ],
        controllers: [],
        providers: [],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map