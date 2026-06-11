import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

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

    const fullName    = `${last_name || ''} ${first_name || ''}`.trim() || 'Хэрэглэгч';
    const displayId   = orderId || invoice_id || '';
    const displayAmt  = paid_amount ?? amount ?? '';

    // 🔥 ШИНЭЧИЛСЭН БАРААНЫ ЖАГСААЛТ (ЗУРАГТАЙ HTML ТЭМПЛЭЙТ)
    const renderItems = (): string => {
      if (Array.isArray(items) && items.length > 0) {
        return `
          <table style="width:100%;border-collapse:collapse;margin-top:12px">
            <thead>
              <tr style="background:#f5f5f5">
                <th style="text-align:left;padding:8px;border-bottom:1px solid #eee" colspan="2">Бараа</th>
                <th style="text-align:right;padding:8px;border-bottom:1px solid #eee">Үнэ</th>
                <th style="text-align:center;padding:8px;border-bottom:1px solid #eee">Тоо</th>
              </tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (it: any) => {
                    // Зургийн линк байгаа эсэхийг шалгана
                    const imgUrl = it.image || '';
                    const imgTd = imgUrl 
                      ? `<td style="padding:8px;border-bottom:1px solid #f6f6f6;width:60px;vertical-align:middle">
                           <img src="${imgUrl}" alt="${it.title || ''}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;border:1px solid #eee;display:block"/>
                         </td>`
                      : `<td style="padding:8px;border-bottom:1px solid #f6f6f6;width:1px"></td>`; // Зураггүй бол зай эзлэхгүй

                    // Хэрэв сагснаас урсгалаар variant_title ирсэн бол нэрэн дээр нь залгаж харуулна
                    const itemTitle = it.title || it.name || '';
                    const variantSuffix = it.variant_title ? ` - <span style="color:#666;font-size:13px">${it.variant_title}</span>` : '';

                    return `
                <tr>
                  ${imgTd}
                  <td style="padding:8px;border-bottom:1px solid #f6f6f6;vertical-align:middle">
                    <span style="font-weight:500">${itemTitle}</span>${variantSuffix}
                  </td>
                  <td style="padding:8px;text-align:right;border-bottom:1px solid #f6f6f6;vertical-align:middle">
                    ${Number(it.price ?? 0).toLocaleString()} MNT
                  </td>
                  <td style="padding:8px;text-align:center;border-bottom:1px solid #f6f6f6;vertical-align:middle">
                    ${it.quantity ?? 1}
                  </td>
                </tr>`;
                  }
                )
                .join('')}
            </tbody>
          </table>`;
      }
      if (product_details) return `<p style="margin-top:12px">${product_details}</p>`;
      return '';
    };

    // ── ADMIN EMAIL ──────────────────────────────────────────────────────────
    const adminHtml = `
      <div style="font-family:Arial,sans-serif;padding:24px;color:#111;max-width:600px">
        <h2 style="color:#d32f2f;margin:0 0 16px">🚨 ШИНЭ ЗАХИАЛГА ИРЛЭЭ</h2>

        <div style="background:#fff3f3;border:1px solid #ffcdd2;border-radius:8px;padding:16px;margin-bottom:16px">
          <p style="margin:0 0 6px"><strong>Захиалгын ID:</strong> ${displayId}</p>
          <p style="margin:0 0 6px"><strong>Нийт дүн:</strong> ${Number(displayAmt).toLocaleString()} MNT</p>
          <p style="margin:0"><strong>Төлбөр:</strong> <span style="color:#2e7d32;font-weight:bold">✅ ТӨЛӨГДСӨН (QPay)</span></p>
        </div>

        ${renderItems()}

        <hr style="border:0;border-top:1px solid #eee;margin:20px 0"/>

        <h3 style="margin:0 0 12px">👤 Хэрэглэгчийн мэдээлэл</h3>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#666;width:100px">Нэр</td><td style="padding:6px 0"><strong>${fullName}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666">Утас</td><td style="padding:6px 0">${phone || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#666">И-мэйл</td><td style="padding:6px 0">${email || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Хаяг</td><td style="padding:6px 0">${city || ''}${city && address ? ', ' : ''}${address || ''}</td></tr>
        </table>
      </div>`;

    // ── ХЭРЭГЛЭГЧИЙН EMAIL ───────────────────────────────────────────────────
    const customerHtml = `
      <div style="font-family:Arial,sans-serif;padding:24px;color:#111;max-width:600px;margin:auto">
        <div style="text-align:center;margin-bottom:24px">
          <h2 style="margin:0 0 8px">✅ Баярлалаа, ${first_name || 'та'}!</h2>
          <p style="margin:0;color:#555">Таны захиалга амжилттай баталгаажлаа.</p>
        </div>

        <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin-bottom:16px">
          <p style="margin:0 0 6px"><strong>Захиалгын ID:</strong> ${displayId}</p>
          <p style="margin:0 0 6px"><strong>Нийт дүн:</strong> ${Number(displayAmt).toLocaleString()} MNT</p>
          <p style="margin:0"><strong>Хүргэлтийн хаяг:</strong> ${city || ''}${city && address ? ', ' : ''}${address || ''}</p>
        </div>

        ${renderItems()}

        <p style="margin-top:20px;color:#555">
         Таны хүргэлт танд 24-36 цаг хооронд хүргэгдэнэ.
        </p>

        <p style="font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
          Асуулт байвал <a href="mailto:driftub@gmail.com" style="color:#1565C0">driftub@gmail.com</a>-д хандана уу.
        </p>
      </div>`;

    const tasks: Promise<any>[] = [];

    tasks.push(
      this.mailerService
        .sendMail({
          to:      'driftub@gmail.com',
          subject: `🚨 Шинэ захиалга — ${displayId}`,
          html:    adminHtml,
        })
        .then(() => this.logger.log(`Admin email илгээлээ: ${displayId}`))
        .catch((err) => this.logger.error('Admin email алдаа:', err?.message)),
    );

    if (email) {
      tasks.push(
        this.mailerService
          .sendMail({
            to:      email,
            subject: `Drift.ub — захиалга хүлээн авлаа (${displayId})`,
            html:    customerHtml,
          })
          .then(() => this.logger.log(`Хэрэглэгчийн email илгээлээ: ${email}`))
          .catch((err) => this.logger.error(`Хэрэглэгчийн email алдаа (${email}):`, err?.message)),
      );
    } else {
      this.logger.warn(`Хэрэглэгчийн email байхгүй — зөвхөн admin руу илгээлээ (${displayId})`);
    }

    await Promise.all(tasks);
  }
}