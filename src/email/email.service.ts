import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendOrderConfirmation(dto: any) {
    const {
      orderId,
      amount,
      email,
      first_name,
      last_name,
      address,
      city,
      phone,
      product_details,
      invoice_id,
      qpay_short_url,
      paid_amount,
      items,
    } = dto;

    const fullName = `${last_name || ''} ${first_name || ''}`.trim();

    const renderItems = () => {
      if (Array.isArray(items) && items.length > 0) {
        return `
          <table style="width:100%;border-collapse:collapse;margin-top:12px">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Бараа</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid #eee">Үнэ</th>
                <th style="text-align:center;padding:8px;border-bottom:1px solid #eee">Тоо</th>
              </tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (it: any) => `
                    <tr>
                      <td style="padding:8px;border-bottom:1px solid #f6f6f6">${it.title || it.name || ''}</td>
                      <td style="padding:8px;text-align:right;border-bottom:1px solid #f6f6f6">${it.price ?? ''}</td>
                      <td style="padding:8px;text-align:center;border-bottom:1px solid #f6f6f6">${it.quantity ?? 1}</td>
                    </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        `;
      }

      return `<p style="margin-top:12px">${product_details || ''}</p>`;
    };

    const adminHtml = `
      <div style="font-family: Inter, Arial, sans-serif; padding: 20px; color:#111;">
        <h2 style="color:#d32f2f;margin-bottom:8px">🚨 ШИНЭ ЗАХИАЛГА ИРЛЭЭ</h2>
        <p style="margin:0 0 8px"><strong>Захиалгын ID:</strong> ${orderId || invoice_id || ''}</p>
        <p style="margin:0 0 8px"><strong>Нийт дүн:</strong> ${amount ?? paid_amount ?? ''} MNT</p>
        ${renderItems()}
        <hr style="border:0;border-top:1px solid #eee;margin:16px 0"/>
        <h3 style="margin:0 0 8px">Хэрэглэгчийн мэдээлэл</h3>
        <p style="margin:0"><strong>Нэр:</strong> ${fullName}</p>
        <p style="margin:0"><strong>Утас:</strong> ${phone || ''}</p>
        <p style="margin:0"><strong>И-мэйл:</strong> ${email || ''}</p>
        <p style="margin:0"><strong>Хаяг:</strong> ${city || ''}, ${address || ''}</p>
      </div>
    `;

    const customerHtml = `
      <div style="font-family: Inter, Arial, sans-serif; padding:20px; color:#111; max-width:600px; margin:auto;">
        <div style="text-align:center;margin-bottom:16px">
          <h2 style="margin:0 0 8px">Баярлалаа, ${first_name || 'Хэрэглэгч'}!</h2>
          <p style="margin:0;color:#666">Таны захиалгыг хүлээн авлаа. Төлбөр QPay-ээс батлагдсан тохиолдолд бид захиалгыг боловсруулна.</p>
        </div>

        <div style="background:#fafafa;padding:12px;border-radius:8px">
          <p style="margin:0 0 8px"><strong>Захиалгын ID:</strong> ${orderId || invoice_id || ''}</p>
          <p style="margin:0 0 8px"><strong>Төлөх дүн:</strong> ${amount ?? paid_amount ?? ''} MNT</p>
          ${renderItems()}
        </div>

        ${qpay_short_url ? `<div style="text-align:center;margin-top:16px"><a href="${qpay_short_url}" style="background:#1565C0;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">QPay төлбөр руу очих</a></div>` : ''}

        <p style="font-size:12px;color:#888;margin-top:18px;">Хэрэв асуулт байвал бидэнтэй холбогдоно уу.</p>
      </div>
    `;

    const mails: Promise<any>[] = [];
    mails.push(
      this.mailerService.sendMail({
        to: 'driftub@gmail.com',
        subject: `🚨 Шинэ захиалга - ${orderId || invoice_id || ''}`,
        html: adminHtml,
      }),
    );

    if (email) {
      mails.push(
        this.mailerService.sendMail({
          to: email,
          subject: `Drift.ub - захиалгын мэдээлэл (${orderId || invoice_id || ''})`,
          html: customerHtml,
        }),
      );
    }

    await Promise.all(mails);
  }
}