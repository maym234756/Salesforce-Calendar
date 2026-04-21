const { createElement } = require('lwc');
const CalendarGrid = require('c/calendarGrid').default;

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
const readGetter = (prototype, propertyName, context) =>
    Object.getOwnPropertyDescriptor(prototype, propertyName).get.call(context);

/** Minimal "week" structure that calendarGrid expects */
function buildWeek({ dateKey = '2026-04-18', events = [], isWeekend = false } = {}) {
    return {
        key: `week-${dateKey}`,
        days: [
            {
                key: dateKey,
                label: 18,
                isCurrentMonth: true,
                isWeekend,
                currentMonthAttr: 'true',
                className: 'day-cell slds-p-around_x-small day-cell--interactive slds-theme_default',
                events,
                hiddenCount: 0,
                showMore: false,
                showNoEvents: events.length === 0
            },
            // Fill remaining 6 weekend days so the grid renders fully
            ...Array.from({ length: 6 }, (_, i) => ({
                key: `2026-04-${19 + i}`,
                label: 19 + i,
                isCurrentMonth: true,
                isWeekend: false,
                currentMonthAttr: 'true',
                className: 'day-cell slds-p-around_x-small day-cell--interactive slds-theme_default',
                events: [],
                hiddenCount: 0,
                showMore: false,
                showNoEvents: true
            }))
        ]
    };
}

function buildEvent(overrides = {}) {
    return {
        id: overrides.id || 'a1B000000000001AAA',
        name: overrides.name || 'Test Event',
        recordObjectApiName: 'Calendar_Event__c',
        recordContextId: 'a1x000000000001AAA',
        calendarColor: '#0176d3',
        styleText: 'background:#0176d3;color:#ffffff',
        className: 'event-pill event-pill--planned',
        canEditAttr: 'true',
        canDeleteAttr: 'false',
        hasContextMenuAttr: 'false',
        isDraggable: false,
        isAllDay: false,
        isContinuation: false,
        continuesAfter: false,
        sortValue: 0,
        hoverText: overrides.name || 'Test Event',
        occurrenceDate: '2026-04-18',
        isRecurring: false,
        ...overrides
    };
}

