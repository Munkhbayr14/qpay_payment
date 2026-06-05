import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class QpayPayment {
  @PrimaryKey()
  id!: number;

  @Property()
  orderId!: string;

  @Property()
  invoiceId!: string;

  @Property()
  amount!: number;

  @Property({ nullable: true })
  paymentId?: string;

  @Property({ default: false })
  paid: boolean = false;

  @Property({ nullable: true })
  paidAmount?: number;

  @Property({ nullable: true })
  status?: string;

  @Property({ nullable: true })
  qpayShortUrl?: string;

  @Property({ type: 'text', nullable: true })
  metadata?: string;

  @Property()
  createdAt = new Date();

  @Property({ onUpdate: () => new Date(), nullable: true })
  updatedAt = new Date();

  @Property({ nullable: true })
  paidAt?: Date;

  @Property({ nullable: true })
  callbackReceivedAt?: Date;
}
