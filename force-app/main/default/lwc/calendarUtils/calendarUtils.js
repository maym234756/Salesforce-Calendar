export function dateKey(dateValue) {
    const date = toDate(dateValue);
    date.setHours(0, 0, 0, 0);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function buildDefaultDateTime(dateText, hour = 9) {
    if (!dateText) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        const [year, month, day] = dateText.split('-').map((value) => parseInt(value, 10));
        return new Date(year, month - 1, day, hour, 0, 0, 0).toISOString();
    }

    const resolved = new Date(dateText);
    return Number.isNaN(resolved.getTime()) ? null : resolved.toISOString();
}

export function getVisibleRange(currentDate, currentView) {
    if (currentView === 'week') {
        const start = startOfWeek(currentDate);
        const end = addDays(start, 6);

        return {
            startDate: dateKey(start),
            endDate: dateKey(end)
        };
    }

    if (['agenda', 'teamLoad', 'conflicts'].includes(currentView)) {
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        return {
            startDate: dateKey(start),
            endDate: dateKey(end)
        };
    }

    const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const start = startOfWeek(firstOfMonth);
    const end = addDays(start, 41);

    return {
        startDate: dateKey(start),
        endDate: dateKey(end)
    };
}

export function buildRangeLabel(currentDate, currentView) {
    if (currentView === 'week') {
        const range = getVisibleRange(currentDate, currentView);
        const start = new Date(`${range.startDate}T12:00:00`);
        const end = new Date(`${range.endDate}T12:00:00`);

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

    const monthYear = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
    }).format(currentDate);

    if (currentView === 'agenda') {
        return `${monthYear} Agenda`;
    }

    if (currentView === 'teamLoad') {
        return `${monthYear} Team Load`;
    }

    if (currentView === 'conflicts') {
        return `${monthYear} Conflicts`;
    }

    return monthYear;
}

export function buildAgendaGroups(events) {
    const groupedByDay = {};

    (events || []).forEach((eventRecord) => {
        const start = safeDate(eventRecord.start);
        if (!start) {
            return;
        }

        const key = dateKey(start);
        if (!groupedByDay[key]) {
            groupedByDay[key] = [];
        }

        groupedByDay[key].push(buildRenderedEvent(eventRecord, key));
    });

    return Object.keys(groupedByDay)
        .sort()
        .map((key) => {
            const dayEvents = groupedByDay[key].sort(sortRenderedEvents);

            return {
                key,
                label: formatAgendaDate(key),
                count: dayEvents.length,
                countLabel: `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`,
                events: dayEvents
            };
        });
}

export function buildCalendarWeeks(currentDate, currentView, events) {
    const range = getVisibleRange(currentDate, currentView);
    const rangeStart = new Date(`${range.startDate}T12:00:00`);
    const rangeEnd = new Date(`${range.endDate}T12:00:00`);
    const monthIndex = currentDate.getMonth();
    const todayKey = dateKey(new Date());
    const groupedByDay = buildDayBuckets(events, rangeStart, rangeEnd);

    const weeks = [];
    let cursor = new Date(rangeStart);
    const weekCount = currentView === 'week' ? 1 : 6;

    for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
        const week = {
            key: `week-${weekIndex}`,
            days: []
        };

        for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
            const key = dateKey(cursor);
            const dayOfWeek = cursor.getDay();
            const isCurrentMonth = currentView === 'week' ? true : cursor.getMonth() === monthIndex;
            const rawDayEvents = [...(groupedByDay[key] || [])].sort(sortRenderedEvents);

            const maxVisible = currentView === 'month' ? 3 : rawDayEvents.length;
            const visibleEvents = rawDayEvents.slice(0, maxVisible);
            const hiddenCount = rawDayEvents.length - visibleEvents.length;

            week.days.push({
                key,
                label: cursor.getDate(),
                isCurrentMonth,
                isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
                currentMonthAttr: isCurrentMonth ? 'true' : 'false',
                className: dayClass(isCurrentMonth, key === todayKey, dayOfWeek),
                events: visibleEvents,
                hiddenCount,
                showMore: hiddenCount > 0,
                showNoEvents: isCurrentMonth && rawDayEvents.length === 0
            });

            cursor = addDays(cursor, 1);
        }

        weeks.push(week);
    }

    return weeks;
}

function buildDayBuckets(events, rangeStart, rangeEnd) {
    const grouped = {};

    (events || []).forEach((eventRecord) => {
        const start = safeDate(eventRecord.start);
        if (!start) {
            return;
        }

        const end = safeDate(eventRecord.endDateTime || eventRecord.end) || start;
        const startDay = stripTime(start);
        const endDay = stripTime(end);

        const clippedStart = startDay.getTime() < stripTime(rangeStart).getTime() ? stripTime(rangeStart) : startDay;
        const clippedEnd = endDay.getTime() > stripTime(rangeEnd).getTime() ? stripTime(rangeEnd) : endDay;

        if (clippedStart.getTime() > clippedEnd.getTime()) {
            return;
        }

        let cursor = new Date(clippedStart);

        while (cursor.getTime() <= clippedEnd.getTime()) {
            const occurrenceKey = dateKey(cursor);

            if (!grouped[occurrenceKey]) {
                grouped[occurrenceKey] = [];
            }

            grouped[occurrenceKey].push(buildRenderedEvent(eventRecord, occurrenceKey));
            cursor = addDays(cursor, 1);
        }
    });

    return grouped;
}

