const { createPoller } = require('../poller');

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
}

describe('calendarUtils poller', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('runs immediately and stops after reaching the max attempts', async () => {
        const fn = jest.fn(() => Promise.resolve());
        const poller = createPoller({ fn, intervalMs: 100, maxAttempts: 3 });

        poller.start();
        await flushMicrotasks();

        expect(fn).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(100);
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(100);
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(3);

        jest.advanceTimersByTime(300);
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('cancels future ticks when stop is called', async () => {
        const fn = jest.fn(() => Promise.resolve());
        const poller = createPoller({ fn, intervalMs: 50, maxAttempts: 5 });

        poller.start();
        await flushMicrotasks();
        poller.stop();

        jest.advanceTimersByTime(500);
        await flushMicrotasks();

        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('swallows errors and continues polling until the limit is reached', async () => {
        const fn = jest
            .fn()
            .mockRejectedValueOnce(new Error('transient'))
            .mockResolvedValueOnce()
            .mockResolvedValueOnce();
        const poller = createPoller({ fn, intervalMs: 50, maxAttempts: 2 });

        poller.start();
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(50);
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(100);
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(2);
    });
});