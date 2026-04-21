const { createElement } = require('lwc');
const CalendarAgenda = require('c/calendarAgenda').default;
const CalendarAgendaClass = require('../calendarAgenda').default;

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const SAMPLE_GROUPS = [
    {
        key: '2026-04-18',
        label: 'Saturday, Apr 18, 2026',
        count: 2,
        countLabel: '2 events',
        events: [
            {
                id: 'a1B000000000001AAA',
                name: 'Morning Standup',
                recordObjectApiName: 'Calendar_Event__c',
                recordContextId: 'a1x000000000001AAA',
                calendarColor: '#0176d3',
                colorBarStyle: 'background-color:#0176d3',
                canEditAttr: 'true',
                canDeleteAttr: 'true',
                hasContextMenuAttr: 'false',
                startTimeLabel: '9:00 AM',
                hoverText: 'Morning Standup'
            },
            {
                id: 'a1B000000000002AAA',
                name: 'Team Lunch',
                recordObjectApiName: 'Calendar_Event__c',
                recordContextId: 'a1x000000000001AAA',
                calendarColor: '#22bb33',
                colorBarStyle: 'background-color:#22bb33',
                canEditAttr: 'true',
                canDeleteAttr: 'false',
                hasContextMenuAttr: 'false',
                startTimeLabel: '12:00 PM',
                hoverText: 'Team Lunch'
            }
        ]
    }
];

const INTERACTIVE_GROUPS = [
    {
        key: '2026-04-19',
        label: 'Sunday, Apr 19, 2026',
        count: 1,
        countLabel: '1 event',
        events: [
            {
                id: 'a1B000000000003AAA',
                name: 'Customer Demo',
                recordObjectApiName: 'Calendar_Event__c',
                recordContextId: 'a1x000000000002AAA',
                calendarColor: '#ff6600',
                colorBarStyle: 'background-color:#ff6600',
                canEditAttr: 'false',
                canDeleteAttr: 'true',
                hasContextMenuAttr: 'true',
                agendaTimeLabel: '2:00 PM',
                calendarName: 'Revenue Team',
                statusLabel: 'Confirmed',
                hoverText: 'Customer Demo',
                occurrenceDate: '2026-04-19',
                isRecurring: 'true',
                syncStatusLabel: 'Synced'
            }
        ]
    }
];