describe('c-calendar-grid', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('renders nothing when no weeks are provided', async () => {
        const el = createElement('c-calendar-grid', { is: CalendarGrid });
        el.weeks = [];
        el.showWeekends = true;
        document.body.appendChild(el);
        await flushPromises();

        expect(el.shadowRoot.querySelector('.calendar-shell')).toBeNull();
    });

    it('renders the calendar grid when weeks are provided', async () => {
        const el = createElement('c-calendar-grid', { is: CalendarGrid });
        el.weeks = [buildWeek()];
        el.showWeekends = true;
        document.body.appendChild(el);
        await flushPromises();

        expect(el.shadowRoot.querySelector('.calendar-shell')).not.toBeNull();
    });

    it('renders polished day headers and event time labels for month cells', async () => {
        const el = createElement('c-calendar-grid', { is: CalendarGrid });
        el.weeks = [
            {
                key: 'week-headers',
                days: [
                    {
                        key: '2026-03-29',
                        label: 29,
                        isCurrentMonth: false,
                        isWeekend: true,
                        currentMonthAttr: 'false',
                        className: 'day-cell day-cell--muted',
                        events: [],
                        hiddenCount: 0,
                        showMore: false,
                        showNoEvents: false
                    },
                    {
                        key: '2026-04-01',
                        label: 1,
                        isCurrentMonth: true,
                        isWeekend: false,
                        currentMonthAttr: 'true',
                        className: 'day-cell day-cell--interactive',
                        events: [
                            buildEvent({
                                id: 'evt-time',
                                name: 'Discovery Call',
                                timeLabel: '9:00 AM',
                                hoverText: 'Discovery Call | 9:00 AM'
                            })
                        ],
                        hiddenCount: 0,
                        showMore: false,
                        showNoEvents: false
                    },
                    ...Array.from({ length: 5 }, (_, index) => ({
                        key: `2026-04-0${index + 2}`,
                        label: index + 2,
                        isCurrentMonth: true,
                        isWeekend: false,
                        currentMonthAttr: 'true',
                        className: 'day-cell day-cell--interactive',
                        events: [],
                        hiddenCount: 0,
                        showMore: false,
                        showNoEvents: true
                    }))
                ]
            }
        ];
        el.showWeekends = true;
        document.body.appendChild(el);
        await flushPromises();

        const dayBadges = el.shadowRoot.querySelectorAll('.day-date-badge');
        expect(dayBadges).toHaveLength(7);
        expect(el.shadowRoot.textContent).toContain('Mar');
        expect(el.shadowRoot.textContent).toContain('Apr');
        expect(el.shadowRoot.querySelector('.event-meta').textContent).toBe('9:00 AM');
        expect(
            el.shadowRoot
                .querySelector('.day-add-btn[data-date="2026-04-01"]')
                .getAttribute('aria-label')
        ).toContain('April 1, 2026');
    });

    it('renders single-day all-day records inside the day cell instead of the spanning lane', async () => {
        const el = createElement('c-calendar-grid', { is: CalendarGrid });
        el.weeks = [
            buildWeek({
                dateKey: '2026-04-18',
                events: [
                    buildEvent({
                        id: 'all-day-inline',
                        name: 'Boston Whaler 130 Sport',
                        isAllDay: true,
                        timeLabel: 'All Day',
                        hoverText: 'Boston Whaler 130 Sport | All Day'
                    })
                ]
            })
        ];
        el.showWeekends = true;
        document.body.appendChild(el);
        await flushPromises();

        expect(el.shadowRoot.querySelector('.spanning-section')).toBeNull();
        expect(el.shadowRoot.querySelector('.event-title').textContent).toBe('Boston Whaler 130 Sport');
        expect(el.shadowRoot.querySelector('.event-meta').textContent).toBe('All Day');
    });

    it('dispatches "dayselect" when a day cell is clicked', async () => {
        const el = createElement('c-calendar-grid', { is: CalendarGrid });
        el.weeks = [buildWeek({ dateKey: '2026-04-18' })];
        el.showWeekends = true;
        document.body.appendChild(el);
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('dayselect', handler);

        const dayCell = el.shadowRoot.querySelector('[data-date="2026-04-18"]');
        expect(dayCell).not.toBeNull();
        dayCell.click();
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.dateKey).toBe('2026-04-18');
    });

    it('dispatches "quickcreate" when the + day-add button is clicked', async () => {
        const el = createElement('c-calendar-grid', { is: CalendarGrid });
        el.weeks = [buildWeek({ dateKey: '2026-04-18' })];
        el.showWeekends = true;
        document.body.appendChild(el);
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('quickcreate', handler);

        const addBtn = el.shadowRoot.querySelector('.day-add-btn[data-date="2026-04-18"]');
        expect(addBtn).not.toBeNull();
        addBtn.click();
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.dateKey).toBe('2026-04-18');
    });

    it('dispatches "eventopen" when an event pill is clicked', async () => {
        const el = createElement('c-calendar-grid', { is: CalendarGrid });
        el.weeks = [buildWeek({ dateKey: '2026-04-18', events: [buildEvent()] })];
        el.showWeekends = true;
        document.body.appendChild(el);
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('eventopen', handler);

        const pill = el.shadowRoot.querySelector('button[data-id]');
        expect(pill).not.toBeNull();
        pill.click();
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.recordId).toBe('a1B000000000001AAA');
    });

    it('renders all day-cell events and relies on internal scrolling instead of overflow buttons', async () => {
        const events = Array.from({ length: 5 }, (_, i) =>
            buildEvent({ id: `evt${i}`, name: `Event ${i}` })
        );
        const el = createElement('c-calendar-grid', { is: CalendarGrid });
        el.weeks = [buildWeek({ dateKey: '2026-04-18', events })];
        el.showWeekends = true;
        el.autoExpandDayHeight = false;
        document.body.appendChild(el);
        await flushPromises();

        expect(el.shadowRoot.querySelectorAll('.event-pill')).toHaveLength(5);
        expect(el.shadowRoot.querySelector('.day-more-btn--overflow')).toBeNull();
        expect(el.shadowRoot.querySelector('.events').className).toBe('events');
    });

    it('hides weekend columns when showWeekends is false', async () => {
        const el = createElement('c-calendar-grid', { is: CalendarGrid });
        el.weeks = [buildWeek()];
        el.showWeekends = false;
        document.body.appendChild(el);
        await flushPromises();

        expect(el.shadowRoot.querySelector('.calendar-shell')).not.toBeNull();
    });

    it('builds spanning rows, filters weekends, and tracks timed-event overflow', async () => {
        const spanningEventId = 'span-1';
        const timedEvents = Array.from({ length: 4 }, (_, index) =>
            buildEvent({
                id: `timed-${index}`,
                name: `Timed ${index}`,
                hoverText: `Timed ${index}`
            })
        );
        const spanningEvent = buildEvent({
            id: spanningEventId,
            name: 'Conference',
            hoverText: 'Conference',
            isAllDay: true,
            isContinuation: true,
            statusLabel: 'Cancelled'
        });

        const week = {
            key: 'week-span',
            days: [
                {
                    key: '2026-04-19',
                    label: 19,
                    isCurrentMonth: true,
                    isWeekend: true,
                    currentMonthAttr: 'true',
                    className: 'day-cell',
                    events: [],
                    hiddenCount: 0,
                    showMore: false,
                    showNoEvents: true
                },
                {
                    key: '2026-04-20',
                    label: 20,
                    isCurrentMonth: true,
                    isWeekend: false,
                    currentMonthAttr: 'true',
                    className: 'day-cell',
                    events: [spanningEvent, ...timedEvents],
                    hiddenCount: 0,
                    showMore: false,
                    showNoEvents: false
                },
                {
                    key: '2026-04-21',
                    label: 21,
                    isCurrentMonth: true,
                    isWeekend: false,
                    currentMonthAttr: 'true',
                    className: 'day-cell',
                    events: [
                        buildEvent({
                            ...spanningEvent,
                            isContinuation: false
                        })
                    ],
                    hiddenCount: 0,
                    showMore: false,
                    showNoEvents: false
                },
                {
                    key: '2026-04-22',
                    label: 22,
                    isCurrentMonth: true,
                    isWeekend: false,
                    currentMonthAttr: 'true',
                    className: 'day-cell',
                    events: [
                        buildEvent({
                            ...spanningEvent,
                            isContinuation: false,
                            continuesAfter: true
                        })
                    ],
                    hiddenCount: 0,
                    showMore: false,
                    showNoEvents: false
                },
                {
                    key: '2026-04-23',
                    label: 23,
                    isCurrentMonth: true,
                    isWeekend: false,
                    currentMonthAttr: 'true',
                    className: 'day-cell',
                    events: [],
                    hiddenCount: 0,
                    showMore: false,
                    showNoEvents: true
                },
                {
                    key: '2026-04-24',
                    label: 24,
                    isCurrentMonth: true,
                    isWeekend: false,
                    currentMonthAttr: 'true',
                    className: 'day-cell',
                    events: [],
                    hiddenCount: 0,
                    showMore: false,
                    showNoEvents: true
                },
                {
                    key: '2026-04-25',
                    label: 25,
                    isCurrentMonth: true,
                    isWeekend: true,
                    currentMonthAttr: 'true',
                    className: 'day-cell',
                    events: [],
                    hiddenCount: 0,
                    showMore: false,
                    showNoEvents: true
                }
            ]
        };

        const context = {
            weeks: [week],
            showWeekends: false,
            autoExpandDayHeight: false,
            _buildSpanningBars: CalendarGrid.prototype._buildSpanningBars,
            _buildDateBadgeClass: CalendarGrid.prototype._buildDateBadgeClass,
            _buildSpanBarClass: CalendarGrid.prototype._buildSpanBarClass,
            _buildSpanBarStyle: CalendarGrid.prototype._buildSpanBarStyle
        };

        Object.defineProperty(context, 'hasWeeks', {
            get() {
                return readGetter(CalendarGrid.prototype, 'hasWeeks', context);
            }
        });

        const filtered = readGetter(CalendarGrid.prototype, 'filteredWeeks', context);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].days).toHaveLength(5);
        expect(filtered[0].days[0].events).toHaveLength(4);
        expect(filtered[0].days[0].overflowCount).toBe(0);
        expect(filtered[0].hasSpanning).toBe(true);

        const bar = filtered[0].spanningBarRows[0].bars[0];
        expect(bar.spanCols).toBe(3);
        expect(bar.barClass).toContain('spanning-bar--cancelled');
        expect(bar.barClass).toContain('spanning-bar--starts-before');
        expect(bar.barClass).toContain('spanning-bar--ends-after');
        expect(bar.barStyle).toContain('grid-column:1 / span 3');
    });

    it('computes single-row auto-expand grid styles', async () => {
        const context = {
            weeks: [buildWeek(), buildWeek({ dateKey: '2026-04-25' })],
            singleRow: true,
            showWeekends: false,
            autoExpandDayHeight: true,
            compactEventDensity: true,
            wrapEventTitles: true
        };

        Object.defineProperty(context, 'hasWeeks', {
            get() {
                return readGetter(CalendarGrid.prototype, 'hasWeeks', context);
            }
        });
        Object.defineProperty(context, 'columnCount', {
            get() {
                return readGetter(CalendarGrid.prototype, 'columnCount', context);
            }
        });
        Object.defineProperty(context, 'rowCount', {
            get() {
                return readGetter(CalendarGrid.prototype, 'rowCount', context);
            }
        });
        Object.defineProperty(context, 'shouldAutoExpandRows', {
            get() {
                return readGetter(CalendarGrid.prototype, 'shouldAutoExpandRows', context);
            }
        });

        expect(context.columnCount).toBe(5);
        expect(context.rowCount).toBe(1);
        expect(readGetter(CalendarGrid.prototype, 'shellClass', context)).toContain('calendar-shell--single-row');
        expect(readGetter(CalendarGrid.prototype, 'shellClass', context)).toContain('calendar-shell--compact');
        expect(readGetter(CalendarGrid.prototype, 'shellClass', context)).toContain('calendar-shell--wrap');
        expect(readGetter(CalendarGrid.prototype, 'gridClass', context)).toContain('calendar-grid--single-row');
        expect(readGetter(CalendarGrid.prototype, 'columnsStyle', context)).toContain('repeat(5, minmax(0, 1fr))');
        expect(readGetter(CalendarGrid.prototype, 'gridStyle', context)).toContain('repeat(1, minmax(120px, auto))');
        expect(readGetter(CalendarGrid.prototype, 'shouldAutoExpandRows', context)).toBe(true);
    });

    it('keeps multi-week month rows fixed so day cells scroll instead of auto-expanding', () => {
        const context = {
            weeks: [buildWeek(), buildWeek({ dateKey: '2026-04-25' })],
            singleRow: false,
            showWeekends: true,
            autoExpandDayHeight: true
        };

        Object.defineProperty(context, 'hasWeeks', {
            get() {
                return readGetter(CalendarGrid.prototype, 'hasWeeks', context);
            }
        });
        Object.defineProperty(context, 'rowCount', {
            get() {
                return readGetter(CalendarGrid.prototype, 'rowCount', context);
            }
        });
        Object.defineProperty(context, 'shouldAutoExpandRows', {
            get() {
                return readGetter(CalendarGrid.prototype, 'shouldAutoExpandRows', context);
            }
        });

        expect(readGetter(CalendarGrid.prototype, 'shouldAutoExpandRows', context)).toBe(false);
        expect(readGetter(CalendarGrid.prototype, 'gridStyle', context)).toContain('repeat(2, minmax(0, 1fr))');
    });

    it('dispatches keyboard day selection and quick-create anchor geometry', () => {
        const dispatchEvent = jest.fn();
        const context = {
            dispatchEvent,
            handleDayClick: CalendarGrid.prototype.handleDayClick
        };

        CalendarGrid.prototype.handleDayKeyDown.call(context, {
            key: 'Enter',
            preventDefault: jest.fn(),
            currentTarget: {
                dataset: {
                    date: '2026-04-18',
                    currentMonth: 'true'
                }
            }
        });

        CalendarGrid.prototype.handleDayAdd.call(context, {
            stopPropagation: jest.fn(),
            currentTarget: {
                dataset: { date: '2026-04-18' },
                getBoundingClientRect: () => ({
                    top: 10,
                    left: 20,
                    bottom: 30,
                    right: 40,
                    width: 50,
                    height: 60
                })
            }
        });

        expect(dispatchEvent).toHaveBeenCalledTimes(2);
        expect(dispatchEvent.mock.calls[0][0].type).toBe('dayselect');
        expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
            dateKey: '2026-04-18',
            isCurrentMonth: true
        });
        expect(dispatchEvent.mock.calls[1][0].type).toBe('quickcreate');
        expect(dispatchEvent.mock.calls[1][0].detail).toEqual({
            dateKey: '2026-04-18',
            anchorRect: {
                top: 10,
                left: 20,
                bottom: 30,
                right: 40,
                width: 50,
                height: 60
            }
        });
    });

    it('handles drag start, drag end, drag over, and drop dispatch', () => {
        const addClass = jest.fn();
        const removeClass = jest.fn();
        const dropTargetRemove = jest.fn();
        const dataTransfer = {
            effectAllowed: '',
            setData: jest.fn(),
            getData: jest.fn(() => 'evt-1'),
            dropEffect: ''
        };
        const currentTarget = {
            dataset: { canDrag: 'true', id: 'evt-1' },
            classList: {
                add: addClass,
                remove: removeClass
            }
        };
        const dayCell = {
            dataset: { date: '2026-04-20' },
            classList: {
                add: jest.fn(),
                remove: dropTargetRemove
            }
        };
        const context = {
            draggedRecordId: null,
            dispatchEvent: jest.fn(),
            template: {
                querySelectorAll: jest.fn(() => [dayCell])
            },
            clearDropTargets: CalendarGrid.prototype.clearDropTargets,
            resolveDraggedRecordId: CalendarGrid.prototype.resolveDraggedRecordId
        };

        CalendarGrid.prototype.handleEventDragStart.call(context, {
            currentTarget,
            dataTransfer
        });

        expect(context.draggedRecordId).toBe('evt-1');
        expect(addClass).toHaveBeenCalledWith('event-pill--dragging');
        expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'evt-1');

        CalendarGrid.prototype.handleDayDragOver.call(context, {
            preventDefault: jest.fn(),
            dataTransfer,
            currentTarget: dayCell
        });
        expect(dayCell.classList.add).toHaveBeenCalledWith('day-cell--drop-target');

        CalendarGrid.prototype.handleDayDrop.call(context, {
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            currentTarget: dayCell,
            dataTransfer
        });

        expect(dropTargetRemove).toHaveBeenCalledWith('day-cell--drop-target');
        expect(context.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(context.dispatchEvent.mock.calls[0][0].type).toBe('eventdrop');
        expect(context.dispatchEvent.mock.calls[0][0].detail).toEqual({
            recordId: 'evt-1',
            targetDateKey: '2026-04-20'
        });

        CalendarGrid.prototype.handleEventDragEnd.call(context, {
            currentTarget
        });
        expect(removeClass).toHaveBeenCalledWith('event-pill--dragging');
        expect(context.draggedRecordId).toBeNull();
    });

    it('dispatches hover and context-menu events for native quick actions', () => {
        const dispatchEvent = jest.fn();
        const button = {
            dataset: {
                id: 'evt-1',
                name: 'Board Review',
                recordObjectApiName: 'Calendar_Event__c',
                recordContextId: 'a1x000000000001AAA',
                canDelete: 'true',
                canContextMenu: 'true'
            }
        };
        const context = {
            dispatchEvent,
            hoveredRecordId: null,
            resolveQuickActionSource: CalendarGrid.prototype.resolveQuickActionSource,
            resolveRecordSource: CalendarGrid.prototype.resolveRecordSource,
            dispatchHoverEvent: CalendarGrid.prototype.dispatchHoverEvent,
            dispatchQuickActionEvent: CalendarGrid.prototype.dispatchQuickActionEvent
        };

        CalendarGrid.prototype.handleNativeHoverOver.call(context, {
            clientX: 100,
            clientY: 200,
            target: {
                closest: jest.fn(() => button)
            }
        });

        expect(context.hoveredRecordId).toBe('evt-1');
        expect(dispatchEvent.mock.calls[0][0].type).toBe('eventhover');

        CalendarGrid.prototype.handleNativeQuickActionMouseDown.call(context, {
            button: 2,
            clientX: 110,
            clientY: 210,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            stopImmediatePropagation: jest.fn(),
            target: {
                closest: jest.fn(() => button)
            }
        });

        expect(dispatchEvent.mock.calls[1][0].type).toBe('eventcontextmenu');
        expect(dispatchEvent.mock.calls[1][0].detail.recordId).toBe('evt-1');

        CalendarGrid.prototype.handleNativeHoverOut.call(context, {
            target: {
                closest: jest.fn(() => button)
            },
            relatedTarget: {
                closest: jest.fn(() => null)
            }
        });

        expect(context.hoveredRecordId).toBeNull();
        expect(dispatchEvent.mock.calls[2][0].type).toBe('eventunhover');
    });

    it('registers native listeners once and cleans them up on disconnect', () => {
        const addEventListener = jest.fn();
        const removeEventListener = jest.fn();
        const context = {
            hasNativeQuickActionListeners: false,
            template: {
                addEventListener,
                removeEventListener
            },
            _boundHoverOver: jest.fn(),
            _boundHoverOut: jest.fn(),
            _boundMouseDown: jest.fn(),
            _boundContextMenu: jest.fn()
        };

        CalendarGrid.prototype.renderedCallback.call(context);
        CalendarGrid.prototype.renderedCallback.call(context);
        CalendarGrid.prototype.disconnectedCallback.call(context);

        expect(addEventListener).toHaveBeenCalledTimes(4);
        expect(removeEventListener).toHaveBeenCalledTimes(4);
        expect(context.hasNativeQuickActionListeners).toBe(false);
    });
});
