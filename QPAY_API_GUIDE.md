# QPay Payment Integration - NestJS Backend

QPay төлбөрийн системийг Shopify дэлгүүрт холбосон NestJS backend.

## 📦 Файлын бүтэц

```
src/
├── qpay/
│   ├── dto/
│   │   ├── create-invoice.dto.ts       # Нэхэмжлэл үүсгэх DTO
│   │   ├── check-payment.dto.ts        # Төлбөр шалгах DTO
│   │   └── qpay-callback.dto.ts        # Callback DTO
│   ├── interfaces/
│   │   └── qpay.interface.ts           # QPay API интерфейсүүд
│   ├── qpay.service.ts                 # QPay сервис (3 үндсэн функц)
│   ├── qpay.controller.ts              # QPay контроллер (endpoints)
│   └── qpay.module.ts                  # QPay модуль
└── app.module.ts                       # Үндсэн модуль (QpayModule импортлогдсон)
```

## 🚀 Ажиллуулалт

### Сервер эхлүүлэх

```bash
# Development горим
npm run start:dev

# Production горим
npm run start:prod
```

## 📡 API Endpoints

### 1. Нэхэмжлэл үүсгэх

**POST** `/qpay/create-invoice`

```json
{
  "orderId": "ORDER_12345",
  "amount": 50000,
  "callbackUrl": "https://yourshop.com/payment/callback"
}
```

**Хариу (200):**

```json
{
  "success": true,
  "message": "Нэхэмжлэл амжилттай үүсгэгдлээ",
  "data": {
    "invoice_id": "abc123def456",
    "invoice_code": "ORDER_1706162400000",
    "qr_image": "data:image/png;base64,...",
    "urls": [
      {
        "bank_code": "XAC",
        "bank_name": "Хаан банк",
        "deeplink": "xacbank://...",
        "qr_image": "...",
        "logo": "..."
      },
      {
        "bank_code": "KHAN",
        "bank_name": "Хан банк",
        "deeplink": "khanbankpay://...",
        "qr_image": "...",
        "logo": "..."
      }
    ]
  }
}
```

---

### 2. Төлбөр төлөгдсөн эсэхийг шалгах

**POST** `/qpay/check-payment`

```json
{
  "invoiceId": "abc123def456"
}
```

**Хариу (200):**

```json
{
  "success": true,
  "message": "Төлөгдсөн",
  "data": {
    "isPaid": true,
    "paymentDetails": {
      "payment_id": "payment_id_12345",
      "invoice_id": "abc123def456",
      "payment_amount": 50000,
      "payment_status": "PAID",
      "payment_method": "CARD",
      "created_at": "2024-01-26T10:30:00.000Z"
    }
  }
}
```

---

### 3. QPay-ээс Callback хүлээн авах

**POST** `/qpay/callback`

QPay системээс төлөлтийн үр дүнг энэ endpoint-д илгээнэ.

```json
{
  "payment_id": "payment_id_12345",
  "invoice_id": "abc123def456",
  "payment_amount": 50000,
  "sender_branch_code": "SALBAR1",
  "payment_status": "PAID",
  "created_at": "2024-01-26T10:30:00.000Z",
  "is_wallet": false,
  "payment_method": "CARD"
}
```

**Хариу (200):**

```json
{
  "success": true,
  "message": "Callback амжилттай хүлээн авлаа"
}
```

---

## 🔑 QPay Credentials

Одоо кодэнд захсан утгууд:

```
Client ID: TEST_MERCHANT
Client Secret: WBDUzy8n
Base URL: https://merchant.qpay.mn
```

**⚠️ ЧУХАЛ:** Production орчны хувьд эдгээр утгуудыг `.env` файлд орлуулна:

```bash
# .env
QPAY_CLIENT_ID=YOUR_REAL_MERCHANT_ID
QPAY_CLIENT_SECRET=YOUR_REAL_SECRET
QPAY_BASE_URL=https://merchant.qpay.mn
```

---

## 🔒 Error Handling

Бүх API endpoints-д `try/catch` ашиглан маш цэвэрхэн error handling хийсэн:

```json
{
  "success": false,
  "message": "Нэхэмжлэл үүсгэхэд алдаа",
  "error": "Network timeout or QPay API error"
}
```

### Алдаа кодууд:

- **400**: Буруу хүсэлт (invalid payload)
- **401**: Authorization алдаа (token expired)
- **500**: Server алдаа

---

## 📝 Үндсэн 3 функц

### 1️⃣ `getAccessToken()`

