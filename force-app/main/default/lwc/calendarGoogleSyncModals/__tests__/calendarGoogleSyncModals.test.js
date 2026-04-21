const { createElement } = require('lwc');
const CalendarGoogleSyncModals = require('c/calendarGoogleSyncModals').default;

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function buildGoogleSyncViewState(overrides = {}) {
    return {
        importStatusMessage: 'Connect Google first.',
        importModalTitle: 'Choose Google Calendars',
        importModalSelectOptions: [
            { label: 'Select a Team Calendar', value: '', selected: false },
            { label: 'Revenue Team', value: 'a01AAA', selected: true }
        ],
        importModalCalendarHelpText: 'Choose which Salesforce Team Calendar should receive imported Google events.',
        isImportModalConfigured: true,
        isImportModalConnected: true,
        importCalendarOptions: [{ label: 'Primary', value: 'gcal-1' }],
        selectedImportCalendarIds: ['gcal-1'],
        importCalendarsDisabled: false,
        importHelpText: 'Choose which Google calendars should feed back into this Salesforce Team Calendar.',
        isImportModalUsingCurrentCalendar: true,
        exportModalTitle: 'Choose Google Calendar',
        exportModalSelectOptions: [
            { label: 'Select a Team Calendar', value: '', selected: false },
            { label: 'Revenue Team', value: 'a01AAA', selected: true }
        ],
        exportHelpText: 'Choose the single Google calendar that should receive Salesforce events.',
        isExportModalUsingCurrentCalendar: true,
        isExportModalConnected: true,
        calendarSelectionDisabled: false,
        exportSelectOptions: [
            { label: 'Select Google calendar', value: '', selected: false },
            { label: 'Primary', value: 'gcal-1', selected: true }
        ],
        ...overrides
    };
}

