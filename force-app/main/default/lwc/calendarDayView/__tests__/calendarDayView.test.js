const { createElement } = require('lwc');
const CalendarDayView = require('c/calendarDayView').default;
const CalendarDayViewClass = require('../calendarDayView').default;

const flushPromises = () => Promise.resolve();

const DAY_VIEW_DATA = {
    dateStr: '2026-04-19',
    dateLabel: 'Sunday, Apr 19',
    hourSlots: [
        {
            key: '08',
            hour: 8,
            label: '8 AM',
            rowStyle: 'top:0px;'
        }
    ],
    allDayEvents: [
        {
            id: 'evt-all-day',
            name: 'All Day Offsite',
            className: 'event-pill',
            styleText: 'background:#0176d3;color:#fff;',
            hoverText: 'All Day Offsite',
            recordObjectApiName: 'Calendar_Event__c',
            recordContextId: 'a1x000000000001AAA',
            canEditAttr: 'true',
            canDeleteAttr: 'true',
            hasContextMenuAttr: 'true',
            occurrenceDate: '2026-04-19',
            isRecurring: 'false'
        }
    ],
    hasAllDayEvents: true,
    timedEvents: [
        {
            id: 'evt-timed',
            name: 'Customer Call',
            className: 'day-event',
            blockStyle: 'top:64px;height:64px;',
            hoverText: 'Customer Call',
            recordObjectApiName: 'Calendar_Event__c',
            recordContextId: 'a1x000000000001AAA',
            canEditAttr: 'false',
            canDeleteAttr: 'false',
            hasContextMenuAttr: 'true',
            occurrenceDate: '2026-04-19',
            isRecurring: 'true',
            timeLabel: '9:00 AM'
        }
    ],
    isToday: true,
    nowLineStyle: 'top:128px;',
    totalHeightStyle: 'height: 1536px;'
};

