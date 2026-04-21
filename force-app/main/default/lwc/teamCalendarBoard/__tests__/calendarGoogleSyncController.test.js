jest.mock(
    '@salesforce/apex/GoogleCalendarSyncService.pushEventsForCalendar',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/GoogleCalendarSyncService.importEventsFromGoogle',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/GoogleCalendarConnectionService.getConnectionState',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/GoogleCalendarConnectionService.getAuthenticationUrl',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/GoogleCalendarConnectionService.disconnectGoogle',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/GoogleCalendarConnectionService.listAvailableCalendars',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/GoogleCalendarConnectionService.saveCalendarSelection',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/GoogleCalendarConnectionService.saveImportCalendarSelections',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    'c/calendarUtils',
    () => ({
        getVisibleRange: jest.fn(() => ({ startDate: '2026-04-01', endDate: '2026-04-30' }))
    }),
    { virtual: true }
);

const getConnectionState = require('@salesforce/apex/GoogleCalendarConnectionService.getConnectionState').default;
const getAuthenticationUrl = require('@salesforce/apex/GoogleCalendarConnectionService.getAuthenticationUrl').default;
const disconnectGoogle = require('@salesforce/apex/GoogleCalendarConnectionService.disconnectGoogle').default;
const listAvailableCalendars = require('@salesforce/apex/GoogleCalendarConnectionService.listAvailableCalendars').default;
const saveCalendarSelection = require('@salesforce/apex/GoogleCalendarConnectionService.saveCalendarSelection').default;
const saveImportCalendarSelections = require('@salesforce/apex/GoogleCalendarConnectionService.saveImportCalendarSelections').default;
const pushEventsForCalendar = require('@salesforce/apex/GoogleCalendarSyncService.pushEventsForCalendar').default;
const importEventsFromGoogle = require('@salesforce/apex/GoogleCalendarSyncService.importEventsFromGoogle').default;

const {
    resetGoogleSyncSelectionContext,
    routeGoogleToolbarEvent,
    routeGoogleModalEvent,
    loadGoogleConnectionState,
    loadGoogleCalendarOptions,
    handleGoogleImportAction,
    handleGoogleExportCalendarSelectionChange,
    handleGoogleImportCalendarSelectionChange,
    handleGoogleConnectRequest,
    handleGoogleConnectModalRefresh,
    handleGoogleImportModalContinue,
    handleGoogleExportModalContinue,
    startGoogleConnect,
    handleGoogleDisconnect,
    runGoogleImportSync,
    runGoogleSync
} = require('../calendarGoogleSyncController');

function createContext(overrides = {}) {
    return {
        selectedCalendarId: 'a01AAA',
        isCalendarViewBackedSelection: false,
        googleConnection: {
            configured: true,
            connected: true,
            googleCalendarId: 'gcal-1',
            googleImportCalendarIds: ['gcal-1']
        },
        googleCalendarOptions: [{ label: 'Existing', value: 'gcal-1' }],
        googleImportModalCalendarId: '',
        googleExportModalCalendarId: '',
        syncStatus: 'Queued',
        syncMessage: 'Queued message',
        googleImportStatus: 'Configured',
        googleImportMessage: 'Configured message',
        showGoogleConnectModal: true,
        showGoogleImportModal: true,
        showGoogleExportModal: true,
        calendarViewWireData: { loaded: true },
        calendarViewWireError: { message: 'test' },
        isGoogleBusy: false,
        currentDate: new Date('2026-04-15T00:00:00Z'),
        currentView: 'month',
        showToast: jest.fn(),
        extractErrorMessage: jest.fn((error) => error?.body?.message || error?.message || 'Unknown error'),
        loadEvents: jest.fn(() => Promise.resolve()),
        loadGoogleConnectionState: jest.fn(() => Promise.resolve()),
        _invalidateCache: jest.fn(),
        isGoogleSyncCalendarId: jest.fn((calendarId) => calendarId === 'a01AAA'),
        ...overrides
    };
}

