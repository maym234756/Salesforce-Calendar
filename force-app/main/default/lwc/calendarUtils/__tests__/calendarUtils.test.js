import {
    dateKey,
    buildDefaultDateTime,
    getVisibleRange,
    buildRangeLabel,
    buildAgendaGroups,
    buildCalendarWeeks,
    buildDayViewData,
    sanitizeColor,
    readableTextColor
} from 'c/calendarUtils';

function localIso(year, monthIndex, day, hour = 0, minute = 0) {
    return new Date(year, monthIndex, day, hour, minute, 0, 0).toISOString();
}

function findDay(weeks, key) {
    return weeks.flatMap((week) => week.days).find((day) => day.key === key);
}

afterEach(() => {
    jest.useRealTimers();
});

describe('calendarUtils – dateKey', () => {
    it('formats a Date object as YYYY-MM-DD', () => {
        expect(dateKey(new Date(2026, 3, 18))).toBe('2026-04-18');
    });

    it('formats a date string as YYYY-MM-DD', () => {
        expect(dateKey('2026-12-01T08:00:00.000Z')).toBe('2026-12-01');
    });
});

describe('calendarUtils – buildDefaultDateTime', () => {
    it('returns null for null input', () => {
        expect(buildDefaultDateTime(null)).toBeNull();
    });

    it('sets the hour to 9 by default for a YYYY-MM-DD string', () => {
        const result = buildDefaultDateTime('2026-04-18');
        const d = new Date(result);
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(3);
        expect(d.getDate()).toBe(18);
        expect(d.getHours()).toBe(9);
    });

    it('accepts a custom hour', () => {
        const result = buildDefaultDateTime('2026-04-18', 14);
        expect(new Date(result).getHours()).toBe(14);
    });

    it('returns null for completely invalid input', () => {
        expect(buildDefaultDateTime('not-a-date')).toBeNull();
    });
});

describe('calendarUtils – getVisibleRange', () => {
    it('returns a single day range for day view', () => {
        const d = new Date(2026, 3, 18);
        const { startDate, endDate } = getVisibleRange(d, 'day');
        expect(startDate).toBe('2026-04-18');
        expect(endDate).toBe('2026-04-18');
    });

    it('returns a 7-day range starting on Sunday for week view', () => {
        // April 18 2026 is a Saturday — week should start April 12 (Sun)
        const d = new Date(2026, 3, 18);
        const { startDate, endDate } = getVisibleRange(d, 'week');
        const start = new Date(`${startDate}T12:00:00`);
        expect(start.getDay()).toBe(0); // Sunday
        const end = new Date(`${endDate}T12:00:00`);
        const diff = (end - start) / (1000 * 60 * 60 * 24);
        expect(diff).toBe(6);
    });

    it('returns full calendar month boundaries for month view', () => {
        const d = new Date(2026, 3, 1); // April
        const { startDate, endDate } = getVisibleRange(d, 'month');
        const start = new Date(`${startDate}T12:00:00`);
        expect(start.getDay()).toBe(0); // starts on a Sunday
        const end = new Date(`${endDate}T12:00:00`);
        const diff = (end - start) / (1000 * 60 * 60 * 24);
        expect(diff).toBe(41); // 6 weeks − 1
    });

    it('returns full-month range for agenda view', () => {
        const d = new Date(2026, 3, 15);
        const { startDate, endDate } = getVisibleRange(d, 'agenda');
        expect(startDate).toBe('2026-04-01');
        expect(endDate).toBe('2026-04-30');
    });
});

