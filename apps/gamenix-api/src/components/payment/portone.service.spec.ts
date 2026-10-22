import { HttpService } from '@nestjs/axios';
import { PortoneService } from './portone.service';

const payment = () => ({
	id: 'test-payment', storeId: 'test-store', status: 'PAID', currency: 'KRW',
	channel: { type: 'TEST', id: 'test-channel' },
	amount: { total: 5500, paid: 5500, cancelled: 0 },
	transactionId: 'test-transaction', paidAt: '2026-10-21T00:00:00Z',
	customData: JSON.stringify({ memberId: 'buyer', orderId: 'order' }),
});

describe('PortOne TEST payment boundaries and KakaoPay readiness', () => {
	let service: PortoneService;
	let get: jest.Mock;
	const original = { ...process.env };

	beforeEach(() => {
		process.env = { ...original, NODE_ENV: 'test', PORTONE_ENVIRONMENT: 'SANDBOX',
			PORTONE_V2_API_SECRET: 'offline-test-secret', PORTONE_STORE_ID: 'test-store',
			PORTONE_TEST_CHANNEL_ID: 'test-channel' };
		get = jest.fn().mockResolvedValue({ data: payment() });
		service = new PortoneService({ axiosRef: { get } } as unknown as HttpService);
	});
	afterEach(() => { process.env = { ...original }; });

	it('cannot enable KakaoPay by supplying environment flags or credentials', () => {
		expect(service.configured).toBe(true);
		expect(service.getKakaoPayTestAvailability()).toEqual({ enabled: false, currency: 'KRW',
			requiredCurrency: 'KRW', blockers: ['CHECKOUT_NOT_INTEGRATED'] });
		expect(get).not.toHaveBeenCalled();
	});
	it.each(['production', 'test'])('reports unconfigured sandbox safely in %s', (environment) => {
		process.env.NODE_ENV = environment;
		delete process.env.PORTONE_V2_API_SECRET;
		expect(service.getKakaoPayTestAvailability().blockers).toContain('TEST_CHANNEL_NOT_CONFIGURED');
		expect(service.getKakaoPayTestAvailability().enabled).toBe(false);
		expect(JSON.stringify(service.getKakaoPayTestAvailability())).not.toContain('test-store');
		expect(get).not.toHaveBeenCalled();
	});
	it('rejects production lookup even with sandbox credentials', async () => {
		process.env.NODE_ENV = 'production';
		await expect(service.verifyPaid('test-payment', 5500, 'buyer', 'order')).rejects.toThrow('not configured');
		expect(get).not.toHaveBeenCalled();
	});
	it('accepts only a matching server-side paid capture (no database update)', async () => {
		await expect(service.verifyPaid('test-payment', 5500, 'buyer', 'order')).resolves.toMatchObject({ status: 'PAID' });
		expect(get).toHaveBeenCalledWith('https://api.portone.io/payments/test-payment', expect.objectContaining({
			maxRedirects: 0, params: { storeId: 'test-store' },
		}));
	});
	it.each([
		['reference', { id: 'other' }], ['store', { storeId: 'other' }],
		['live channel', { channel: { type: 'LIVE', id: 'test-channel' } }],
		['foreign channel', { channel: { type: 'TEST', id: 'other' } }],
		['USD against KRW order', { currency: 'USD' }],
		['unpaid', { status: 'READY' }], ['cancelled', { status: 'CANCELLED' }],
		['amount', { amount: { total: 5501, paid: 5501, cancelled: 0 } }],
		['partial capture', { amount: { total: 5500, paid: 5000, cancelled: 0 } }],
		['refund', { amount: { total: 5500, paid: 5500, cancelled: 1 } }],
		['capture reference', { transactionId: '' }], ['capture time', { paidAt: 'invalid' }],
		['owner', { customData: JSON.stringify({ memberId: 'other', orderId: 'order' }) }],
		['order', { customData: JSON.stringify({ memberId: 'buyer', orderId: 'other' }) }],
		['missing binding', { customData: '' }], ['malformed binding', { customData: '{' }],
	])('rejects mismatched %s evidence', async (_, override) => {
		get.mockResolvedValue({ data: { ...payment(), ...override } });
		await expect(service.verifyPaid('test-payment', 5500, 'buyer', 'order')).rejects.toThrow();
	});
	it('sanitizes provider errors that may contain credentials', async () => {
		get.mockRejectedValue(new Error('offline-test-secret provider details'));
		await expect(service.verifyPaid('test-payment', 5500, 'buyer', 'order')).rejects.toThrow('Payment lookup failed');
	});
});
