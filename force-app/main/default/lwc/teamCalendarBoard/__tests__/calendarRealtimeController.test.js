const {
    subscribe,
    unsubscribe,
    onError,
    isEmpEnabled
} = require('lightning/empApi');
const {
    CALENDAR_EVENT_CHANGE_CHANNEL,
    initializeRealtimeUpdates,
    disconnectRealtimeUpdates,
    queueRealtimeRefresh
} = require('../calendarRealtimeController');

describe('teamCalendarBoard calendarRealtimeController', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        isEmpEnabled.mockResolvedValue(true);
        subscribe.mockResolvedValue({ channel: CALENDAR_EVENT_CHANGE_CHANNEL });
        unsubscribe.mockImplementation((_subscription, callback) => callback());
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('subscribes to the calendar event change channel when empApi is enabled', async () => {
        const context = {
            isConnected: true,
            _invalidateCache: jest.fn(),
            _debouncedLoadEvents: jest.fn()
        };

        const initialized = await initializeRealtimeUpdates(context);

        expect(initialized).toBe(true);
        expect(isEmpEnabled).toHaveBeenCalledTimes(1);
        expect(subscribe).toHaveBeenCalledWith(
            CALENDAR_EVENT_CHANGE_CHANNEL,
            -1,
            expect.any(Function)
        );
        expect(onError).toHaveBeenCalledTimes(1);
        expect(context.realtimeSubscription).toEqual({ channel: CALENDAR_EVENT_CHANGE_CHANNEL });
    });

    it('queues a debounced refresh when a realtime message arrives', async () => {
        let messageCallback;
        subscribe.mockImplementation(async (_channel, _replayId, callback) => {
            messageCallback = callback;
            return { channel: CALENDAR_EVENT_CHANGE_CHANNEL };
        });

        const context = {
            isConnected: true,
            _invalidateCache: jest.fn(),
            _debouncedLoadEvents: jest.fn()
        };

        await initializeRealtimeUpdates(context);
        messageCallback({ data: { payload: { Change_Type__c: 'UPDATED' } } });

        expect(context._invalidateCache).not.toHaveBeenCalled();
        expect(context._debouncedLoadEvents).not.toHaveBeenCalled();

        jest.advanceTimersByTime(300);

        expect(context._invalidateCache).toHaveBeenCalledTimes(1);
        expect(context._debouncedLoadEvents).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes and clears pending refresh timers on disconnect', async () => {
        const context = {
            isConnected: true,
            _invalidateCache: jest.fn(),
            _debouncedLoadEvents: jest.fn(),
            realtimeSubscription: { channel: CALENDAR_EVENT_CHANGE_CHANNEL }
        };

        queueRealtimeRefresh(context);
        const disconnected = await disconnectRealtimeUpdates(context);

        expect(disconnected).toBe(true);
        expect(unsubscribe).toHaveBeenCalledWith(
            { channel: CALENDAR_EVENT_CHANGE_CHANNEL },
            expect.any(Function)
        );

        jest.advanceTimersByTime(300);
        expect(context._invalidateCache).not.toHaveBeenCalled();
        expect(context._debouncedLoadEvents).not.toHaveBeenCalled();
    });
});