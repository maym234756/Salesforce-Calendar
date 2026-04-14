export function dateKey(dateValue) {
    const y = dateValue.getFullYear();
    const m = String(dateValue.getMonth() + 1).padStart(2, '0');
    const d = String(dateValue.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function formatTime(dateValue) {
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    }).format(dateValue);
}

export function formatAgendaDate(dateValue) {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(new Date(dateValue + 'T12:00:00'));
}

export function buildDefaultDateTime(dateText, hour) {
    const [year, month, day] = dateText.split('-').map((value) => parseInt(value, 10));
    const dt = new Date(year, month - 1, day, hour, 0, 0, 0);
    return dt.toISOString();
}

export function getVisibleRange(currentDate, currentView) {
    if (currentView === 'week') {
        const start = new Date(currentDate);
        start.setDate(start.getDate() - start.getDay());

        const end = new Date(start);
        end.setDate(end.getDate() + 6);

        return {
            startDate: dateKey(start),
            endDate: dateKey(end)
        };
    }

    if (currentView === 'agenda') {
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        return {
            startDate: dateKey(start),
            endDate: dateKey(end)
        };
    }

    const year = currentDate.getFullYear();
    const monthIndex = currentDate.getMonth();

    const firstOfMonth = new Date(year, monthIndex, 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay());

    const end = new Date(start);
    end.setDate(end.getDate() + 41);

    return {
        startDate: dateKey(start),
        endDate: dateKey(end)
    };
}

export function buildRangeLabel(currentDate, currentView) {
    if (currentView === 'week') {
        const range = getVisibleRange(currentDate, currentView);
        const start = new Date(range.startDate + 'T12:00:00');
        const end = new Date(range.endDate + 'T12:00:00');

        const startText = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric'
        }).format(start);

        const endText = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }).format(end);

        return `${startText} - ${endText}`;
    }

    if (currentView === 'agenda') {
        return new Intl.DateTimeFormat('en-US', {
            month: 'long',
            year: 'numeric'
        }).format(currentDate) + ' Agenda';
    }

    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
    }).format(currentDate);
}

function buildEventStyle(calendarColor) {
    if (!calendarColor) {
        return '';
    }

    return `background:${calendarColor}; color:#111111; border:1px solid rgba(0,0,0,0.15);`;
}

function buildHoverText(event) {
    const parts = [];

    if (event.name) parts.push(event.name);
    if (event.calendarName) parts.push(`Calendar: ${event.calendarName}`);
    if (event.status) parts.push(`Status: ${event.status}`);
    if (event.notes) parts.push(event.notes);

    return parts.join(' | ');
}

function eventClass(status) {
    let className = 'event-pill';

    if (status === 'Confirmed') {
        className += ' event-pill--confirmed';
    } else if (status === 'Cancelled') {
        className += ' event-pill--cancelled';
    } else {
        className += ' event-pill--planned';
    }

    return className;
}

function dayClass(isCurrentMonth, isToday) {
    let className = 'day-cell';

    if (!isCurrentMonth) {
        className += ' day-cell--muted';
    } else {
        className += ' day-cell--interactive';
    }

    if (isToday) {
        className += ' day-cell--today';
    }

    return className;
}

function buildRenderedEvent(event) {
    const startDate = new Date(event.start);

    return {
        id: event.id,
        name: event.name || '(No Subject)',
        calendarName: event.calendarName || 'No Calendar',
        timeLabel: event.allDay ? 'All Day' : formatTime(startDate),
        hoverText: buildHoverText(event),
        className: eventClass(event.status),
        styleText: buildEventStyle(event.calendarColor),
        colorBarStyle: event.calendarColor
            ? `background:${event.calendarColor};`
            : 'background:#d8dde6;',
        statusLabel: event.status || 'No Status'
    };
}

export function buildAgendaGroups(events) {
    const grouped = {};

    (events || []).forEach((event) => {
        const key = dateKey(new Date(event.start));
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(buildRenderedEvent(event));
    });

    return Object.keys(grouped)
        .sort()
        .map((key) => ({
            key,
            label: formatAgendaDate(key),
            events: grouped[key]
        }));
}

export function buildCalendarWeeks(currentDate, currentView, events) {
    const monthIndex = currentDate.getMonth();
    const todayKey = dateKey(new Date());
    const range = getVisibleRange(currentDate, currentView);
    const grouped = {};

    (events || []).forEach((event) => {
        const key = dateKey(new Date(event.start));
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(buildRenderedEvent(event));
    });

    let cursor = new Date(range.startDate + 'T12:00:00');
    const weekCount = currentView === 'week' ? 1 : 6;
    const weeks = [];

    for (let weekIndex = 0; weekIndex < weekCount; weekIndex++) {
        const week = { key: `week-${weekIndex}`, days: [] };

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const key = dateKey(cursor);
            const isCurrentMonth = currentView === 'week' ? true : cursor.getMonth() === monthIndex;
            const dayEvents = grouped[key] || [];

            week.days.push({
                key,
                label: cursor.getDate(),
                isCurrentMonth,
                currentMonthAttr: isCurrentMonth ? 'true' : 'false',
                className: dayClass(isCurrentMonth, key === todayKey),
                events: dayEvents,
                showNoEvents: isCurrentMonth && dayEvents.length === 0
            });

            cursor = new Date(
                cursor.getFullYear(),
                cursor.getMonth(),
                cursor.getDate() + 1
            );
        }

        weeks.push(week);
    }

    return weeks;
}
