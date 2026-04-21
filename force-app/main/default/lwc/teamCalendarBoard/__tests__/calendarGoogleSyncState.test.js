const {
    buildEmptyGoogleCalendarOptions,
    buildGoogleSyncCalendarDefinitions,
    buildGoogleSyncViewState,
    isGoogleSyncCalendarId
} = require('../calendarGoogleSyncState');

describe('teamCalendarBoard calendarGoogleSyncState', () => {
    it('filters out CalendarView-backed definitions from Google sync candidates', () => {
        const definitions = buildGoogleSyncCalendarDefinitions(
            [
                { id: 'a01', name: 'Team Calendar' },
                { id: '00U1', name: 'Task View', listViewFilterId: '00B1' }
            ],
            (definition) => Boolean(definition.listViewFilterId)
        );

        expect(definitions).toEqual([{ id: 'a01', name: 'Team Calendar' }]);
    });

    it('resolves the import modal to the currently selected Team Calendar when valid', () => {
        const state = buildGoogleSyncViewState({
            selectedCalendarId: 'a01',
            googleSyncCalendarDefinitions: [{ id: 'a01', name: 'Revenue Team' }],
            googleConnection: {
                configured: true,
                connected: true,
                googleImportCalendarIds: ['gcal-1']
            },
            googleCalendarOptions: [
                ...buildEmptyGoogleCalendarOptions(),
                { label: 'Primary', value: 'gcal-1' }
            ]
        });

        expect(state.resolvedImportModalCalendarId).toBe('a01');
        expect(state.isImportModalUsingCurrentCalendar).toBe(true);
        expect(state.selectedImportCalendarIds).toEqual(['gcal-1']);
    });

    it('surfaces setup-needed labels when Google is not configured', () => {
        const state = buildGoogleSyncViewState({
            selectedCalendarId: 'a01',
            googleSyncCalendarDefinitions: [{ id: 'a01', name: 'Revenue Team' }],
            googleConnection: {
                configured: false,
                connected: false
            }
        });

        expect(state.importActionLabel).toBe('Setup Needed');
        expect(state.exportActionLabel).toBe('Setup Needed');
        expect(state.importModalCalendarHelpText).toBe('Google connection settings are unavailable right now.');
    });

    it('treats only known Team Calendar ids as Google-sync-enabled calendars', () => {
        expect(isGoogleSyncCalendarId('a01', [{ id: 'a01' }])).toBe(true);
        expect(isGoogleSyncCalendarId('00U1', [{ id: 'a01' }])).toBe(false);
        expect(isGoogleSyncCalendarId('', [{ id: 'a01' }])).toBe(false);
    });
});