describe('c-calendar-google-sync-modals', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    function buildElement(props = {}) {
        const element = createElement('c-calendar-google-sync-modals', { is: CalendarGoogleSyncModals });
        element.showConnectModal = Boolean(props.showConnectModal);
        element.showImportModal = Boolean(props.showImportModal);
        element.showExportModal = Boolean(props.showExportModal);
        element.googleSyncViewState = buildGoogleSyncViewState(props.googleSyncViewState);
        element.syncMessage = props.syncMessage || 'Google sign-in is still pending.';
        document.body.appendChild(element);
        return element;
    }

    it('renders the import modal title from the provided state', async () => {
        const element = buildElement({ showImportModal: true });
        await flushPromises();

        expect(element.shadowRoot.textContent).toContain('Choose Google Calendars');
    });

    it('dispatches import calendar selection changes with the selected values', async () => {
        const element = buildElement({ showImportModal: true });
        await flushPromises();

        const handler = jest.fn();
        element.addEventListener('googleimportcalendarselectionchange', handler);

        const checkboxGroup = element.shadowRoot.querySelector('lightning-checkbox-group');
        checkboxGroup.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: ['gcal-2'] },
                bubbles: true,
                composed: true
            })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toEqual(['gcal-2']);
    });

    it('dispatches connect refresh when the connect modal confirmation button is clicked', async () => {
        const element = buildElement({ showConnectModal: true });
        await flushPromises();

        const handler = jest.fn();
        element.addEventListener('googleconnectmodalrefresh', handler);

        const buttons = Array.from(element.shadowRoot.querySelectorAll('button'));
        const refreshButton = buttons.find((button) => button.textContent.includes('I Finished Connecting'));
        refreshButton.click();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('dispatches export calendar changes from the native select', async () => {
        const element = buildElement({ showExportModal: true });
        await flushPromises();

        const handler = jest.fn();
        element.addEventListener('googleexportcalendarselectionchange', handler);

        const exportSelects = element.shadowRoot.querySelectorAll('select');
        expect(exportSelects.length).toBeGreaterThanOrEqual(2);

        const exportSelect = exportSelects[exportSelects.length - 1];
        exportSelect.value = 'gcal-1';
        exportSelect.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true }));

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe('gcal-1');
    });

    it('dispatches custom modal events through the shared helper', () => {
        const dispatchEvent = jest.fn();

        CalendarGoogleSyncModals.prototype.dispatchModalEvent.call(
            { dispatchEvent },
            'googleconnectmodalclose',
            { value: 'x' }
        );

        expect(dispatchEvent).toHaveBeenCalledTimes(1);
        expect(dispatchEvent.mock.calls[0][0].type).toBe('googleconnectmodalclose');
        expect(dispatchEvent.mock.calls[0][0].detail).toEqual({ value: 'x' });
    });

    it('forwards connect modal wrapper actions through the shared dispatcher', () => {
        const dispatchModalEvent = jest.fn();
        const context = { dispatchModalEvent };

        CalendarGoogleSyncModals.prototype.handleGoogleConnectModalClose.call(context);
        CalendarGoogleSyncModals.prototype.handleGoogleConnectModalLaunch.call(context);
        CalendarGoogleSyncModals.prototype.handleGoogleConnectModalRefresh.call(context);

        expect(dispatchModalEvent.mock.calls).toEqual([
            ['googleconnectmodalclose'],
            ['googleconnectmodallaunch'],
            ['googleconnectmodalrefresh']
        ]);
    });

    it('forwards import modal actions and selected values', () => {
        const dispatchModalEvent = jest.fn();
        const context = { dispatchModalEvent };

        CalendarGoogleSyncModals.prototype.handleGoogleImportModalClose.call(context);
        CalendarGoogleSyncModals.prototype.handleGoogleImportModalCalendarChange.call(context, {
            target: { value: 'a01AAA' }
        });
        CalendarGoogleSyncModals.prototype.handleGoogleImportModalLaunch.call(context);
        CalendarGoogleSyncModals.prototype.handleGoogleImportModalRefresh.call(context);
        CalendarGoogleSyncModals.prototype.handleGoogleImportModalContinue.call(context);
        CalendarGoogleSyncModals.prototype.handleGoogleImportCalendarSelectionChange.call(context, {
            detail: { value: ['gcal-1', 'gcal-2'] }
        });

        expect(dispatchModalEvent.mock.calls).toEqual([
            ['googleimportmodalclose'],
            ['googleimportmodalcalendarchange', { value: 'a01AAA' }],
            ['googleimportmodallaunch'],
            ['googleimportmodalrefresh'],
            ['googleimportmodalcontinue'],
            ['googleimportcalendarselectionchange', { value: ['gcal-1', 'gcal-2'] }]
        ]);
    });

    it('forwards export modal actions and selected values', () => {
        const dispatchModalEvent = jest.fn();
        const context = { dispatchModalEvent };

        CalendarGoogleSyncModals.prototype.handleGoogleExportModalClose.call(context);
        CalendarGoogleSyncModals.prototype.handleGoogleExportModalCalendarChange.call(context, {
            target: { value: 'a01AAA' }
        });
        CalendarGoogleSyncModals.prototype.handleGoogleExportModalLaunch.call(context);
        CalendarGoogleSyncModals.prototype.handleGoogleExportModalRefresh.call(context);
        CalendarGoogleSyncModals.prototype.handleGoogleExportModalContinue.call(context);
        CalendarGoogleSyncModals.prototype.handleGoogleExportCalendarSelectionChange.call(context, {
            target: { value: 'gcal-1' }
        });

        expect(dispatchModalEvent.mock.calls).toEqual([
            ['googleexportmodalclose'],
            ['googleexportmodalcalendarchange', { value: 'a01AAA' }],
            ['googleexportmodallaunch'],
            ['googleexportmodalrefresh'],
            ['googleexportmodalcontinue'],
            ['googleexportcalendarselectionchange', { value: 'gcal-1' }]
        ]);
    });
});