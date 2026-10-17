import { Logger } from '@nestjs/common';
import { OrderEmailWorker } from './order-email.worker';

describe('Order email batch scheduling', () => {
    afterEach(() => jest.restoreAllMocks());

    it('prevents overlapping polls in one process', async () => {
        let finish: () => void;
        const queue = { processDueEmails: jest.fn(() => new Promise<void>((resolve) => { finish = resolve; })) };
        const worker = new OrderEmailWorker(queue as any);
        const first = worker.deliverOrderEmails();
        await worker.deliverOrderEmails();
        expect(queue.processDueEmails).toHaveBeenCalledTimes(1);
        finish();
        await first;
        queue.processDueEmails.mockResolvedValue(undefined);
        await worker.deliverOrderEmails();
        expect(queue.processDueEmails).toHaveBeenCalledTimes(2);
    });

    it('resumes after database failures and keeps private errors out of logs', async () => {
        const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
        const queue = { processDueEmails: jest.fn().mockRejectedValueOnce(new Error('private-recipient@example.test')).mockResolvedValue(0) };
        const worker = new OrderEmailWorker(queue as any);
        await worker.deliverOrderEmails();
        await worker.deliverOrderEmails();
        expect(queue.processDueEmails).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(log.mock.calls)).not.toContain('private-recipient');
    });
});
