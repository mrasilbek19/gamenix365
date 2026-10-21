import {
	BadRequestException,
	Injectable,
	Logger,
	OnModuleInit,
	ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

const PORTONE_API_BASE = 'https://api.portone.io';

/** The subset of Petora's PortOne payment used for TEST-only verification. */
export interface PortonePayment {
	id: string;
	status: string;
	storeId?: string;
	transactionId?: string;
	paidAt?: string;
	currency?: string;
	amount?: { total?: number; paid?: number; cancelled?: number };
	customData?: string;
	channel?: { type?: string; id?: string; pgProvider?: string };
}

@Injectable()
export class PortoneService implements OnModuleInit {
	private readonly logger = new Logger(PortoneService.name);

	constructor(private readonly http: HttpService) {}

	private get apiSecret(): string {
		return process.env.PORTONE_V2_API_SECRET ?? '';
	}

	public get configured(): boolean {
		return process.env.NODE_ENV !== 'production' && process.env.PORTONE_ENVIRONMENT === 'SANDBOX' &&
			[this.apiSecret, process.env.PORTONE_STORE_ID, process.env.PORTONE_TEST_CHANNEL_ID]
				.every((value) => typeof value === 'string' && value.trim().length > 0);
	}

	/** Readiness only: current USD orders cannot enter KakaoPay's KRW-only checkout. */
	public getKakaoPayTestAvailability() {
		const blockers = ['KRW_PRICING_REQUIRED', 'CHECKOUT_NOT_INTEGRATED'];
		if (!this.configured) blockers.push('TEST_CHANNEL_NOT_CONFIGURED');
		return { enabled: false, currency: 'USD', requiredCurrency: 'KRW', blockers };
	}

	public onModuleInit(): void {
		if (this.configured) return;
		this.logger.warn('PortOne TEST verification is not configured; payment checkout is unavailable.');
	}

	public async getPayment(paymentId: string): Promise<PortonePayment> {
		if (!this.configured) {
			throw new ServiceUnavailableException('PortOne TEST verification is not configured');
		}
		if (typeof paymentId !== 'string' || !paymentId.trim() || paymentId.length > 200) {
			throw new BadRequestException('Invalid payment reference');
		}

		let payment: PortonePayment;
		try {
			const { data } = await this.http.axiosRef.get<PortonePayment>(
				`${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
				{
					headers: { Authorization: `PortOne ${this.apiSecret}` },
					params: { storeId: process.env.PORTONE_STORE_ID },
					timeout: 10_000,
					maxRedirects: 0,
					maxContentLength: 65536,
				},
			);
			payment = data;
		} catch (err) {
			if (err?.response?.status === 404) {
				throw new BadRequestException('Payment not found');
			}
			// Axios errors can contain credentials and provider response data.
			throw new ServiceUnavailableException('Payment lookup failed');
		}
		if (!payment || payment.id !== paymentId || payment.storeId !== process.env.PORTONE_STORE_ID ||
			payment.channel?.type !== 'TEST' || payment.channel.id !== process.env.PORTONE_TEST_CHANNEL_ID ||
			payment.currency !== 'USD') {
			throw new BadRequestException('Payment identity, TEST channel or currency mismatch');
		}
		return payment;
	}

	/** Petora's paid lookup, adapted to server-owned Gamenix USD cents and order/member bindings. */
	public async verifyPaid(
		paymentId: string,
		expectedAmount: number,
		memberId: string,
		orderId: string,
	): Promise<PortonePayment> {
		if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0 || !memberId || !orderId) {
			throw new BadRequestException('Invalid expected payment details');
		}
		const payment = await this.getPayment(paymentId);

		if (payment.status !== 'PAID') {
			throw new BadRequestException(`Payment is not completed (status: ${payment.status})`);
		}
		if (payment.amount?.total !== expectedAmount || payment.amount.paid !== expectedAmount ||
			payment.amount.cancelled !== 0) {
			throw new BadRequestException('Paid amount does not match the order total');
		}
		if (typeof payment.transactionId !== 'string' || !payment.transactionId ||
			typeof payment.paidAt !== 'string' || !Number.isFinite(new Date(payment.paidAt).getTime())) {
			throw new BadRequestException('Payment capture evidence is incomplete');
		}

		let binding: { memberId?: string; orderId?: string };
		try {
			binding = payment.customData ? JSON.parse(payment.customData) : null;
		} catch {
			throw new BadRequestException('Payment order binding is missing');
		}
		if (binding?.memberId !== memberId || binding?.orderId !== orderId) {
			throw new BadRequestException('Payment does not belong to this member and order');
		}
		return payment;
	}
}