describe('c-calendar-day-view', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('renders all-day and timed event data and scrolls the grid to 8 AM', async () => {
        const element = createElement('c-calendar-day-view', { is: CalendarDayView });
        element.dayViewData = DAY_VIEW_DATA;
        document.body.appendChild(element);
        await flushPromises();

        const grid = element.shadowRoot.querySelector('.day-grid');
        expect(grid).not.toBeNull();
        expect(grid.scrollTop).toBe(8 * 64);
        expect(element.shadowRoot.textContent).toContain('All Day Offsite');
        expect(element.shadowRoot.textContent).toContain('Customer Call');
        expect(element.shadowRoot.querySelector('.day-now-line')).not.toBeNull();
    });

    it('dispatches slot, event open, hover, unhover, and context menu events', async () => {
        const element = createElement('c-calendar-day-view', { is: CalendarDayView });
        element.dayViewData = DAY_VIEW_DATA;
        document.body.appendChild(element);
        await flushPromises();

        const daySelectHandler = jest.fn();
        const eventOpenHandler = jest.fn();
        const eventHoverHandler = jest.fn();
        const eventUnhoverHandler = jest.fn();
        const eventContextMenuHandler = jest.fn();

        element.addEventListener('dayselect', daySelectHandler);
        element.addEventListener('eventopen', eventOpenHandler);
        element.addEventListener('eventhover', eventHoverHandler);
        element.addEventListener('eventunhover', eventUnhoverHandler);
        element.addEventListener('eventcontextmenu', eventContextMenuHandler);

        element.shadowRoot.querySelector('.day-hour-row').click();
        expect(daySelectHandler).toHaveBeenCalledTimes(1);
        expect(daySelectHandler.mock.calls[0][0].detail).toEqual({
            dateKey: '2026-04-19',
            isCurrentMonth: true,
            hour: 8
        });

        const timedEventButton = element.shadowRoot.querySelector('button[data-id="evt-timed"]');
        timedEventButton.click();
        expect(eventOpenHandler).toHaveBeenCalledTimes(1);
        expect(eventOpenHandler.mock.calls[0][0].detail).toMatchObject({
            recordId: 'evt-timed',
            canEdit: false,
            canDelete: false,
            occurrenceDate: '2026-04-19',
            isRecurring: true
        });

        timedEventButton.dispatchEvent(
            new MouseEvent('mouseenter', {
                bubbles: true,
                clientX: 120,
                clientY: 180
            })
        );
        expect(eventHoverHandler).toHaveBeenCalledTimes(1);
        expect(eventHoverHandler.mock.calls[0][0].detail).toMatchObject({
            recordId: 'evt-timed',
            canContextMenu: true,
            clientX: 120,
            clientY: 180
        });

        timedEventButton.dispatchEvent(
            new MouseEvent('mouseleave', {
                bubbles: true
            })
        );
        expect(eventUnhoverHandler).toHaveBeenCalledTimes(1);

        timedEventButton.dispatchEvent(
            new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                button: 2,
                clientX: 200,
                clientY: 240
            })
        );
        expect(eventContextMenuHandler).toHaveBeenCalledTimes(1);
        expect(eventContextMenuHandler.mock.calls[0][0].detail).toMatchObject({
            recordId: 'evt-timed',
            canDelete: false,
            canContextMenu: true,
            clientX: 200,
            clientY: 240
        });
    });

    it('supports delegated native hover and quick action handlers', async () => {
        const context = {
            hoveredRecordId: null,
            dispatchEvent: jest.fn(),
            resolveQuickActionSource: CalendarDayViewClass.prototype.resolveQuickActionSource,
            resolveRecordSource: CalendarDayViewClass.prototype.resolveRecordSource,
            dispatchHoverEvent: CalendarDayViewClass.prototype.dispatchHoverEvent,
            dispatchQuickActionEvent: CalendarDayViewClass.prototype.dispatchQuickActionEvent
        };

        const source = {
            dataset: {
                id: 'evt-timed',
                name: 'Customer Call',
                recordObjectApiName: 'Calendar_Event__c',
                recordContextId: 'a1x000000000001AAA',
                canDelete: 'false',
                canContextMenu: 'true'
            }
        };

        CalendarDayViewClass.prototype.handleNativeHoverOver.call(context, {
            target: { closest: jest.fn(() => source) },
            clientX: 50,
            clientY: 75
        });
        expect(context.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(context.hoveredRecordId).toBe('evt-timed');

        context.dispatchEvent.mockClear();
        CalendarDayViewClass.prototype.handleNativeHoverOut.call(context, {
            target: { closest: jest.fn(() => source) },
            relatedTarget: {
                closest: jest.fn(() => source)
            }
        });
        expect(context.dispatchEvent).not.toHaveBeenCalled();

        CalendarDayViewClass.prototype.handleNativeHoverOut.call(context, {
            target: { closest: jest.fn(() => source) },
            relatedTarget: null
        });
        expect(context.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(context.hoveredRecordId).toBeNull();

        const mouseDownEvent = {
            button: 2,
            target: { closest: jest.fn(() => source) },
            clientX: 10,
            clientY: 20,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            stopImmediatePropagation: jest.fn()
        };

        CalendarDayViewClass.prototype.handleNativeQuickActionMouseDown.call(
            context,
            mouseDownEvent
        );
        expect(mouseDownEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(mouseDownEvent.stopImmediatePropagation).toHaveBeenCalledTimes(1);
        expect(context.dispatchEvent).toHaveBeenCalledTimes(2);

        CalendarDayViewClass.prototype.handleNativeQuickActionContextMenu.call(context, {
            target: { closest: jest.fn(() => source) },
            clientX: 30,
            clientY: 40,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            stopImmediatePropagation: jest.fn()
        });
        expect(context.dispatchEvent).toHaveBeenCalledTimes(3);

        const disconnectContext = {
            template: {
                removeEventListener: jest.fn()
            },
            _boundHoverOver: jest.fn(),
            _boundHoverOut: jest.fn(),
            _boundMouseDown: jest.fn(),
            _boundContextMenu: jest.fn(),
            hasNativeQuickActionListeners: true
        };
        CalendarDayViewClass.prototype.disconnectedCallback.call(disconnectContext);
        expect(disconnectContext.template.removeEventListener).toHaveBeenCalledTimes(4);
        expect(disconnectContext.hasNativeQuickActionListeners).toBe(false);
    });
});