import { LightningElement, api } from 'lwc';
import { dateKey, sanitizeColor, readableTextColor } from 'c/calendarUtils';

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
});

const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'short'
});

function isSpanningEvent(eventRecord) {
    return eventRecord?.isContinuation === true || eventRecord?.continuesAfter === true;
}

export default class CalendarGrid extends LightningElement {
    @api weeks = [];
    @api singleRow = false;

    @api showWeekends = false;
    @api autoExpandDayHeight = false;
    @api wrapEventTitles = false;
    @api compactEventDensity = false;
    hasNativeQuickActionListeners = false;
    hoveredRecordId = null;
    draggedRecordId = null;

    constructor() {
        super();
        this._boundHoverOver = this.handleNativeHoverOver.bind(this);
        this._boundHoverOut = this.handleNativeHoverOut.bind(this);
        this._boundMouseDown = this.handleNativeQuickActionMouseDown.bind(this);
        this._boundContextMenu = this.handleNativeQuickActionContextMenu.bind(this);
    }

    renderedCallback() {
        if (this.hasNativeQuickActionListeners) {
            return;
        }

        this.template.addEventListener('mouseover', this._boundHoverOver);
        this.template.addEventListener('mouseout', this._boundHoverOut);
        this.template.addEventListener('mousedown', this._boundMouseDown);
        this.template.addEventListener('contextmenu', this._boundContextMenu);
        this.hasNativeQuickActionListeners = true;
    }

    disconnectedCallback() {
        this.template.removeEventListener('mouseover', this._boundHoverOver);
        this.template.removeEventListener('mouseout', this._boundHoverOut);
        this.template.removeEventListener('mousedown', this._boundMouseDown);
        this.template.removeEventListener('contextmenu', this._boundContextMenu);
        this.hasNativeQuickActionListeners = false;
    }

    get hasWeeks() {
        return Array.isArray(this.weeks) && this.weeks.length > 0;
    }

    get columnCount() {
        return this.showWeekends ? 7 : 5;
    }

    get weekdayHeaders() {
        const all = [
            { key: 'sun', label: 'Sun', isWeekend: true },
            { key: 'mon', label: 'Mon', isWeekend: false },
            { key: 'tue', label: 'Tue', isWeekend: false },
            { key: 'wed', label: 'Wed', isWeekend: false },
            { key: 'thu', label: 'Thu', isWeekend: false },
            { key: 'fri', label: 'Fri', isWeekend: false },
            { key: 'sat', label: 'Sat', isWeekend: true }
        ];
        return this.showWeekends ? all : all.filter(d => !d.isWeekend);
    }

    get weekDaysClass() {
        return this.shouldAutoExpandRows ? 'week-days week-days--auto-expand' : 'week-days';
    }

    get shouldAutoExpandRows() {
        return this.autoExpandDayHeight && this.singleRow;
    }

    get filteredWeeks() {
        if (!this.hasWeeks) return [];
        const todayKey = dateKey(new Date());

        return this.weeks.map((week) => {
            const visibleDays = this.showWeekends
                ? week.days
                : week.days.filter((d) => !d.isWeekend);
            const spanningBarRows = this._buildSpanningBars(visibleDays);
            const maxVisible = Infinity;
            const filteredDays = visibleDays.map((day) => {
                const dayDate = new Date(`${day.key}T12:00:00`);
                const isToday = day.key === todayKey;
                const showMonthLabel = !day.isCurrentMonth || dayDate.getDate() === 1;
                const inlineEvents = day.events.filter((ev) => !isSpanningEvent(ev));
                const visibleEvents = maxVisible === Infinity
                    ? inlineEvents
                    : inlineEvents.slice(0, maxVisible);
                const overflowCount = inlineEvents.length - visibleEvents.length;

                return {
                    ...day,
                    dayNumber: dayDate.getDate(),
                    ariaLabel: DAY_LABEL_FORMATTER.format(dayDate),
                    addButtonLabel: `Add event for ${DAY_LABEL_FORMATTER.format(dayDate)}`,
                    dateBadgeClass: this._buildDateBadgeClass(day, isToday),
                    headerMetaLabel: isToday ? 'Today' : showMonthLabel ? MONTH_SHORT_FORMATTER.format(dayDate) : '',
                    showHeaderMetaLabel: isToday || showMonthLabel,
                    eventsClass:
                        overflowCount > 0
                            ? 'events events--overflow'
                            : 'events',
                    events: visibleEvents.map((eventRecord) => ({
                        ...eventRecord,
                        showTimeLabel: Boolean(eventRecord.timeLabel),
                        eventAriaLabel:
                            eventRecord.hoverText ||
                            eventRecord.timeLabel ||
                            eventRecord.name ||
                            'Open event'
                    })),
                    overflowCount
                };
            });
            return {
                ...week,
                days: filteredDays,
                spanningBarRows,
                hasSpanning: spanningBarRows.length > 0,
                spanKey: `span-${week.key}`,
                daysKey: `days-${week.key}`
            };
        });
    }

