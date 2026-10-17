import { Logger } from '@nestjs/common';
import { PaymentWorker } from './payment.worker';

describe('Payment batch scheduling', () => {
    it('schedules events before payment retrieval and skips overlapping local ticks', async () => {
        let release: () => void;
        const events = new Promise<void>((resolve) => { release = resolve; });
        const service = { processDueEvents: jest.fn(() => events), processDuePayments: jest.fn(async () => 0) };
        const worker = new PaymentWorker(service as any);
        const first = worker.reconcile();
        await worker.reconcile();
        expect(service.processDueEvents).toHaveBeenCalledTimes(1);
        expect(service.processDuePayments).not.toHaveBeenCalled();
        release(); await first;
        expect(service.processDuePayments).toHaveBeenCalledTimes(1);
    });
    it('releases its local guard after failures without logging provider details', async () => {
        const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const service = { processDueEvents: jest.fn().mockRejectedValueOnce(new Error('sensitive-provider-detail')).mockResolvedValue(0),
            processDuePayments: jest.fn(async () => 0) };
        try {
            const worker = new PaymentWorker(service as any);
            await worker.reconcile(); await worker.reconcile();
            expect(service.processDuePayments).toHaveBeenCalledTimes(1);
            expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive-provider-detail');
        } finally { log.mockRestore(); }
    });
});
