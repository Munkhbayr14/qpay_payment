// ─── Auth ───────────────────────────────────────────────────────────────────

export interface QpayTokenResponse {
  token_type: string;
  refresh_expires_in: number;
  refresh_token: string;
  access_token: string;
  expires_in: number;
  scope: string;
  session_state: string;
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export interface CreateInvoiceDto {
  invoice_code: string;       // QPay-ээс олгосон invoice code
  sender_invoice_no: string;  // Таны системийн order ID
  invoice_receiver_code: string;
  invoice_description: string;
  sender_branch_code?: string;
  amount: number;
  callback_url: string;
}

export interface QpayInvoiceUrl {
  name: string;
  description: string;
  logo: string;
  link: string;
}

export interface QpayInvoiceResponse {
  invoice_id: string;
  qr_text: string;
  qr_image: string;         // base64 PNG
  qPay_shortUrl: string;
  urls: QpayInvoiceUrl[];   // Банкны deeplink жагсаалт
}

// ─── Payment Check ────────────────────────────────────────────────────────────

export interface QpayPaymentCheckRequest {
  object_type: 'INVOICE' | 'MERCHANT' | 'CUSTOMER';
  object_id: string;
  offset: {
    page_number: number;
    page_limit: number;
  };
}

export interface QpayPaymentRow {
  payment_id: string;
  payment_status: string;
  payment_currency: string;
  payment_wallet: string;
  payment_amount: number;
  paid_amount: number;
  payment_created_date: string;
  payment_updated_date: string;
  merchant_id: string;
  invoice_id: string;
}

export interface QpayPaymentCheckResponse {
  count: number;
  paid_amount: number;
  rows: QpayPaymentRow[];
}

// ─── Callback ────────────────────────────────────────────────────────────────

export interface QpayCallbackDto {
  payment_id: string;
  qpay_payment_id?: string;
}