describe('calendarUtils – buildRangeLabel', () => {
    it('formats day view as long weekday + date', () => {
        const label = buildRangeLabel(new Date(2026, 3, 18), 'day');
        expect(label).toContain('2026');
        expect(label).toContain('April');
        expect(label).toContain('18');
    });

    it('formats month view as "Month Year"', () => {
        const label = buildRangeLabel(new Date(2026, 3, 1), 'month');
        expect(label).toBe('April 2026');
    });

    it('appends Agenda suffix for agenda view', () => {
        const label = buildRangeLabel(new Date(2026, 3, 1), 'agenda');
        expect(label).toContain('Agenda');
    });

    it('appends Team Load suffix for teamLoad view', () => {
        const label = buildRangeLabel(new Date(2026, 3, 1), 'teamLoad');
        expect(label).toContain('Team Load');
    });

    it('appends Conflicts suffix for conflicts view', () => {
        const label = buildRangeLabel(new Date(2026, 3, 1), 'conflicts');
        expect(label).toContain('Conflicts');
    });

    it('formats week view as date range', () => {
        const label = buildRangeLabel(new Date(2026, 3, 18), 'week');
        expect(label).toMatch(/-/); // range separator
    });
});

describe('calendarUtils – buildAgendaGroups', () => {
    it('returns empty array for no events', () => {
        expect(buildAgendaGroups([])).toEqual([]);
        expect(buildAgendaGroups(null)).toEqual([]);
    });

    it('groups events by day sorted chronologically', () => {
        const events = [
            { id: 'b', start: '2026-04-19T09:00:00.000Z', calendarColor: '#0176d3' },
            { id: 'a', start: '2026-04-18T14:00:00.000Z', calendarColor: '#0176d3' }
        ];
        const groups = buildAgendaGroups(events);
        expect(groups.length).toBe(2);
        expect(groups[0].key).toBe('2026-04-18');
        expect(groups[1].key).toBe('2026-04-19');
    });

    it('places multiple events in the same day group', () => {
        const events = [
            { id: 'a', start: '2026-04-18T09:00:00.000Z', calendarColor: '#ff0000' },
            { id: 'b', start: '2026-04-18T14:00:00.000Z', calendarColor: '#00ff00' }
        ];
        const groups = buildAgendaGroups(events);
        expect(groups.length).toBe(1);
        expect(groups[0].events.length).toBe(2);
    });

    it('builds a correct countLabel', () => {
        const events = [
            { id: 'a', start: '2026-04-18T09:00:00.000Z', calendarColor: '#0176d3' }
        ];
        const groups = buildAgendaGroups(events);
        expect(groups[0].countLabel).toBe('1 event');
    });

    it('pluralises countLabel for multiple events', () => {
        const events = [
            { id: 'a', start: '2026-04-18T09:00:00.000Z', calendarColor: '#0176d3' },
            { id: 'b', start: '2026-04-18T12:00:00.000Z', calendarColor: '#0176d3' }
        ];
        const groups = buildAgendaGroups(events);
        expect(groups[0].countLabel).toBe('2 events');
    });

    it('skips events with no valid start date', () => {
        const events = [
            { id: 'a', start: null, calendarColor: '#0176d3' },
            { id: 'b', start: 'not-a-date', calendarColor: '#0176d3' }
        ];
        expect(buildAgendaGroups(events)).toEqual([]);
    });
});