function buildRenderedEvent(eventRecord, occurrenceKey) {
    const start = safeDate(eventRecord.start);
    const end = safeDate(eventRecord.endDateTime || eventRecord.end) || start;
    const startKey = dateKey(start);
    const endKey = dateKey(end);
    const calendarColor = eventRecord.calendarColor || '#1b96ff';
    const isAllDay = Boolean(eventRecord.allDay);
    const isContinuation = occurrenceKey !== startKey;
    const continuesAfter = occurrenceKey !== endKey;

    return {
        id: eventRecord.id,
        name: eventRecord.name || '(No Subject)',
        calendarName: eventRecord.calendarName || 'No Calendar',
        statusLabel: eventRecord.status || 'No Status',
        syncStatusLabel: eventRecord.syncStatus || '',
        timeLabel: buildGridTimeLabel(start, end, isAllDay, occurrenceKey),
        agendaTimeLabel: buildAgendaTimeLabel(start, end, isAllDay, occurrenceKey),
        hoverText: buildHoverText(eventRecord, start, end, occurrenceKey),
        className: eventClass(eventRecord.status, isContinuation),
        styleText: buildEventStyle(calendarColor),
        colorBarStyle: `background:${calendarColor};`,
        sortValue: isAllDay ? 0 : start.getTime(),
        isAllDay,
        isContinuation,
        continuesAfter
    };
}

function buildGridTimeLabel(start, end, isAllDay, occurrenceKey) {
    if (isAllDay) {
        return 'All Day';
    }

    const startKey = dateKey(start);
    const endKey = dateKey(end);

    if (startKey === endKey) {
        return formatTime(start);
    }

    if (occurrenceKey === startKey) {
        return `Starts ${formatTime(start)}`;
    }

    if (occurrenceKey === endKey) {
        return `Until ${formatTime(end)}`;
    }

    return 'Continues';
}

function buildAgendaTimeLabel(start, end, isAllDay, occurrenceKey) {
    if (isAllDay) {
        return 'All Day';
    }

    const startKey = dateKey(start);
    const endKey = dateKey(end);

    if (startKey === endKey) {
        return `${formatTime(start)} - ${formatTime(end)}`;
    }

    if (occurrenceKey === startKey) {
        return `Starts ${formatTime(start)}`;
    }

    if (occurrenceKey === endKey) {
        return `Until ${formatTime(end)}`;
    }

    return 'Continues all day';
}

function buildHoverText(eventRecord, start, end, occurrenceKey) {
    const parts = [];

    if (eventRecord.name) {
        parts.push(eventRecord.name);
    }

    if (eventRecord.calendarName) {
        parts.push(`Calendar: ${eventRecord.calendarName}`);
    }

    if (eventRecord.status) {
        parts.push(`Status: ${eventRecord.status}`);
    }

    parts.push(`Time: ${buildAgendaTimeLabel(start, end, Boolean(eventRecord.allDay), occurrenceKey)}`);

    if (eventRecord.syncStatus) {
        parts.push(`Sync: ${eventRecord.syncStatus}`);
    }

    if (eventRecord.notes) {
        parts.push(eventRecord.notes);
    }

    return parts.join(' | ');
}

function buildEventStyle(calendarColor) {
    const color = calendarColor || '#1b96ff';
    const textColor = readableTextColor(color);

    return [
        `background:${color}`,
        `color:${textColor}`,
        'border:1px solid rgba(0,0,0,0.12)',
        'border-radius:0.375rem'
    ].join('; ');
}

function eventClass(status, isContinuation) {
    let className =
        'event-pill slds-button slds-button_reset slds-text-align_left slds-size_1-of-1 slds-p-around_x-small';

    if (status === 'Confirmed') {
        className += ' event-pill--confirmed';
    } else if (status === 'Cancelled') {
        className += ' event-pill--cancelled';
    } else {
        className += ' event-pill--planned';
    }

    if (isContinuation) {
        className += ' event-pill--continued';
    }

    return className;
}

function dayClass(isCurrentMonth, isToday, dayOfWeek) {
    let className = 'day-cell slds-p-around_x-small';

    if (!isCurrentMonth) {
        className += ' day-cell--muted slds-theme_shade';
    } else {
        className += ' day-cell--interactive slds-theme_default';
    }

    if (dayOfWeek === 0 || dayOfWeek === 6) {
        className += ' day-cell--weekend';
    }

    if (isToday) {
        className += ' day-cell--today';
    }

    return className;
}

function sortRenderedEvents(left, right) {
    if (left.isAllDay && !right.isAllDay) {
        return -1;
    }

    if (!left.isAllDay && right.isAllDay) {
        return 1;
    }

    return left.sortValue - right.sortValue;
}

function formatAgendaDate(dateText) {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(new Date(`${dateText}T12:00:00`));
}

function formatTime(dateValue) {
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    }).format(dateValue);
}

function readableTextColor(colorValue) {
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorValue || '')) {
        return '#080707';
    }

    const normalized =
        colorValue.length === 4
            ? `#${colorValue[1]}${colorValue[1]}${colorValue[2]}${colorValue[2]}${colorValue[3]}${colorValue[3]}`
            : colorValue;

    const red = parseInt(normalized.slice(1, 3), 16);
    const green = parseInt(normalized.slice(3, 5), 16);
    const blue = parseInt(normalized.slice(5, 7), 16);
    const brightness = (red * 299 + green * 587 + blue * 114) / 1000;

    return brightness >= 160 ? '#080707' : '#ffffff';
}

function startOfWeek(dateValue) {
    const date = stripTime(toDate(dateValue));
    date.setDate(date.getDate() - date.getDay());
    return date;
}

function addDays(dateValue, dayCount) {
    const date = toDate(dateValue);
    date.setDate(date.getDate() + dayCount);
    return date;
}

function stripTime(dateValue) {
    const date = toDate(dateValue);
    date.setHours(0, 0, 0, 0);
    return date;
}

function safeDate(value) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toDate(value) {
    return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}