    get columnsStyle() {
        return `grid-template-columns: repeat(${this.columnCount}, minmax(0, 1fr));`;
    }

    get rowCount() {
        if (this.singleRow) {
            return 1;
        }
        return this.hasWeeks ? this.weeks.length : 6;
    }

    get shellClass() {
        let classes = 'calendar-shell';

        if (this.singleRow) {
            classes += ' calendar-shell--single-row';
        }

        if (this.compactEventDensity) {
            classes += ' calendar-shell--compact';
        }

        if (this.wrapEventTitles) {
            classes += ' calendar-shell--wrap';
        }

        return classes;
    }

    get gridClass() {
        return this.singleRow ? 'calendar-grid calendar-grid--single-row' : 'calendar-grid';
    }

    get gridStyle() {
        const rowDefinition = this.shouldAutoExpandRows
            ? 'repeat(' + this.rowCount + ', minmax(120px, auto))'
            : 'repeat(' + this.rowCount + ', minmax(0, 1fr))';

        return `grid-template-columns: repeat(${this.columnCount}, minmax(0, 1fr)); grid-template-rows: ${rowDefinition};`;
    }

    _buildSpanningBars(visibleDays) {
        const seen = {};
        visibleDays.forEach((day, i) => {
            const col = i + 1;
            (day.events || []).forEach((ev) => {
                if (!isSpanningEvent(ev)) {
                    return;
                }
                if (!seen[ev.id]) {
                    seen[ev.id] = {
                        event: ev,
                        startCol: col,
                        endCol: col,
                        startsBeforeWeek: ev.isContinuation === true
                    };
                } else {
                    seen[ev.id].endCol = col;
                }
            });
        });

        const bars = Object.values(seen).map((item) => {
            const { event, startCol, endCol, startsBeforeWeek } = item;
            const lastDay = visibleDays[endCol - 1];
            const lastEvInstance = lastDay
                ? (lastDay.events || []).find((e) => e.id === event.id)
                : null;
            const endsAfterWeek = lastEvInstance ? lastEvInstance.continuesAfter : false;
            const spanCols = endCol - startCol + 1;
            return {
                key: `${event.id}-s${startCol}`,
                id: event.id,
                name: event.name,
                hoverText: event.hoverText,
                recordObjectApiName: event.recordObjectApiName,
                recordContextId: event.recordContextId,
                canEditAttr: event.canEditAttr,
                canDeleteAttr: event.canDeleteAttr,
                hasContextMenuAttr: event.hasContextMenuAttr,
                occurrenceDate: event.occurrenceDate,
                isRecurring: event.isRecurring,
                statusLabel: event.statusLabel,
                startCol,
                spanCols,
                startsBeforeWeek,
                endsAfterWeek,
                barClass: this._buildSpanBarClass(event, startsBeforeWeek, endsAfterWeek),
                barStyle: this._buildSpanBarStyle(event, startCol, spanCols)
            };
        });

        bars.sort((a, b) => b.spanCols - a.spanCols || a.startCol - b.startCol);

        const rows = [];
        bars.forEach((bar) => {
            let placed = false;
            for (const row of rows) {
                const conflict = row.some(
                    (ex) =>
                        bar.startCol < ex.startCol + ex.spanCols &&
                        bar.startCol + bar.spanCols > ex.startCol
                );
                if (!conflict) {
                    row.push(bar);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                rows.push([bar]);
            }
        });

        return rows.map((rowBars, i) => ({
            key: `spanrow-${i}`,
            bars: rowBars.sort((a, b) => a.startCol - b.startCol)
        }));
    }

    _buildSpanBarClass(event, startsBeforeWeek, endsAfterWeek) {
        let cls = 'spanning-bar';
        if (event.statusLabel === 'Cancelled') {
            cls += ' spanning-bar--cancelled';
        }
        if (startsBeforeWeek) {
            cls += ' spanning-bar--starts-before';
        }
        if (endsAfterWeek) {
            cls += ' spanning-bar--ends-after';
        }
        return cls;
    }

    _buildDateBadgeClass(day, isToday) {
        let classes = 'day-date-badge';

        if (!day.isCurrentMonth) {
            classes += ' day-date-badge--muted';
        }

        if (isToday) {
            classes += ' day-date-badge--today';
        }

        return classes;
    }

    _buildSpanBarStyle(event, startCol, spanCols) {
        const color = sanitizeColor(event.calendarColor || '#1b96ff');
        const textColor = readableTextColor(color);
        return `background:${color}; color:${textColor}; grid-column:${startCol} / span ${spanCols};`;
    }

    handleDayClick(event) {
        this.dispatchEvent(
            new CustomEvent('dayselect', {
                detail: {
                    dateKey: event.currentTarget.dataset.date,
                    isCurrentMonth: event.currentTarget.dataset.currentMonth === 'true'
                }
            })
        );
    }

    handleDayKeyDown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.handleDayClick(event);
        }
    }

    handleMoreEventsClick(event) {
        event.stopPropagation();
        this.dispatchEvent(
            new CustomEvent('moreevents', {
                detail: { dateKey: event.currentTarget.dataset.date }
            })
        );
    }

    handleDayAdd(event) {
        event.stopPropagation();

        const btn = event.currentTarget;
        const rect = btn.getBoundingClientRect();
        this.dispatchEvent(
            new CustomEvent('quickcreate', {
                detail: {
                    dateKey: btn.dataset.date,
                    anchorRect: {
                        top: rect.top,
                        left: rect.left,
                        bottom: rect.bottom,
                        right: rect.right,
                        width: rect.width,
                        height: rect.height
                    }
                }
            })
        );
    }

    handleEventOpen(event) {
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('eventopen', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    canEdit: event.currentTarget.dataset.canEdit !== 'false',
                    canDelete: event.currentTarget.dataset.canDelete === 'true',
                    occurrenceDate: event.currentTarget.dataset.occurrenceDate || null,
                    isRecurring: event.currentTarget.dataset.isRecurring === 'true'
                }
            })
        );
    }

    handleEventDragStart(event) {
        if (event.currentTarget.dataset.canDrag !== 'true') {
            event.preventDefault();
            return;
        }

        this.draggedRecordId = event.currentTarget.dataset.id;
        event.currentTarget.classList.add('event-pill--dragging');

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', this.draggedRecordId);
        }
    }

    handleEventDragEnd(event) {
        this.draggedRecordId = null;
        event.currentTarget.classList.remove('event-pill--dragging');
        this.clearDropTargets();
    }

    handleDayDragOver(event) {
        const recordId = this.resolveDraggedRecordId(event);
        if (!recordId) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        event.currentTarget.classList.add('day-cell--drop-target');
    }

    handleDayDragLeave(event) {
        event.currentTarget.classList.remove('day-cell--drop-target');
    }

    handleDayDrop(event) {
        const recordId = this.resolveDraggedRecordId(event);
        this.clearDropTargets();

        if (!recordId) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('eventdrop', {
                detail: {
                    recordId,
                    targetDateKey: event.currentTarget.dataset.date
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventHover(event) {
        this.dispatchEvent(
            new CustomEvent('eventhover', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordName: event.currentTarget.dataset.name || '',
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    canDelete: event.currentTarget.dataset.canDelete === 'true',
                    canContextMenu: event.currentTarget.dataset.canContextMenu === 'true',
                    clientX: event.clientX,
                    clientY: event.clientY
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventUnhover() {
        this.dispatchEvent(
            new CustomEvent('eventunhover', {
                bubbles: true,
                composed: true
            })
        );
    }

    handleNativeQuickActionMouseDown(event) {
        if (event.button !== 2) {
            return;
        }

        const source = this.resolveQuickActionSource(event);
        if (!source) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }

        this.dispatchQuickActionEvent(source, event);
    }

    handleNativeHoverOver(event) {
        const source = this.resolveRecordSource(event);
        if (!source || source.dataset.id === this.hoveredRecordId) {
            return;
        }

        this.hoveredRecordId = source.dataset.id;
        this.dispatchHoverEvent(source, event);
    }

    handleNativeHoverOut(event) {
        const source = this.resolveRecordSource(event);
        if (!source || source.dataset.id !== this.hoveredRecordId) {
            return;
        }

        const relatedTarget = event.relatedTarget;
        if (relatedTarget && typeof relatedTarget.closest === 'function') {
            const nextSource = relatedTarget.closest('button[data-id]');
            if (nextSource && nextSource.dataset.id === this.hoveredRecordId) {
                return;
            }
        }

        this.hoveredRecordId = null;
        this.dispatchEvent(
            new CustomEvent('eventunhover', {
                bubbles: true,
                composed: true
            })
        );
    }

    handleNativeQuickActionContextMenu(event) {
        const source = this.resolveQuickActionSource(event);
        if (!source) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }

        this.dispatchQuickActionEvent(source, event);
    }

    resolveQuickActionSource(event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') {
            return null;
        }

        const source = target.closest('button[data-id][data-can-context-menu="true"]');
        return source || null;
    }

    resolveRecordSource(event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') {
            return null;
        }

        return target.closest('button[data-id]');
    }

    dispatchHoverEvent(source, event) {
        this.dispatchEvent(
            new CustomEvent('eventhover', {
                detail: {
                    recordId: source.dataset.id,
                    recordName: source.dataset.name || '',
                    recordObjectApiName: source.dataset.recordObjectApiName || null,
                    recordContextId: source.dataset.recordContextId || null,
                    canDelete: source.dataset.canDelete === 'true',
                    canContextMenu: source.dataset.canContextMenu === 'true',
                    clientX: event.clientX,
                    clientY: event.clientY
                },
                bubbles: true,
                composed: true
            })
        );
    }

    dispatchQuickActionEvent(source, event) {
        this.dispatchEvent(
            new CustomEvent('eventcontextmenu', {
                detail: {
                    recordId: source.dataset.id,
                    recordName: source.dataset.name || '',
                    recordObjectApiName: source.dataset.recordObjectApiName || null,
                    recordContextId: source.dataset.recordContextId || null,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    canDelete: source.dataset.canDelete === 'true',
                    canContextMenu: source.dataset.canContextMenu === 'true'
                },
                bubbles: true,
                composed: true
            })
        );
    }

    resolveDraggedRecordId(event) {
        if (this.draggedRecordId) {
            return this.draggedRecordId;
        }

        return event.dataTransfer ? event.dataTransfer.getData('text/plain') : null;
    }

    clearDropTargets() {
        this.template.querySelectorAll('.day-cell--drop-target').forEach((cell) => {
            cell.classList.remove('day-cell--drop-target');
        });
    }

    handleEventPointerDown(event) {
        if (event.button !== 2 || event.currentTarget.dataset.canContextMenu !== 'true') {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('eventcontextmenu', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordName: event.currentTarget.dataset.name || '',
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    canDelete: event.currentTarget.dataset.canDelete === 'true',
                    canContextMenu: event.currentTarget.dataset.canContextMenu === 'true'
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventContextMenu(event) {
        if (event.currentTarget.dataset.canContextMenu !== 'true') {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('eventcontextmenu', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordName: event.currentTarget.dataset.name || '',
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    canDelete: event.currentTarget.dataset.canDelete === 'true',
                    canContextMenu: event.currentTarget.dataset.canContextMenu === 'true'
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventMouseDown(event) {
        if (event.button !== 2 || event.currentTarget.dataset.canContextMenu !== 'true') {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('eventcontextmenu', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordName: event.currentTarget.dataset.name || '',
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    canDelete: event.currentTarget.dataset.canDelete === 'true',
                    canContextMenu: event.currentTarget.dataset.canContextMenu === 'true'
                },
                bubbles: true,
                composed: true
            })
        );
    }
}