describe('calendarUtils – buildCalendarWeeks', () => {
    it('builds spanning rows and hover details for month cells', () => {
        const weeks = buildCalendarWeeks(new Date(2026, 3, 15), 'month', [
            {
                id: 'span',
                name: 'Quarterly Summit',
                start: localIso(2026, 3, 14, 9),
                endDateTime: localIso(2026, 3, 16, 11),
                calendarName: 'Revenue',
                status: 'Confirmed',
                syncStatus: 'Synced',
                notes: 'Bring slides.',
                hoverDetails: ['Room 201'],
                calendarColor: 'not-a-color',
                canDelete: true,
                hasContextMenu: true
            },
            {
                id: 'all-day',
                name: 'Travel Day',
                start: localIso(2026, 3, 14, 0),
                endDateTime: localIso(2026, 3, 15, 23, 59),
                allDay: true,
                status: 'Cancelled',
                calendarColor: '#ff0000'
            },
            { id: 'timed-1', start: localIso(2026, 3, 14, 8), calendarColor: '#0176d3' },
            { id: 'timed-2', start: localIso(2026, 3, 14, 10), calendarColor: '#0176d3' },
            { id: 'timed-3', start: localIso(2026, 3, 14, 11), calendarColor: '#0176d3' },
            { id: 'timed-4', start: localIso(2026, 3, 14, 12), calendarColor: '#0176d3' },
            { id: 'timed-5', start: localIso(2026, 3, 14, 13), calendarColor: '#0176d3' }
        ]);

        const mutedDay = findDay(weeks, '2026-03-29');
        expect(mutedDay.className).toContain('day-cell--muted');

        const day14 = findDay(weeks, '2026-04-14');
        const day15 = findDay(weeks, '2026-04-15');
        const day16 = findDay(weeks, '2026-04-16');
        const startSpan = day14.events.find((eventRecord) => eventRecord.id === 'span');
        const middleSpan = day15.events.find((eventRecord) => eventRecord.id === 'span');
        const endSpan = day16.events.find((eventRecord) => eventRecord.id === 'span');

        expect(day14.hiddenCount).toBe(0);
        expect(day14.showMore).toBe(false);
        expect(day14.events.find((eventRecord) => eventRecord.id === 'all-day').timeLabel).toBe(
            'All Day'
        );

        expect(startSpan.timeLabel).toMatch(/^Starts /);
        expect(startSpan.hoverText).toContain('Sync: Synced');
        expect(startSpan.hoverText).toContain('Bring slides.');
        expect(startSpan.hoverText).toContain('Room 201');
        expect(startSpan.styleText).toContain('background:#1b96ff');

        expect(middleSpan.timeLabel).toBe('Continues');
        expect(middleSpan.className).toContain('event-pill--continued');
        expect(endSpan.timeLabel).toMatch(/^Until /);
    });

    it('keeps single-day all-day records in the inline month cell list', () => {
        const weeks = buildCalendarWeeks(new Date(2026, 3, 15), 'month', [
            {
                id: 'all-day-1',
                name: 'Boston Whaler 130 Sport',
                start: localIso(2026, 3, 14, 0),
                endDateTime: localIso(2026, 3, 14, 0),
                allDay: true,
                calendarColor: '#b57a2a'
            },
            {
                id: 'all-day-2',
                name: 'Sportsman 247 Masters',
                start: localIso(2026, 3, 14, 0),
                endDateTime: localIso(2026, 3, 14, 0),
                allDay: true,
                calendarColor: '#b57a2a'
            },
            {
                id: 'all-day-3',
                name: 'Shallow Master 18 Sport',
                start: localIso(2026, 3, 14, 0),
                endDateTime: localIso(2026, 3, 14, 0),
                allDay: true,
                calendarColor: '#b57a2a'
            },
            {
                id: 'all-day-4',
                name: 'Pathfinder 2400 TRS',
                start: localIso(2026, 3, 14, 0),
                endDateTime: localIso(2026, 3, 14, 0),
                allDay: true,
                calendarColor: '#b57a2a'
            }
        ]);

        const day14 = findDay(weeks, '2026-04-14');

        expect(day14.hiddenCount).toBe(0);
        expect(day14.showMore).toBe(false);
        expect(day14.events).toHaveLength(4);
        expect(day14.events.every((eventRecord) => eventRecord.isAllDay)).toBe(true);
        expect(day14.events.every((eventRecord) => eventRecord.isContinuation === false)).toBe(true);
        expect(day14.events.every((eventRecord) => eventRecord.continuesAfter === false)).toBe(true);
    });
});