describe('teamCalendarBoard calendarGoogleSyncController', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('resets Google feedback, modal state, wire data, and calendar options together', () => {
        const context = createContext();

        resetGoogleSyncSelectionContext(context);

        expect(context.syncStatus).toBe('');
        expect(context.syncMessage).toBe('');
        expect(context.googleImportStatus).toBe('');
        expect(context.googleImportMessage).toBe('');
        expect(context.showGoogleConnectModal).toBe(false);
        expect(context.showGoogleImportModal).toBe(false);
        expect(context.showGoogleExportModal).toBe(false);
        expect(context.calendarViewWireData).toBeUndefined();
        expect(context.calendarViewWireError).toBeUndefined();
        expect(context.googleCalendarOptions).toEqual([{ label: 'Select Google calendar', value: '' }]);
    });

    it('falls back to the default disconnected state when no calendar is selected', async () => {
        const context = createContext({ selectedCalendarId: '' });

        await loadGoogleConnectionState(context);

        expect(getConnectionState).not.toHaveBeenCalled();
        expect(context.googleConnection.configured).toBe(false);
        expect(context.googleConnection.connected).toBe(false);
        expect(context.googleCalendarOptions).toEqual([{ label: 'Select Google calendar', value: '' }]);
    });

    it('opens the Google import modal against the currently selected Team Calendar', () => {
        const context = createContext({ selectedCalendarId: 'a01AAA' });

        handleGoogleImportAction(context);

        expect(context.googleImportModalCalendarId).toBe('a01AAA');
        expect(context.showGoogleImportModal).toBe(true);
    });

    it('routes toolbar events to the correct Google action handler', async () => {
        const context = createContext({
            showGoogleImportModal: false,
            selectedCalendarId: 'a01AAA'
        });

        const handled = await routeGoogleToolbarEvent(context, { type: 'googleimportaction' });

        expect(handled).toBe(true);
        expect(context.showGoogleImportModal).toBe(true);
    });

    it('routes modal events to the matching Google modal handler', async () => {
        const context = createContext({
            showGoogleImportModal: true,
            selectedCalendarId: 'a01AAA'
        });

        const handled = await routeGoogleModalEvent(context, { type: 'googleimportmodalclose' });

        expect(handled).toBe(true);
        expect(context.showGoogleImportModal).toBe(false);
        expect(context.googleImportModalCalendarId).toBe('a01AAA');
    });

    it('starts the Google connect flow and shows the success toast when the popup opens', async () => {
        const context = createContext();
        const popup = {};
        const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup);
        getAuthenticationUrl.mockResolvedValue({ authUrl: 'https://example.com/oauth' });

        await startGoogleConnect(context);

        expect(context.syncStatus).toBe('Authentication Required');
        expect(context.googleImportStatus).toBe('Authentication Required');
        expect(context.showToast).toHaveBeenCalledWith(
            'Google Connect',
            'Complete Google sign-in in the new tab, then return here and click I Finished Connecting.',
            'success'
        );
        openSpy.mockRestore();
    });

    it('disconnects Google, closes the modals, and refreshes connection state', async () => {
        const loadGoogleConnectionStateMock = jest.fn(() => Promise.resolve());
        const context = createContext({ loadGoogleConnectionState: loadGoogleConnectionStateMock });
        disconnectGoogle.mockResolvedValue({ success: true, message: 'Google connection removed.' });

        await handleGoogleDisconnect(context);

        expect(context.showGoogleConnectModal).toBe(false);
        expect(context.showGoogleImportModal).toBe(false);
        expect(context.showGoogleExportModal).toBe(false);
        expect(context.syncStatus).toBe('Disconnected');
        expect(context.googleImportStatus).toBe('Disconnected');
        expect(loadGoogleConnectionStateMock).toHaveBeenCalledTimes(1);
    });

    it('loads available Google calendars and labels the primary calendar', async () => {
        const context = createContext();
        getConnectionState.mockResolvedValue({
            configured: true,
            connected: true,
            googleCalendarId: 'gcal-1',
            googleImportCalendarIds: ['gcal-1']
        });
        listAvailableCalendars.mockResolvedValue([
            { id: 'gcal-1', label: 'Primary', primary: true },
            { id: 'gcal-2', label: 'Shared Team', primary: false }
        ]);

        await loadGoogleConnectionState(context);

        expect(getConnectionState).toHaveBeenCalledWith({ calendarId: 'a01AAA' });
        expect(listAvailableCalendars).toHaveBeenCalledWith({ calendarId: 'a01AAA' });
        expect(context.googleCalendarOptions).toEqual(
            expect.arrayContaining([
                { label: 'Primary (Primary)', value: 'gcal-1' },
                { label: 'Shared Team', value: 'gcal-2' }
            ])
        );
    });

    it('stores the export calendar selection and refreshes connection state', async () => {
        const loadGoogleConnectionStateMock = jest.fn(() => Promise.resolve());
        const context = createContext({ loadGoogleConnectionState: loadGoogleConnectionStateMock });
        saveCalendarSelection.mockResolvedValue({
            success: true,
            message: 'Google export calendar saved.'
        });

        await handleGoogleExportCalendarSelectionChange(context, {
            detail: { value: 'gcal-2' }
        });

        expect(saveCalendarSelection).toHaveBeenCalledWith({
            calendarId: 'a01AAA',
            googleCalendarId: 'gcal-2'
        });
        expect(context.syncStatus).toBe('Configured');
        expect(context.syncMessage).toBe('Google export calendar saved.');
        expect(context.showToast).toHaveBeenCalledWith(
            'Google Calendar',
            'Google export calendar saved.',
            'success'
        );
        expect(loadGoogleConnectionStateMock).toHaveBeenCalledTimes(1);
    });

    it('surfaces import calendar selection save errors', async () => {
        const loadGoogleConnectionStateMock = jest.fn(() => Promise.resolve());
        const context = createContext({ loadGoogleConnectionState: loadGoogleConnectionStateMock });
        saveImportCalendarSelections.mockRejectedValue({
            body: { message: 'Unable to save import calendars.' }
        });

        await handleGoogleImportCalendarSelectionChange(context, {
            detail: { value: ['gcal-1', 'gcal-2'] }
        });

        expect(context.googleImportStatus).toBe('Error');
        expect(context.googleImportMessage).toBe('Unable to save import calendars.');
        expect(context.showToast).toHaveBeenCalledWith(
            'Google Import Calendar Error',
            'Unable to save import calendars.',
            'error'
        );
        expect(loadGoogleConnectionStateMock).toHaveBeenCalledTimes(1);
    });

    it('opens the Google connect modal only when the selected calendar supports sync', () => {
        const missingCalendarContext = createContext({
            selectedCalendarId: '',
            showGoogleConnectModal: false
        });
        handleGoogleConnectRequest(missingCalendarContext);
        expect(missingCalendarContext.showGoogleConnectModal).toBe(false);
        expect(missingCalendarContext.showToast).toHaveBeenCalledWith(
            'Google',
            'Select a calendar first.',
            'error'
        );

        const validContext = createContext({ showGoogleConnectModal: false });
        handleGoogleConnectRequest(validContext);
        expect(validContext.showGoogleConnectModal).toBe(true);
    });

    it('closes the connect modal after a successful refresh', async () => {
        const context = createContext({
            showGoogleConnectModal: true,
            googleConnection: {
                configured: true,
                connected: false
            }
        });
        context.loadGoogleConnectionState = jest.fn(async () => {
            context.googleConnection = {
                configured: true,
                connected: true
            };
        });

        await handleGoogleConnectModalRefresh(context);

        expect(context.showGoogleConnectModal).toBe(false);
        expect(context.showToast).toHaveBeenCalledWith(
            'Google Connect',
            'Google connection is ready.',
            'success'
        );
    });

    it('switches calendar context when import continues against a different Team Calendar', async () => {
        const loadEventsMock = jest.fn(() => Promise.resolve());
        const loadGoogleConnectionStateMock = jest.fn(() => Promise.resolve());
        const context = createContext({
            showGoogleImportModal: true,
            syncStatus: 'Queued',
            syncMessage: 'Existing sync state',
            googleImportStatus: 'Configured',
            googleImportMessage: 'Existing import state',
            loadEvents: loadEventsMock,
            loadGoogleConnectionState: loadGoogleConnectionStateMock,
            googleSyncViewState: {
                isImportModalCalendarSelected: true,
                isImportModalUsingCurrentCalendar: false,
                resolvedImportModalCalendarId: 'a01BBB',
                selectedImportCalendarIds: ['gcal-1']
            }
        });

        await handleGoogleImportModalContinue(context);

        expect(context.selectedCalendarId).toBe('a01BBB');
        expect(context.showGoogleImportModal).toBe(false);
        expect(context.syncStatus).toBe('');
        expect(context.googleImportStatus).toBe('');
        expect(loadEventsMock).toHaveBeenCalledTimes(1);
        expect(loadGoogleConnectionStateMock).toHaveBeenCalledTimes(1);
    });

    it('warns when import continues without any selected Google calendars', async () => {
        const context = createContext({
            googleSyncViewState: {
                isImportModalCalendarSelected: true,
                isImportModalUsingCurrentCalendar: true,
                selectedImportCalendarIds: []
            }
        });

        await handleGoogleImportModalContinue(context);

        expect(context.showToast).toHaveBeenCalledWith(
            'Google Import',
            'Choose at least one Google calendar before importing into Salesforce.',
            'warning'
        );
    });

    it('imports Google events and refreshes board state', async () => {
        const loadEventsMock = jest.fn(() => Promise.resolve());
        const loadGoogleConnectionStateMock = jest.fn(() => Promise.resolve());
        const context = createContext({
            showGoogleImportModal: true,
            loadEvents: loadEventsMock,
            loadGoogleConnectionState: loadGoogleConnectionStateMock,
            googleSyncViewState: {
                isImportModalCalendarSelected: true,
                isImportModalUsingCurrentCalendar: true,
                selectedImportCalendarIds: ['gcal-1']
            }
        });
        importEventsFromGoogle.mockResolvedValue({
            success: true,
            message: 'Imported 4 Google events.'
        });

        await handleGoogleImportModalContinue(context);

        expect(importEventsFromGoogle).toHaveBeenCalledWith(
            expect.objectContaining({
                calendarId: 'a01AAA',
                start: expect.any(String),
                endDate: expect.any(String)
            })
        );
        expect(context.showGoogleImportModal).toBe(false);
        expect(context.googleImportStatus).toBe('Imported');
        expect(context.googleImportMessage).toBe('Imported 4 Google events.');
        expect(context._invalidateCache).toHaveBeenCalledTimes(1);
        expect(loadEventsMock).toHaveBeenCalledTimes(1);
        expect(loadGoogleConnectionStateMock).toHaveBeenCalledTimes(1);
    });

    it('warns when export continues without a Google destination calendar', async () => {
        const context = createContext({
            googleConnection: {
                configured: true,
                connected: true,
                googleCalendarId: ''
            },
            googleSyncViewState: {
                isExportModalCalendarSelected: true,
                isExportModalUsingCurrentCalendar: true
            }
        });

        await handleGoogleExportModalContinue(context);

        expect(context.showToast).toHaveBeenCalledWith(
            'Google Calendar',
            'Choose which Google calendar should receive Salesforce events.',
            'warning'
        );
    });

    it('queues a Google export sync and refreshes connection state', async () => {
        const loadGoogleConnectionStateMock = jest.fn(() => Promise.resolve());
        const context = createContext({
            showGoogleExportModal: true,
            loadGoogleConnectionState: loadGoogleConnectionStateMock,
            googleSyncViewState: {
                isExportModalCalendarSelected: true,
                isExportModalUsingCurrentCalendar: true
            }
        });
        pushEventsForCalendar.mockResolvedValue({
            success: true,
            message: 'Google sync queued.'
        });

        await handleGoogleExportModalContinue(context);

        expect(pushEventsForCalendar).toHaveBeenCalledWith({
            calendarId: 'a01AAA',
            start: null,
            endDate: null
        });
        expect(context.showGoogleExportModal).toBe(false);
        expect(context.syncStatus).toBe('Queued');
        expect(context.syncMessage).toBe('Google sync queued.');
        expect(loadGoogleConnectionStateMock).toHaveBeenCalledTimes(1);
    });

    it('warns when the browser blocks the Google auth popup', async () => {
        const context = createContext();
        const openSpy = jest.spyOn(window, 'open').mockReturnValue(null);
        getAuthenticationUrl.mockResolvedValue({ authUrl: 'https://example.com/oauth' });

        await startGoogleConnect(context);

        expect(context.showToast).toHaveBeenCalledWith(
            'Google Connect',
            'Popup blocked. Allow popups for Salesforce and try again.',
            'warning'
        );
        openSpy.mockRestore();
    });

    it('handles Google calendar option load failures', async () => {
        const context = createContext({
            googleConnection: {
                configured: true,
                connected: true
            }
        });
        listAvailableCalendars.mockRejectedValue(new Error('Calendar list failed.'));

        await loadGoogleCalendarOptions(context);

        expect(context.googleCalendarOptions).toEqual([{ label: 'Select Google calendar', value: '' }]);
        expect(context.googleImportStatus).toBe('Error');
        expect(context.googleImportMessage).toBe('Calendar list failed.');
    });

    it('surfaces Google sync errors while refreshing connection state', async () => {
        const loadGoogleConnectionStateMock = jest.fn(() => Promise.resolve());
        const context = createContext({ loadGoogleConnectionState: loadGoogleConnectionStateMock });
        pushEventsForCalendar.mockRejectedValue(new Error('Sync request failed.'));

        await runGoogleSync(context);

        expect(context.syncStatus).toBe('Error');
        expect(context.syncMessage).toBe('Sync request failed.');
        expect(context.showToast).toHaveBeenCalledWith(
            'Google Sync Error',
            'Sync request failed.',
            'error'
        );
        expect(loadGoogleConnectionStateMock).toHaveBeenCalledTimes(1);
    });

    it('surfaces Google import errors while refreshing connection state', async () => {
        const loadGoogleConnectionStateMock = jest.fn(() => Promise.resolve());
        const context = createContext({ loadGoogleConnectionState: loadGoogleConnectionStateMock });
        importEventsFromGoogle.mockRejectedValue(new Error('Import request failed.'));

        await runGoogleImportSync(context);

        expect(context.googleImportStatus).toBe('Error');
        expect(context.googleImportMessage).toBe('Import request failed.');
        expect(context.showToast).toHaveBeenCalledWith(
            'Google Import Error',
            'Import request failed.',
            'error'
        );
        expect(loadGoogleConnectionStateMock).toHaveBeenCalledTimes(1);
    });
});