import { Entity, PrimaryKey, ManyToOne, Property } from '@mikro-orm/core';
import { QpayPayment } from './qpay-payment.entity';

@Entity()
export class QpayRequestLog {
  @PrimaryKey()
  id!: number;

  @ManyToOne(() => QpayPayment)
  payment!: QpayPayment;

  @Property()
  type!: string;

  @Property({ type: 'text', nullable: true })
  requestPayload?: string;

  @Property({ type: 'text', nullable: true })
  responsePayload?: string;

  @Property({ type: 'text', nullable: true })
  note?: string;

  @Property()
  createdAt = new Date();
}