describe('c-calendar-agenda', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('renders empty state when no groups are provided', async () => {
        const el = createElement('c-calendar-agenda', { is: CalendarAgenda });
        el.groups = [];
        document.body.appendChild(el);
        await flushPromises();

        // No event rows should exist
        const buttons = el.shadowRoot.querySelectorAll('button');
        expect(buttons.length).toBe(0);
    });

    it('renders event rows for provided groups', async () => {
        const el = createElement('c-calendar-agenda', { is: CalendarAgenda });
        el.groups = SAMPLE_GROUPS;
        document.body.appendChild(el);
        await flushPromises();

        const eventBtns = el.shadowRoot.querySelectorAll('button[data-id]');
        expect(eventBtns.length).toBe(2);
    });

    it('renders the day group label', async () => {
        const el = createElement('c-calendar-agenda', { is: CalendarAgenda });
        el.groups = SAMPLE_GROUPS;
        document.body.appendChild(el);
        await flushPromises();

        expect(el.shadowRoot.textContent).toContain('Saturday, Apr 18, 2026');
    });

    it('renders the event count label', async () => {
        const el = createElement('c-calendar-agenda', { is: CalendarAgenda });
        el.groups = SAMPLE_GROUPS;
        document.body.appendChild(el);
        await flushPromises();

        expect(el.shadowRoot.textContent).toContain('2 events');
    });

    it('dispatches "eventopen" when an event button is clicked', async () => {
        const el = createElement('c-calendar-agenda', { is: CalendarAgenda });
        el.groups = SAMPLE_GROUPS;
        document.body.appendChild(el);
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('eventopen', handler);

        const firstBtn = el.shadowRoot.querySelector('button[data-id]');
        firstBtn.click();
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.recordId).toBe('a1B000000000001AAA');
    });

    it('dispatches "dayselect" when the Add Event button is clicked', async () => {
        const el = createElement('c-calendar-agenda', { is: CalendarAgenda });
        el.groups = SAMPLE_GROUPS;
        document.body.appendChild(el);
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('dayselect', handler);

        const addBtn = el.shadowRoot.querySelector('lightning-button[data-date]');
        expect(addBtn).not.toBeNull();
        addBtn.click();
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.dateKey).toBe('2026-04-18');
    });

    it('includes canEdit=true when event attribute is not "false"', async () => {
        const el = createElement('c-calendar-agenda', { is: CalendarAgenda });
        el.groups = SAMPLE_GROUPS;
        document.body.appendChild(el);
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('eventopen', handler);

        el.shadowRoot.querySelector('button[data-id]').click();
        await flushPromises();

        expect(handler.mock.calls[0][0].detail.canEdit).toBe(true);
    });

    it('dispatches hover, unhover, and context menu events for interactive rows', async () => {
        const el = createElement('c-calendar-agenda', { is: CalendarAgenda });
        el.groups = INTERACTIVE_GROUPS;
        document.body.appendChild(el);
        await flushPromises();

        const hoverHandler = jest.fn();
        const unhoverHandler = jest.fn();
        const contextMenuHandler = jest.fn();
        el.addEventListener('eventhover', hoverHandler);
        el.addEventListener('eventunhover', unhoverHandler);
        el.addEventListener('eventcontextmenu', contextMenuHandler);

        const button = el.shadowRoot.querySelector('button[data-id="a1B000000000003AAA"]');
        button.dispatchEvent(
            new MouseEvent('mouseenter', {
                bubbles: true,
                clientX: 140,
                clientY: 200
            })
        );
        button.dispatchEvent(
            new MouseEvent('mouseleave', {
                bubbles: true
            })
        );
        button.dispatchEvent(
            new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                button: 2,
                clientX: 220,
                clientY: 260
            })
        );
        await flushPromises();

        expect(hoverHandler).toHaveBeenCalledTimes(1);
        expect(hoverHandler.mock.calls[0][0].detail).toMatchObject({
            recordId: 'a1B000000000003AAA',
            canDelete: true,
            canContextMenu: true,
            clientX: 140,
            clientY: 200
        });
        expect(unhoverHandler).toHaveBeenCalledTimes(1);
        expect(contextMenuHandler).toHaveBeenCalledTimes(1);
        expect(contextMenuHandler.mock.calls[0][0].detail).toMatchObject({
            recordId: 'a1B000000000003AAA',
            canDelete: true,
            canContextMenu: true,
            clientX: 220,
            clientY: 260
        });
    });

    it('supports delegated native hover and quick-action handlers', () => {
        const context = {
            hoveredRecordId: null,
            dispatchEvent: jest.fn(),
            resolveQuickActionSource: CalendarAgendaClass.prototype.resolveQuickActionSource,
            resolveRecordSource: CalendarAgendaClass.prototype.resolveRecordSource,
            dispatchHoverEvent: CalendarAgendaClass.prototype.dispatchHoverEvent,
            dispatchQuickActionEvent: CalendarAgendaClass.prototype.dispatchQuickActionEvent
        };

        const source = {
            dataset: {
                id: 'a1B000000000003AAA',
                name: 'Customer Demo',
                recordObjectApiName: 'Calendar_Event__c',
                recordContextId: 'a1x000000000002AAA',
                canDelete: 'true',
                canContextMenu: 'true'
            }
        };

        CalendarAgendaClass.prototype.handleNativeHoverOver.call(context, {
            target: { closest: jest.fn(() => source) },
            clientX: 10,
            clientY: 20
        });
        expect(context.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(context.hoveredRecordId).toBe('a1B000000000003AAA');

        context.dispatchEvent.mockClear();
        CalendarAgendaClass.prototype.handleNativeHoverOut.call(context, {
            target: { closest: jest.fn(() => source) },
            relatedTarget: {
                closest: jest.fn(() => source)
            }
        });
        expect(context.dispatchEvent).not.toHaveBeenCalled();

        CalendarAgendaClass.prototype.handleNativeHoverOut.call(context, {
            target: { closest: jest.fn(() => source) },
            relatedTarget: null
        });
        expect(context.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(context.hoveredRecordId).toBeNull();

        const mouseDownEvent = {
            button: 2,
            target: { closest: jest.fn(() => source) },
            clientX: 30,
            clientY: 40,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            stopImmediatePropagation: jest.fn()
        };
        CalendarAgendaClass.prototype.handleNativeQuickActionMouseDown.call(
            context,
            mouseDownEvent
        );
        expect(mouseDownEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(mouseDownEvent.stopImmediatePropagation).toHaveBeenCalledTimes(1);
        expect(context.dispatchEvent).toHaveBeenCalledTimes(2);

        CalendarAgendaClass.prototype.handleNativeQuickActionContextMenu.call(context, {
            target: { closest: jest.fn(() => source) },
            clientX: 50,
            clientY: 60,
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
        CalendarAgendaClass.prototype.disconnectedCallback.call(disconnectContext);
        expect(disconnectContext.template.removeEventListener).toHaveBeenCalledTimes(4);
        expect(disconnectContext.hasNativeQuickActionListeners).toBe(false);
    });
});