- **Дуудлага:** `this.qpayService.getAccessToken()`
- **Үйлдэл:** Basic Auth ашиглан access token авна
- **Хариу:** `string` (access_token)
- **Auto refresh:** Token expired байвал автоматаар шинээр авна

### 2️⃣ `createInvoice(orderId, amount, callbackUrl)`

- **Дуудлага:** `this.qpayService.createInvoice('ORDER_123', 50000, 'https://...')`
- **Үйлдэл:** Нэхэмжлэл үүсгэнэ
- **Хариу:** Банкуудын Deeplink болон QR код
- **Bearer Token:** Автоматаар header-т орно

### 3️⃣ `checkPayment(invoiceId)`

- **Дуудлага:** `this.qpayService.checkPayment('invoice_id_123')`
- **Үйлдэл:** Төлбөр төлөгдсөн эсэхийг шалгана
- **Хариу:** `{ isPaid: boolean, paymentData: {...} }`

---

## 🛠️ Callback-ийн business logic

[qpay.controller.ts](src/qpay/qpay.controller.ts) дээрх `handleCallback()` методонд өөрийн business logic нэмнэ:

```typescript
// src/qpay/qpay.controller.ts - handleCallback() функц дотор

if (payload.payment_status === 'PAID') {
  // ✓ Төлөлт амжилттай - заалгын төлөв шинэчилнэ
  // - Database-т хадгалах
  // - Email илгээх
  // - SMS явуулах
  // - Inventory шинэчилнэ гэх мэт
} else if (payload.payment_status === 'CANCELLED') {
  // ✗ Төлөлт цуцлагдсан
  // - Төлөв "CANCELLED" болгоно
}
```

---

## 🧪 Test хийх (cURL)

### 1. Нэхэмжлэл үүсгэх

```bash
curl -X POST http://localhost:3000/qpay/create-invoice \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER_TEST_001",
    "amount": 50000,
    "callbackUrl": "https://yourshop.com/payment/callback"
  }'
```

### 2. Төлбөр шалгах

```bash
curl -X POST http://localhost:3000/qpay/check-payment \
  -H "Content-Type: application/json" \
  -d '{
    "invoiceId": "abc123def456"
  }'
```

### 3. Callback тест

```bash
curl -X POST http://localhost:3000/qpay/callback \
  -H "Content-Type: application/json" \
  -d '{
    "payment_id": "payment_test_001",
    "invoice_id": "abc123def456",
    "payment_amount": 50000,
    "sender_branch_code": "SALBAR1",
    "payment_status": "PAID",
    "created_at": "2024-01-26T10:30:00.000Z",
    "is_wallet": false,
    "payment_method": "CARD"
  }'
```

---

## 📊 Logger Outputs

Бүх логууд `console` дээр гарна:

```
[QPayService] Access token авах хүсэлт явуулаж байна...
[QPayService] Access token амжилттай авлаа
[QPayService] Нэхэмжлэл үүсгэж байна - Order: ORDER_TEST_001, Amount: 50000
[QPayService] Нэхэмжлэл амжилттай үүсгэгдлээ - Invoice ID: abc123def456
```

---

## 🚨 Common Issues & Fixes

### ❌ "Token expired" алдаа

- **Үр дүн:** Service автоматаар token шинэчилнэ
- **Action:** Хүсэлтийг дахин явуулна

### ❌ "Network timeout" алдаа

- **Шалтгаан:** QPay server хариу өгөхгүй байна
- **Уусгал:** Сүлжээний холболтыг шалгаж, дахин оролдоно

### ❌ "Invalid credentials" алдаа

- **Шалтгаан:** `.env`-д сохгүй утга байна
- **Уусгал:** Credentials-г QPay-аас авч шинэчилнэ

---

## 📚 Санал болгох байдлууд

```typescript
// Service-ээс функц дуудах жишээ
const invoiceData = await this.qpayService.createInvoice(
  'ORDER_123',
  50000,
  'https://yourshop.com/callback',
);

// Төлөв шалгах
const { isPaid, paymentData } = await this.qpayService.checkPayment(
  invoiceData.invoice_id,
);
```

---

## 📞 Support

Асуулт, алдаа байвал:

1. Console logs шалгана
2. Network requests шалгана (Postman)
3. QPay документацийг унших: https://merchant.qpay.mn

---

**Үүсгэгдсэн огноо:** 2024-01-26  
**NestJS версия:** ^11.0.0  
**TypeScript версия:** ^5.0.0
