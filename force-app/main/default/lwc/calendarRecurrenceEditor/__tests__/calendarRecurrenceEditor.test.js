const CalendarRecurrenceEditor = require('../calendarRecurrenceEditor').default;

const previewLabelGetter = Object.getOwnPropertyDescriptor(
    CalendarRecurrenceEditor.prototype,
    'previewLabel'
).get;

function createContext(overrides = {}) {
    return {
        _rrule: '',
        referenceDate: null,
        freq: 'none',
        interval: 1,
        endMode: 'never',
        endCount: 10,
        endUntil: '',
        weekdays: new Set(['MO']),
        dispatchEvent: jest.fn(),
        _buildRRule: CalendarRecurrenceEditor.prototype._buildRRule,
        _emit: CalendarRecurrenceEditor.prototype._emit,
        _applyInboundRRule: CalendarRecurrenceEditor.prototype._applyInboundRRule,
        ...overrides
    };
}

describe('c-calendar-recurrence-editor', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('starts with non-repeating defaults', async () => {
        const context = createContext({
            freq: 'MONTHLY',
            interval: 4,
            endMode: 'count',
            endCount: 25,
            endUntil: '2026-05-10',
            weekdays: new Set(['SU', 'MO'])
        });

        CalendarRecurrenceEditor.prototype._applyInboundRRule.call(context, '');

        expect(context.freq).toBe('none');
        expect(context.interval).toBe(1);
        expect(context.endMode).toBe('never');
        expect(context.endCount).toBe(10);
        expect(context.endUntil).toBe('');
        expect(Array.from(context.weekdays)).toEqual(['MO']);
        expect(previewLabelGetter.call(context)).toBe('This event does not repeat.');
    });

    it('parses inbound weekly rules with weekday and count settings', async () => {
        const context = createContext();

        CalendarRecurrenceEditor.prototype._applyInboundRRule.call(
            context,
            'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=3'
        );

        expect(context.freq).toBe('WEEKLY');
        expect(context.interval).toBe(2);
        expect(Array.from(context.weekdays)).toEqual(['MO', 'WE']);
        expect(context.endMode).toBe('count');
        expect(context.endCount).toBe(3);
        expect(previewLabelGetter.call(context)).toContain(
            'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=3'
        );
    });

    it('emits weekly rules and requires at least one selected weekday', async () => {
        const context = createContext();

        CalendarRecurrenceEditor.prototype.handleFreqChange.call(context, {
            detail: { value: 'WEEKLY' }
        });
        expect(context.dispatchEvent.mock.calls[0][0].detail.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');

        context.dispatchEvent.mockClear();
        CalendarRecurrenceEditor.prototype.handleWeekdayToggle.call(context, {
            currentTarget: { dataset: { code: 'TU' } }
        });
        expect(context.dispatchEvent.mock.calls[0][0].detail.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,TU');

        context.dispatchEvent.mockClear();
        CalendarRecurrenceEditor.prototype.handleWeekdayToggle.call(context, {
            currentTarget: { dataset: { code: 'MO' } }
        });
        expect(context.dispatchEvent.mock.calls[0][0].detail.rrule).toBe('FREQ=WEEKLY;BYDAY=TU');

        context.dispatchEvent.mockClear();
        CalendarRecurrenceEditor.prototype.handleWeekdayToggle.call(context, {
            currentTarget: { dataset: { code: 'TU' } }
        });
        expect(context.dispatchEvent).not.toHaveBeenCalled();
        expect(Array.from(context.weekdays)).toEqual(['TU']);
    });

    it('clamps interval and count values and formats until dates', async () => {
        const context = createContext();

        CalendarRecurrenceEditor.prototype.handleFreqChange.call(context, {
            detail: { value: 'DAILY' }
        });
        CalendarRecurrenceEditor.prototype.handleIntervalChange.call(context, {
            target: { value: '0' }
        });
        expect(context.interval).toBe(1);

        CalendarRecurrenceEditor.prototype.handleEndModeChange.call(context, {
            detail: { value: 'count' }
        });
        CalendarRecurrenceEditor.prototype.handleEndCountChange.call(context, {
            target: { value: '999' }
        });
        expect(context.endCount).toBe(500);
        expect(context.dispatchEvent.mock.calls[context.dispatchEvent.mock.calls.length - 1][0].detail.rrule).toBe(
            'FREQ=DAILY;COUNT=500'
        );

        CalendarRecurrenceEditor.prototype.handleEndModeChange.call(context, {
            detail: { value: 'until' }
        });
        CalendarRecurrenceEditor.prototype.handleEndUntilChange.call(context, {
            target: { value: '2026-05-10' }
        });
        expect(context.dispatchEvent.mock.calls[context.dispatchEvent.mock.calls.length - 1][0].detail.rrule).toBe(
            'FREQ=DAILY;UNTIL=20260510'
        );
    });
});