describe('calendarUtils – buildDayViewData', () => {
    it('builds all-day, overlapping, and fallback timed rows for the selected day', () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 3, 19, 10, 15, 0, 0));

        const data = buildDayViewData(new Date(2026, 3, 19), [
            {
                id: 'all-day',
                name: 'Company Offsite',
                start: localIso(2026, 3, 18, 0),
                endDateTime: localIso(2026, 3, 20, 23, 59),
                allDay: true,
                status: 'Cancelled',
                calendarColor: '#ff0000'
            },
            {
                id: 'timed-1',
                name: 'Design Review',
                start: localIso(2026, 3, 19, 9),
                endDateTime: localIso(2026, 3, 19, 10, 30),
                calendarName: 'Revenue',
                status: 'Confirmed'
            },
            {
                id: 'timed-2',
                start: localIso(2026, 3, 19, 9, 15),
                calendarName: 'Revenue'
            },
            {
                id: 'timed-3',
                start: localIso(2026, 3, 19, 23, 45),
                endDateTime: localIso(2026, 3, 19, 23, 30),
                status: 'Cancelled'
            },
            {
                id: 'next-day',
                start: localIso(2026, 3, 20, 8),
                endDateTime: localIso(2026, 3, 20, 9)
            },
            {
                id: 'invalid',
                start: 'not-a-date'
            }
        ]);

        expect(data.hourSlots).toHaveLength(24);
        expect(data.isToday).toBe(true);
        expect(data.nowLineStyle).toMatch(/^top: \d+px;$/);
        expect(data.hasAllDayEvents).toBe(true);
        expect(data.allDayEvents).toHaveLength(1);
        expect(data.allDayEvents[0].className).toContain('event-pill--cancelled');

        expect(data.timedEvents).toHaveLength(3);

        const review = data.timedEvents.find((eventRecord) => eventRecord.id === 'timed-1');
        const overlap = data.timedEvents.find((eventRecord) => eventRecord.id === 'timed-2');
        const late = data.timedEvents.find((eventRecord) => eventRecord.id === 'timed-3');

        expect(review.blockStyle).toContain('width: calc(50.0% - 4px);');
        expect(review.blockStyle).toContain('left: calc(0.0% + 2px);');
        expect(review.hoverText).toContain('Calendar: Revenue');
        expect(review.className).toContain('event-pill--confirmed');

        expect(overlap.blockStyle).toContain('width: calc(50.0% - 4px);');
        expect(overlap.blockStyle).toContain('left: calc(50.0% + 2px);');
        expect(overlap.heightPx).toBe(32);

        expect(late.topPx).toBe(1520);
        expect(late.heightPx).toBe(32);
    });

    it('returns an empty now-line and no timed events for non-current dates', () => {
        const data = buildDayViewData(new Date(2026, 3, 21), [
            { id: 'next-day', start: localIso(2026, 3, 22, 8), endDateTime: localIso(2026, 3, 22, 9) },
            { id: 'invalid', start: null }
        ]);

        expect(data.isToday).toBe(false);
        expect(data.nowLineStyle).toBe('');
        expect(data.allDayEvents).toEqual([]);
        expect(data.timedEvents).toEqual([]);
    });
});

describe('calendarUtils – sanitizeColor', () => {
    it('returns the input for a valid 6-digit hex', () => {
        expect(sanitizeColor('#0176d3')).toBe('#0176d3');
    });

    it('returns the input for a valid 3-digit hex', () => {
        expect(sanitizeColor('#f0f')).toBe('#f0f');
    });

    it('returns the default color for invalid input', () => {
        expect(sanitizeColor('not-a-color')).toBe('#1b96ff');
        expect(sanitizeColor(null)).toBe('#1b96ff');
        expect(sanitizeColor(undefined)).toBe('#1b96ff');
    });
});

describe('calendarUtils – readableTextColor', () => {
    it('returns dark text on a light background', () => {
        expect(readableTextColor('#ffffff')).toBe('#080707');
        expect(readableTextColor('#f3f2f2')).toBe('#080707');
    });

    it('returns white text on a dark background', () => {
        expect(readableTextColor('#032d60')).toBe('#ffffff');
        expect(readableTextColor('#000000')).toBe('#ffffff');
    });

    it('expands 3-digit shorthand hex before computing brightness', () => {
        // #fff = white → dark text
        expect(readableTextColor('#fff')).toBe('#080707');
    });

    it('falls back to dark text for invalid input', () => {
        expect(readableTextColor('invalid')).toBe('#080707');
    });
});
