import { Logger } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { firstValueFrom, of } from 'rxjs';
import { LoggingInterceptor } from '../../libs/interceptor/Logging.interceptor';

describe('Payment GraphQL request/response redaction', () => {
    it.each([
        ['createTestCheckoutSession', { query: 'mutation { createTestCheckoutSession { checkoutUrl } }' }],
        ['getMember', { query: 'query { member: getMember { _id } private: getPaymentStatus(paymentId: "id") { _id } }' }],
        ['getMember', [{ query: 'query { getPaymentStatus(paymentId: "id") { _id } }' }]],
    ])('redacts %s, including aliases and mixed operations', async (fieldName, body) => {
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        const context = jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
            getInfo: () => ({ fieldName }), getContext: () => ({ req: { body, secret: 'synthetic-request-secret' } }),
        } as any);
        try {
            await firstValueFrom(new LoggingInterceptor().intercept({ getType: () => 'graphql' } as any,
                { handle: () => of({ checkoutUrl: 'https://checkout.example.test/private-session', secret: 'synthetic-response-secret' }) }));
            const output = JSON.stringify(log.mock.calls);
            expect(output).toContain(fieldName);
            expect(output).not.toContain('private-session');
            expect(output).not.toContain('synthetic-response-secret');
            expect(output).not.toContain('synthetic-request-secret');
        } finally { log.mockRestore(); context.mockRestore(); }
    });
});
