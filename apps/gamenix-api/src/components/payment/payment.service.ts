import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment } from '../../libs/dto/payment/payment';
import { PaymentRecord } from '../../libs/dto/payment/payment-record';
import { PaymentEnvironment } from '../../libs/enums/payment.enum';

const PUBLIC_PAYMENT_FIELDS = {
    _id: 1, orderId: 1, shopId: 1, status: 1, environment: 1, currency: 1,
    amountMinor: 1, reconciliationStatus: 1, verifiedAt: 1, expiresAt: 1, createdAt: 1, updatedAt: 1,
} as const;

@Injectable()
export class PaymentService {
    constructor(@InjectModel('Payment') private readonly paymentModel: Model<PaymentRecord>) {}

    /** Reads local facts only; never trusts a browser result or calls a provider. */
    public async getPaymentStatus(memberId: Types.ObjectId | string, paymentId: string): Promise<Payment> {
        if (!/^[a-f\d]{24}$/i.test(String(memberId))) throw new UnauthorizedException('Authentication required');
        if (!/^[a-f\d]{24}$/i.test(paymentId)) throw new BadRequestException('Invalid payment ID');

        const payment = await this.paymentModel.findOne({
            _id: new Types.ObjectId(paymentId),
            memberId: new Types.ObjectId(String(memberId)),
            environment: PaymentEnvironment.SANDBOX,
        }).select(PUBLIC_PAYMENT_FIELDS).lean().exec();

        // Deliberately identical for an unknown payment and another buyer's payment.
        if (!payment) throw new NotFoundException('Payment not found');
        return payment;
    }
}
