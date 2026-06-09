import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendOrderConfirmation(dto: any) {
    const { orderId, amount, email, first_name, last_name, address, city, phone, product_details } = dto;

    const adminHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
        <h2 style="color: #ff3333;">🚨 ШИНЭ ЗАХИАЛГА ИРЛЭЭ</h2>
        <p><b>Захиалгын ID:</b> ${orderId}</p>
        <p><b>Нийт дүн:</b> ${amount} MNT</p>
        <p><b>Бараа:</b> ${product_details}</p>
        <hr/>
        <h3>Хэрэглэгчийн мэдээлэл:</h3>
        <p><b>Нэр:</b> ${last_name} ${first_name}</p>
        <p><b>Утас:</b> ${phone}</p>
        <p><b>И-мэйл:</b> ${email}</p>
        <p><b>Хаяг:</b> ${city}, ${address}</p>
      </div>
    `;

    const customerHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #f0f0f0;">
        <h2 style="color: #111;">Сайн байна уу, ${first_name}?</h2>
        <p>Drift.ub дээр захиалга хийсэнд баярлалаа. Таны захиалгыг хүлээж авлаа. Төлбөрөө QPay-ээр гүйцэтгэсний дараа хүргэлт баталгаажих болно.</p>
        <hr style="border: 0; border-top: 1px solid #eee;"/>
        <p><b>Захиалгын ID:</b> ${orderId}</p>
        <p><b>Нийт төлөх дүн:</b> ${amount} MNT</p>
        <p><b>Сонгосон бараа:</b> ${product_details}</p>
        <hr style="border: 0; border-top: 1px solid #eee;"/>
        <p style="font-size: 12px; color: #666;">Асуух зүйл байвал манай вэбсайттай холбогдоно уу.</p>
      </div>
    `;

    await Promise.all([
      this.mailerService.sendMail({
        to: 'driftub@gmail.com', // Админ и-мэйл
        subject: `🚨 Шинэ захиалга - ${orderId}`,
        html: adminHtml,
      }),
      this.mailerService.sendMail({
        to: email, // Хэрэглэгчийн и-мэйл
        subject: `🏎️ Drift.ub захиалгын мэдээлэл (${orderId})`,
        html: customerHtml,
      }),
    ]);
  }
}