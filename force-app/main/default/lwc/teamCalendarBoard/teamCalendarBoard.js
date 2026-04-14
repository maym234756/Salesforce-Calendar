import { LightningElement, wire } from 'lwc';
import getCalendars from '@salesforce/apex/TeamCalendarBoardController.getCalendars';
import getActiveUsers from '@salesforce/apex/TeamCalendarBoardController.getActiveUsers';
import getUserCalendars from '@salesforce/apex/TeamCalendarBoardController.getUserCalendars';
import getEventsForRange from '@salesforce/apex/TeamCalendarBoardController.getEventsForRange';
import getPdfExportPageUrl from '@salesforce/apex/TeamCalendarBoardController.getPdfExportPageUrl';
import getCurrentUserLayoutPreference from '@salesforce/apex/TeamCalendarSecurityController.getCurrentUserLayoutPreference';
import pushEventsForCalendar from '@salesforce/apex/GoogleCalendarSyncService.pushEventsForCalendar';
import importEventsFromGoogle from '@salesforce/apex/GoogleCalendarSyncService.importEventsFromGoogle';
import getConnectionState from '@salesforce/apex/GoogleCalendarConnectionService.getConnectionState';
import getAuthenticationUrl from '@salesforce/apex/GoogleCalendarConnectionService.getAuthenticationUrl';
import disconnectGoogle from '@salesforce/apex/GoogleCalendarConnectionService.disconnectGoogle';
import listAvailableCalendars from '@salesforce/apex/GoogleCalendarConnectionService.listAvailableCalendars';
import saveCalendarSelection from '@salesforce/apex/GoogleCalendarConnectionService.saveCalendarSelection';
import saveImportCalendarSelections from '@salesforce/apex/GoogleCalendarConnectionService.saveImportCalendarSelections';
import { getListRecordsByName } from 'lightning/uiListsApi';
import {
    buildCalendarWeeks,
    buildAgendaGroups,
    buildRangeLabel,
    getVisibleRange
} from 'c/calendarUtils';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import USER_ID from '@salesforce/user/Id';

export default class TeamCalendarBoard extends LightningElement {
    error;
    isLoading = false;
    isGoogleBusy = false;

    currentDate = new Date();
    currentView = 'month';

    showCreateModal = false;
    showDrawer = false;

    selectedCalendarId = '';
    selectedStatus = '';
    selectedRecordId = null;
    defaultStart = null;
    defaultEnd = null;

    events = [];
    weeks = [];
    agendaGroups = [];
    teamLoadRows = [];
    conflictRows = [];

    syncStatus = '';
    syncMessage = '';
    googleImportStatus = '';
    googleImportMessage = '';
    showGoogleConnectModal = false;
    showGoogleImportModal = false;
    showGoogleExportModal = false;
    googleImportModalCalendarId = '';
    googleExportModalCalendarId = '';

    googleConnection = createDefaultGoogleConnection();
    googleCalendarOptions = [{ label: 'Select Google calendar', value: '' }];
    currentUserId = USER_ID;
    userLayoutPreference = createDefaultLayoutPreference();

    calendarDefinitions = [];
    calendarOptions = [{ label: 'All Calendars', value: '' }];
    statusOptions = [
        { label: 'All Statuses', value: '' },
        { label: 'Planned', value: 'Planned' },
        { label: 'Confirmed', value: 'Confirmed' },
        { label: 'Cancelled', value: 'Cancelled' }
    ];
    viewOptions = [
        { label: 'Month', value: 'month' },
        { label: 'Week', value: 'week' },
        { label: 'Agenda', value: 'agenda' },
        { label: 'Team Load', value: 'teamLoad' },
        { label: 'Conflicts', value: 'conflicts' }
    ];

    activeUserOptions = [];
    selectedUserIds = [];
    maxSelectedUsers = 20;

    userCalendarsByUser = {};
    selectedCalendarsByUser = {};
    activeUserCalendarUserId = null;
    calendarViewPayloadsById = {};
    calendarViewErrorsById = {};

    loadSequence = 0;
    pdfExportPageUrl = '/apex/TeamCalendarPdfExport';

    calendarViewWireData;
    calendarViewWireError;
    calendarViewPageSize = 2000;

    connectedCallback() {
        this.initialize();
    }

    async initialize() {
        await this.loadCurrentUserLayoutPreference();
        await Promise.all([
            this.loadCalendars(),
            this.loadActiveUsers(),
            this.loadPdfExportPageUrl()
        ]);
        await Promise.all([this.loadEvents(), this.loadGoogleConnectionState()]);
    }

    async loadPdfExportPageUrl() {
        try {
            const resolvedUrl = await getPdfExportPageUrl();
            if (resolvedUrl) {
                this.pdfExportPageUrl = resolvedUrl;
            }
        } catch (error) {
            this.pdfExportPageUrl = '/apex/TeamCalendarPdfExport';
        }
    }

    get rangeLabel() {
        return buildRangeLabel(this.currentDate, this.currentView);
    }

    get monthYearLabel() {
        return buildRangeLabel(this.currentDate, 'month');
    }

    get eventCount() {
        return this.events.length;
    }

    get selectedUserCount() {
        return Array.isArray(this.selectedUserIds) ? this.selectedUserIds.length : 0;
    }

    get activeUserCount() {
        return Array.isArray(this.activeUserOptions) ? this.activeUserOptions.length : 0;
    }

    get boardContentClass() {
        let classes = 'board-content';

        if (this.compactEventDensity) {
            classes += ' board-content--compact';
        }

        if (this.wrapEventTitles) {
            classes += ' board-content--wrap';
        }

        return classes;
    }

    get showWeekends() {
        return this.userLayoutPreference.showWeekends !== false;
    }

    get autoExpandDayHeight() {
        return this.userLayoutPreference.autoExpandDayHeight !== false;
    }

    get wrapEventTitles() {
        return this.userLayoutPreference.wrapEventTitles !== false;
    }

    get compactEventDensity() {
        return this.userLayoutPreference.compactEventDensity === true;
    }

    get isGridView() {
        return this.currentView === 'month' || this.currentView === 'week';
    }

    get isWeekView() {
        return this.currentView === 'week';
    }

    get isAgendaView() {
        return this.currentView === 'agenda';
    }

    get isTeamLoadView() {
        return this.currentView === 'teamLoad';
    }

    get isConflictsView() {
        return this.currentView === 'conflicts';
    }

    get hasConflicts() {
        return this.conflictRows.length > 0;
    }

    get hasTeamLoadRows() {
        return this.teamLoadRows.length > 0;
    }

    get defaultCalendarId() {
        return this.selectedCalendarId || null;
    }

    get selectedCalendarDefinition() {
        if (!this.selectedCalendarId) {
            return null;
        }

        return (this.calendarDefinitions || []).find(
            (row) => row.id === this.selectedCalendarId
        ) || null;
    }

    get isCalendarViewBackedSelection() {
        const selected = this.selectedCalendarDefinition;
        return Boolean(
            selected &&
            selected.listViewFilterId &&
            selected.sobjectType &&
            selected.startField &&
            selected.listViewApiName &&
            (selected.listViewObjectApiName || selected.sobjectType)
        );
    }

    get calendarViewWireObjectApiName() {
        if (!this.isCalendarViewBackedSelection) {
            return undefined;
        }

        return (
            this.selectedCalendarDefinition?.listViewObjectApiName ||
            this.selectedCalendarDefinition?.sobjectType ||
            undefined
        );
    }

    get calendarViewWireApiName() {
        if (!this.isCalendarViewBackedSelection) {
            return undefined;
        }

        return this.selectedCalendarDefinition?.listViewApiName || undefined;
    }

    get calendarViewWireOptionalFields() {
        if (!this.isCalendarViewBackedSelection) {
            return undefined;
        }

        const definition = this.selectedCalendarDefinition;
        const objectApiName = this.calendarViewWireObjectApiName;

        if (!definition || !objectApiName) {
            return undefined;
        }

        const fieldNames = [
            definition.startField,
            definition.endField,
            definition.displayField,
            'OwnerId',
            'Name'
        ].filter(Boolean);

        const qualifiedFieldNames = [...new Set(
            fieldNames.map((fieldName) => `${objectApiName}.${fieldName}`)
        )];

        return qualifiedFieldNames.length ? qualifiedFieldNames : undefined;
    }

    get googleImportActionLabel() {
        if (!this.selectedCalendarId) {
            return 'Select Calendar';
        }

        if (this.isCalendarViewBackedSelection) {
            return 'Calendar View';
        }

        if (!this.googleConnection.configured) {
            return 'Setup Needed';
        }

        return 'Import to Salesforce';
    }

    get googleConnectLabel() {
        if (!this.selectedCalendarId) {
            return 'Select Calendar';
        }

        if (!this.googleConnection.configured) {
            return 'Setup Needed';
        }

        return this.googleConnection.connected ? 'Reconnect Google' : 'Connect Google';
    }

    get googleConnectDisabled() {
        return this.isGoogleBusy || !this.selectedCalendarId || !this.googleConnection.configured;
    }

    get googleImportActionDisabled() {
        return this.isGoogleBusy;
    }

    get googleImportStatusLabel() {
        if (this.isCalendarViewBackedSelection) {
            return 'Calendar View ACTIVE';
        }

        if (this.isGoogleBusy) {
            return 'Working';
        }

        if (this.googleImportStatus) {
            return this.googleImportStatus;
        }

        return this.googleConnection.status || 'Not Connected';
    }

    get googleImportStatusMessage() {
        if (this.isCalendarViewBackedSelection) {
            const selected = this.selectedCalendarDefinition;
            if (!selected) {
                return 'This selection is backed by a Salesforce Calendar View.';
            }

            return `${selected.name} is powered by ${selected.sobjectType} via list view ${selected.listViewFilterId}. Google Sync only applies to Team Calendar event calendars.`;
        }

        if (this.isGoogleBusy) {
            return 'Please wait while the Google action finishes.';
        }

        if (this.googleImportMessage) {
            return this.googleImportMessage;
        }

        return this.googleConnection.message || '';
    }

    get googleExportActionLabel() {
        if (!this.selectedCalendarId) {
            return 'Select Calendar';
        }

        if (this.isCalendarViewBackedSelection) {
            return 'Calendar View';
        }

        if (!this.googleConnection.configured) {
            return 'Setup Needed';
        }

        return 'Sync to Google';
    }

    get googleExportActionDisabled() {
        return this.isGoogleBusy;
    }

    get googleExportStatus() {
        if (this.isCalendarViewBackedSelection) {
            return 'Calendar View ACTIVE';
        }

        if (this.isGoogleBusy) {
            return 'Working';
        }

        if (this.syncStatus) {
            return this.syncStatus;
        }

        if (!this.googleConnection.connected) {
            return this.googleConnection.status || 'Not Connected';
        }

        return this.googleConnection.googleCalendarId ? 'Ready' : 'Choose Google Calendar';
    }

    get googleExportMessage() {
        if (this.isCalendarViewBackedSelection) {
            return 'Google Sync is only available for Team Calendar records.';
        }

        if (this.isGoogleBusy) {
            return 'Please wait while the Google action finishes.';
        }

        if (this.syncMessage) {
            return this.syncMessage;
        }

        return this.googleExportHelpText;
    }

    get googleImportModalCalendarOptions() {
        return (this.googleSyncCalendarDefinitions || []).map((definition) => ({
            label: definition.name,
            value: definition.id
        }));
    }

    get googleImportModalSelectOptions() {
        const selectedValue = this.resolvedGoogleImportModalCalendarId;

        return [
            {
                label: 'Select a Team Calendar',
                value: '',
                selected: !selectedValue
            },
            ...(this.googleImportModalCalendarOptions || []).map((option) => ({
                ...option,
                selected: option.value === selectedValue
            }))
        ];
    }

    get googleExportModalCalendarOptions() {
        return (this.googleSyncCalendarDefinitions || []).map((definition) => ({
            label: definition.name,
            value: definition.id
        }));
    }

    get googleExportModalSelectOptions() {
        const selectedValue = this.resolvedGoogleExportModalCalendarId;

        return [
            {
                label: 'Select a Team Calendar',
                value: '',
                selected: !selectedValue
            },
            ...(this.googleExportModalCalendarOptions || []).map((option) => ({
                ...option,
                selected: option.value === selectedValue
            }))
        ];
    }

    get googleExportSelectOptions() {
        const selectedValue = this.selectedGoogleCalendarId || '';

        return (this.googleCalendarOptions || []).map((option) => ({
            ...option,
            selected: (option.value || '') === selectedValue
        }));
    }

    get googleSyncCalendarDefinitions() {
        return (this.calendarDefinitions || []).filter(
            (definition) => definition && !this.isCalendarViewDefinition(definition)
        );
    }

    get resolvedGoogleImportModalCalendarId() {
        if (this.googleImportModalCalendarId && this.isGoogleSyncCalendarId(this.googleImportModalCalendarId)) {
            return this.googleImportModalCalendarId;
        }

        if (this.isGoogleSyncCalendarId(this.selectedCalendarId)) {
            return this.selectedCalendarId;
        }

        return '';
    }

    get resolvedGoogleExportModalCalendarId() {
        if (this.googleExportModalCalendarId && this.isGoogleSyncCalendarId(this.googleExportModalCalendarId)) {
            return this.googleExportModalCalendarId;
        }

        if (this.isGoogleSyncCalendarId(this.selectedCalendarId)) {
            return this.selectedCalendarId;
        }

        return '';
    }

    get isGoogleImportModalCalendarSelected() {
        return Boolean(this.resolvedGoogleImportModalCalendarId);
    }

    get isGoogleImportModalUsingCurrentCalendar() {
        return this.resolvedGoogleImportModalCalendarId === (this.selectedCalendarId || '');
    }

    get isGoogleExportModalCalendarSelected() {
        return Boolean(this.resolvedGoogleExportModalCalendarId);
    }

    get isGoogleExportModalUsingCurrentCalendar() {
        return this.resolvedGoogleExportModalCalendarId === (this.selectedCalendarId || '');
    }

    get isGoogleExportModalConnected() {
        return this.isGoogleExportModalUsingCurrentCalendar && this.googleConnection.connected === true;
    }

    get googleExportModalTitle() {
        if (!this.isGoogleExportModalCalendarSelected) {
            return 'Choose Salesforce Calendar';
        }

        return this.isGoogleExportModalConnected
            ? 'Choose Google Calendar'
            : 'Connect Google Calendar';
    }

    get isGoogleImportModalReadyForConnection() {
        return this.isGoogleImportModalCalendarSelected && this.isGoogleImportModalUsingCurrentCalendar;
    }

    get isGoogleImportModalConfigured() {
        return this.isGoogleImportModalReadyForConnection && this.googleConnection.configured === true;
    }

    get isGoogleImportModalConnected() {
        return this.googleConnection.connected === true;
    }

    get googleImportModalTitle() {
        if (!this.isGoogleImportModalCalendarSelected) {
            return 'Choose Salesforce Calendar';
        }

        if (!this.isGoogleImportModalConfigured) {
            return 'Choose Salesforce Calendar';
        }

        return this.isGoogleImportModalConnected
            ? 'Choose Google Calendars'
            : 'Connect Google Calendar';
    }

    get googleImportModalCalendarHelpText() {
        if (!this.googleImportModalCalendarOptions.length) {
            return 'No Team Calendars are available for Google sync.';
        }

        if (!this.isGoogleImportModalCalendarSelected) {
            return 'Choose which Salesforce Team Calendar should receive imported Google events.';
        }

        if (!this.isGoogleImportModalUsingCurrentCalendar) {
            return 'Continue to load Google connection settings for the selected Salesforce Team Calendar.';
        }

        if (!this.googleConnection.configured) {
            return 'Google connection settings are unavailable right now.';
        }

        return 'Continue to connect Google and choose the Google calendars to import.';
    }

    isGoogleSyncCalendarId(calendarId) {
        if (!calendarId) {
            return false;
        }

        return this.googleSyncCalendarDefinitions.some((definition) => definition.id === calendarId);
    }

    get showGoogleDisconnect() {
        if (this.isCalendarViewBackedSelection) {
            return false;
        }

        return this.selectedCalendarId && this.googleConnection.connected;
    }

    get selectedGoogleCalendarId() {
        return this.googleConnection?.googleCalendarId || '';
    }

    get selectedGoogleImportCalendarIds() {
        const rawIds = this.googleConnection?.googleImportCalendarIds;
        return Array.isArray(rawIds) ? rawIds : [];
    }

    get showGoogleCalendarPicker() {
        return !this.isCalendarViewBackedSelection && this.googleConnection.configured;
    }

    get googleCalendarSelectionDisabled() {
        return this.isGoogleBusy || !this.isGoogleExportModalUsingCurrentCalendar || !this.googleConnection.connected;
    }

    get googleExportHelpText() {
        if (!this.isGoogleExportModalCalendarSelected) {
            return 'Choose which Salesforce Team Calendar should sync outward to Google.';
        }

        if (!this.isGoogleExportModalUsingCurrentCalendar) {
            return 'Continue to load Google connection settings for the selected Salesforce Team Calendar.';
        }

        if (!this.isGoogleExportModalConnected) {
            return 'Connect Google first, then choose which Google calendar to sync.';
        }

        if (this.googleCalendarOptions.length <= 1) {
            return 'No writable Google calendars were returned for this Google account.';
        }

        return 'Choose the single Google calendar that should receive Salesforce events.';
    }

    get googleImportCalendarOptions() {
        return (this.googleCalendarOptions || []).filter((option) => option.value);
    }

    get googleImportCalendarsDisabled() {
        return this.isGoogleBusy || !this.selectedCalendarId || !this.googleConnection.connected;
    }

    get googleImportHelpText() {
        if (this.isCalendarViewBackedSelection) {
            return 'Google import is only available for Team Calendar records.';
        }

        if (!this.googleConnection.configured) {
            return 'Google connection settings are unavailable right now.';
        }

        if (!this.googleConnection.connected) {
            return 'Connect Google first, then choose one or more Google calendars to import.';
        }

        if (this.googleImportCalendarOptions.length === 0) {
            return 'No writable Google calendars were returned for this Google account.';
        }

        return 'Choose which Google calendars should feed back into this Salesforce Team Calendar.';
    }

    get selectedUsersDetailed() {
        const optionMap = new Map(
            (this.activeUserOptions || []).map((option) => [option.id, option])
        );

        return (this.selectedUserIds || []).map((userId) => {
            const userOption = optionMap.get(userId) || {
                id: userId,
                label: 'Unknown User'
            };

            const calendarOptions = (this.userCalendarsByUser[userId] || []).map((calendar) => {
                const selectedIds = new Set(this.selectedCalendarsByUser[userId] || []);
                return {
                    ...calendar,
                    checked: selectedIds.has(calendar.id)
                };
            });

            const selectedCalendarIds = this.selectedCalendarsByUser[userId] || [];
            const selectedCalendarSummary =
                selectedCalendarIds.length > 0
                    ? `${selectedCalendarIds.length} calendar${selectedCalendarIds.length === 1 ? '' : 's'}`
                    : 'All calendars';

            return {
                id: userId,
                label: userOption.label,
                chipClass:
                    this.activeUserCalendarUserId === userId
                        ? 'user-chip user-chip--active'
                        : 'user-chip',
                selectedCalendarIds,
                selectedCalendarSummary,
                hasCalendarOptions: calendarOptions.length > 0,
                calendarOptions,
                calendarHelperText:
                    calendarOptions.length > 0
                        ? 'Check one or more calendars for this user.'
                        : 'No calendars found for this user yet.'
            };
        });
    }

    get activeUserCalendarMenu() {
        return this.selectedUsersDetailed.find(
            (user) => user.id === this.activeUserCalendarUserId
        ) || null;
    }

    get calendarViewLoaderDefinitions() {
        const primarySelectedDefinitionId = this.selectedCalendarDefinition?.id || null;

        return this.buildCalendarViewDefinitionsToLoad()
            .filter((definition) => definition?.id && definition.id !== primarySelectedDefinitionId)
            .map((definition) => ({
                ...definition,
                optionalFieldsCsv: this.buildCalendarViewOptionalFields(definition).join(',')
            }));
    }

    get userCalendarSelectionJson() {
        if (!this.selectedUserIds.length) {
            return null;
        }

        const payload = {};
        this.selectedUserIds.forEach((userId) => {
            const selectedIds = new Set(this.selectedCalendarsByUser[userId] || []);
            const optionMap = new Map(
                (this.userCalendarsByUser[userId] || []).map((calendar) => [calendar.id, calendar.label])
            );

            payload[userId] = [...selectedIds]
                .map((calendarId) => optionMap.get(calendarId))
                .filter(Boolean);
        });

        return JSON.stringify(payload);
    }

    @wire(getListRecordsByName, {
        objectApiName: '$calendarViewWireObjectApiName',
        listViewApiName: '$calendarViewWireApiName',
        optionalFields: '$calendarViewWireOptionalFields',
        pageSize: '$calendarViewPageSize'
    })
    wiredCalendarViewRecords({ data, error }) {
        this.calendarViewWireData = data;
        this.calendarViewWireError = error;

        if (!this.isCalendarViewBackedSelection) {
            return;
        }

        if (error) {
            this.recordCalendarViewLoadError(this.selectedCalendarDefinition, error);
            this.loadEvents();
            return;
        }

        if (data) {
            this.clearCalendarViewLoadError(this.selectedCalendarDefinition?.id);
            this.loadEvents();
        }
    }

    normalizeCalendarDefinition(row) {
        if (!row) {
            return null;
        }

        return {
            id: row.id || row.Id || null,
            name: row.name || row.Name || '',
            color: this.normalizeCalendarColor(row.color || row.Color || '#0176d3'),
            ownerId: row.ownerId || row.OwnerId || null,
            assignedUserId:
                row.assignedUserId ||
                row.AssignedUserId ||
                row.ownerId ||
                row.OwnerId ||
                null,
            sourceScope: row.sourceScope || row.SourceScope || 'Global',
            isDisplayed:
                row.isDisplayed !== undefined
                    ? row.isDisplayed
                    : row.IsDisplayed !== undefined
                        ? row.IsDisplayed
                        : false,
            sobjectType:
                row.sobjectType ||
                row.SobjectType ||
                row.subjectType ||
                row.SubjectType ||
                null,
            startField: row.startField || row.StartField || null,
            endField: row.endField || row.EndField || null,
            displayField: row.displayField || row.DisplayField || null,
            listViewFilterId: row.listViewFilterId || row.ListViewFilterId || null,
            listViewApiName: row.listViewApiName || row.ListViewApiName || null,
            listViewObjectApiName:
                row.listViewObjectApiName || row.ListViewObjectApiName || null
        };
    }

    async loadCurrentUserLayoutPreference() {
        try {
            const preference = await getCurrentUserLayoutPreference();
            this.applyUserLayoutPreference(preference);
        } catch (error) {
            this.userLayoutPreference = createDefaultLayoutPreference();
            this.showToast(
                'Layout Preferences',
                this.extractErrorMessage(error),
                'warning'
            );
        }
    }

    applyUserLayoutPreference(preference, options = {}) {
        const normalized = normalizeLayoutPreference(preference);
        const shouldApplySelections = options.applySelections !== false;

        this.userLayoutPreference = normalized;

        if (!shouldApplySelections) {
            return;
        }

        this.currentView = normalized.defaultView;
        this.selectedStatus = normalized.defaultStatus || '';

        if (
            normalized.defaultCalendarViewId &&
            (this.calendarDefinitions || []).some(
                (row) => row.id === normalized.defaultCalendarViewId
            )
        ) {
            this.selectedCalendarId = normalized.defaultCalendarViewId;
        } else if (
            this.selectedCalendarId &&
            !(this.calendarDefinitions || []).some((row) => row.id === this.selectedCalendarId)
        ) {
            this.selectedCalendarId = '';
        }
    }

    handleToolbarLayoutChange(event) {
        const nextSettings = event.detail?.settings;
        if (!nextSettings) {
            return;
        }

        this.userLayoutPreference = normalizeLayoutPreference({
            ...this.userLayoutPreference,
            ...nextSettings
        });

        this.rebuildViewModels();
    }

    async handleUserLayoutPreferenceChanged(event) {
        const changedUserId = event.detail?.userId;
        if (changedUserId && changedUserId !== this.currentUserId) {
            return;
        }

        if (event.detail?.preference) {
            this.applyUserLayoutPreference(event.detail.preference);
        } else {
            await this.loadCurrentUserLayoutPreference();
        }

        await this.loadCalendars();
        await Promise.all([this.loadEvents(), this.loadGoogleConnectionState()]);
    }

    async handleSecurityRulesChanged() {
        await Promise.all([this.loadCalendars(), this.loadUserCalendars()]);
        await Promise.all([this.loadEvents(), this.loadGoogleConnectionState()]);
    }

    handleViewChange(event) {
        this.currentView = event.detail;
        this.loadEvents();
    }

    handleCalendarChange(event) {
        this.selectedCalendarId = event.detail;
        this.syncStatus = '';
        this.syncMessage = '';
        this.googleImportStatus = '';
        this.googleImportMessage = '';
        this.showGoogleConnectModal = false;
        this.showGoogleImportModal = false;
        this.showGoogleExportModal = false;
        this.calendarViewWireData = undefined;
        this.calendarViewWireError = undefined;
        this.googleCalendarOptions = [{ label: 'Select Google calendar', value: '' }];

        this.loadEvents();
        this.loadGoogleConnectionState();
    }

    async handleGoogleExportCalendarSelectionChange(event) {
        if (!this.selectedCalendarId) {
            return;
        }

        const googleCalendarId = event.detail?.value || event.target?.value || null;
        this.isGoogleBusy = true;

        try {
            const result = await saveCalendarSelection({
                calendarId: this.selectedCalendarId,
                googleCalendarId
            });

            this.syncStatus = result?.success ? 'Configured' : 'Error';
            this.syncMessage = result?.message || '';

            this.showToast(
                'Google Calendar',
                this.syncMessage || 'Google calendar selection saved.',
                result?.success ? 'success' : 'error'
            );
        } catch (error) {
            const message = this.extractErrorMessage(error);
            this.syncStatus = 'Error';
            this.syncMessage = message;
            this.showToast('Google Calendar Error', message, 'error');
        } finally {
            this.isGoogleBusy = false;
            await this.loadGoogleConnectionState();
        }
    }

    async handleGoogleImportCalendarSelectionChange(event) {
        if (!this.selectedCalendarId) {
            return;
        }

        const googleCalendarIds = Array.isArray(event.detail) ? event.detail : [];
        this.isGoogleBusy = true;

        try {
            const result = await saveImportCalendarSelections({
                calendarId: this.selectedCalendarId,
                googleCalendarIds
            });

            this.googleImportStatus = result?.success ? 'Configured' : 'Error';
            this.googleImportMessage = result?.message || '';

            this.showToast(
                'Google Import Calendars',
                this.googleImportMessage || 'Google import calendar selection saved.',
                result?.success ? 'success' : 'error'
            );
        } catch (error) {
            const message = this.extractErrorMessage(error);
            this.googleImportStatus = 'Error';
            this.googleImportMessage = message;
            this.showToast('Google Import Calendar Error', message, 'error');
        } finally {
            this.isGoogleBusy = false;
            await this.loadGoogleConnectionState();
        }
    }

    async handleGoogleConnectionRefresh() {
        this.syncStatus = '';
        this.syncMessage = '';
        this.googleImportStatus = '';
        this.googleImportMessage = '';
        await this.loadGoogleConnectionState();
    }

    handleGoogleImportModalClose() {
        this.showGoogleImportModal = false;
        this.googleImportModalCalendarId = this.isGoogleSyncCalendarId(this.selectedCalendarId)
            ? this.selectedCalendarId
            : '';
    }

    handleGoogleExportModalClose() {
        this.showGoogleExportModal = false;
        this.googleExportModalCalendarId = this.isGoogleSyncCalendarId(this.selectedCalendarId)
            ? this.selectedCalendarId
            : '';
    }


    handleGoogleImportModalCalendarChange(event) {
        this.googleImportModalCalendarId = event.detail?.value || event.target?.value || '';
    }

    handleGoogleExportModalCalendarChange(event) {
        this.googleExportModalCalendarId = event.detail?.value || event.target?.value || '';
    }

    async handleGoogleImportModalLaunch() {
        await this.startGoogleConnect();
    }

    async handleGoogleExportModalLaunch() {
        await this.startGoogleConnect();
    }

    async handleGoogleImportModalRefresh() {
        await this.handleGoogleConnectionRefresh();

        if (this.googleConnection.connected) {
            this.showToast('Google Connect', 'Google connection is ready.', 'success');
        }
    }

    async handleGoogleExportModalRefresh() {
        await this.handleGoogleConnectionRefresh();

        if (this.googleConnection.connected) {
            this.showToast('Google Connect', 'Google connection is ready.', 'success');
        }
    }

    async handleGoogleImportModalContinue() {
        if (!this.isGoogleImportModalCalendarSelected) {
            this.showToast(
                'Salesforce Calendar',
                'Choose which Salesforce Team Calendar should receive imported Google events.',
                'warning'
            );
            return;
        }

        if (!this.isGoogleImportModalUsingCurrentCalendar) {
            this.selectedCalendarId = this.resolvedGoogleImportModalCalendarId;
            this.syncStatus = '';
            this.syncMessage = '';
            this.googleImportStatus = '';
            this.googleImportMessage = '';
            this.calendarViewWireData = undefined;
            this.calendarViewWireError = undefined;
            this.googleCalendarOptions = [{ label: 'Select Google calendar', value: '' }];

            await Promise.all([this.loadEvents(), this.loadGoogleConnectionState()]);
            return;
        }

        if (!this.googleConnection.configured) {
            this.showToast(
                'Google Setup',
                'Google connection settings are unavailable right now.',
                'warning'
            );
            return;
        }

        if (!this.googleConnection.connected) {
            this.showToast(
                'Google Connect',
                'Complete the Google connection step first.',
                'warning'
            );
            return;
        }

        if (!this.selectedGoogleImportCalendarIds.length) {
            this.showToast(
                'Google Import',
                'Choose at least one Google calendar before importing into Salesforce.',
                'warning'
            );
            return;
        }

        this.showGoogleImportModal = false;
        await this.runGoogleImportSync();
    }

    async handleGoogleExportModalContinue() {
        if (!this.isGoogleExportModalCalendarSelected) {
            this.showToast(
                'Salesforce Calendar',
                'Choose which Salesforce Team Calendar should sync out to Google.',
                'warning'
            );
            return;
        }

        if (!this.isGoogleExportModalUsingCurrentCalendar) {
            this.selectedCalendarId = this.resolvedGoogleExportModalCalendarId;
            this.syncStatus = '';
            this.syncMessage = '';
            this.googleImportStatus = '';
            this.googleImportMessage = '';
            this.calendarViewWireData = undefined;
            this.calendarViewWireError = undefined;
            this.googleCalendarOptions = [{ label: 'Select Google calendar', value: '' }];

            await Promise.all([this.loadEvents(), this.loadGoogleConnectionState()]);
            return;
        }

        if (!this.googleConnection.connected) {
            this.showToast(
                'Google Connect',
                'Complete the Google connection step first.',
                'warning'
            );
            return;
        }

        if (!this.googleConnection.googleCalendarId) {
            this.showToast(
                'Google Calendar',
                'Choose which Google calendar should receive Salesforce events.',
                'warning'
            );
            return;
        }

        this.showGoogleExportModal = false;
        await this.runGoogleSync();
    }

    handleGoogleConnectRequest() {
        if (!this.selectedCalendarId) {
            this.showToast('Google', 'Select a calendar first.', 'error');
            return;
        }

        if (this.isCalendarViewBackedSelection) {
            this.showToast(
                'Calendar View',
                'Google Sync only applies to Team Calendar event calendars, not Salesforce CalendarView list views.',
                'info'
            );
            return;
        }

        if (!this.googleConnection.configured) {
            this.showToast(
                'Google Setup',
                'Google connection settings are unavailable right now.',
                'warning'
            );
            return;
        }

        this.showGoogleConnectModal = true;
    }

    handleGoogleConnectModalClose() {
        this.showGoogleConnectModal = false;
    }

    async handleGoogleConnectModalLaunch() {
        await this.startGoogleConnect();
    }

    async handleGoogleConnectModalRefresh() {
        await this.handleGoogleConnectionRefresh();

        if (this.googleConnection.connected) {
            this.showGoogleConnectModal = false;
            this.showToast('Google Connect', 'Google connection is ready.', 'success');
        }
    }

    handleStatusChange(event) {
        this.selectedStatus = event.detail;
        this.loadEvents();
    }

    async handleUserSelectionChange(event) {
        const nextIds = (event.detail?.selectedUserIds || []).slice(0, this.maxSelectedUsers);
        this.selectedUserIds = nextIds;

        if (!this.selectedUserIds.length) {
            this.userCalendarsByUser = {};
            this.selectedCalendarsByUser = {};
            this.activeUserCalendarUserId = null;
            await this.loadEvents();
            return;
        }

        this.pruneUserCalendarState();
        await this.loadUserCalendars();
        await this.loadEvents();
    }

    async handleUserCalendarOpen(event) {
        const userId = event.detail?.userId;
        if (!userId) {
            return;
        }

        if (this.activeUserCalendarUserId === userId) {
            this.activeUserCalendarUserId = null;
            return;
        }

        this.activeUserCalendarUserId = userId;

        if (!this.userCalendarsByUser[userId]) {
            await this.loadUserCalendars();
        }
    }

    handleUserCalendarMenuClose() {
        this.activeUserCalendarUserId = null;
    }

    async handleUserCalendarSelectionChange(event) {
        const userId = event.detail?.userId;
        const selectedCalendarIds = event.detail?.selectedCalendarIds || [];

        if (!userId) {
            return;
        }

        this.selectedCalendarsByUser = {
            ...this.selectedCalendarsByUser,
            [userId]: selectedCalendarIds
        };

        await this.loadEvents();
    }

    handleToday() {
        this.currentDate = new Date();
        this.loadEvents();
    }

    async handleRefresh() {
        await this.loadCurrentUserLayoutPreference();
        await Promise.all([
            this.loadActiveUsers(),
            this.loadUserCalendars(),
            this.loadEvents(),
            this.loadGoogleConnectionState()
        ]);
    }

    handleGeneratePdf() {
        if (this.isLoading) {
            this.showToast('Generate PDF', 'Wait for the calendar to finish loading.', 'warning');
            return;
        }

        try {
            this.submitPdfExportForm();
        } catch (error) {
            this.showToast('Generate PDF', this.extractErrorMessage(error), 'error');
        }
    }

    handlePrev() {
        const nextDate = new Date(this.currentDate);

        if (this.currentView === 'week') {
            nextDate.setDate(nextDate.getDate() - 7);
        } else {
            nextDate.setMonth(nextDate.getMonth() - 1);
        }

        this.currentDate = nextDate;
        this.loadEvents();
    }

    handleNext() {
        const nextDate = new Date(this.currentDate);

        if (this.currentView === 'week') {
            nextDate.setDate(nextDate.getDate() + 7);
        } else {
            nextDate.setMonth(nextDate.getMonth() + 1);
        }

        this.currentDate = nextDate;
        this.loadEvents();
    }

    submitPdfExportForm() {
        const host = this.template.querySelector('[data-export-form-host]');
        if (!host) {
            throw new Error('PDF export form host is unavailable.');
        }

        while (host.firstChild) {
            host.removeChild(host.firstChild);
        }

        const exportForm = this.ownerDocument.createElement('form');
        exportForm.action = this.pdfExportPageUrl || '/apex/TeamCalendarPdfExport';
        exportForm.method = 'post';
        exportForm.target = '_blank';
        exportForm.style.display = 'none';

        const fieldValues = {
            view: this.currentView,
            currentDate: this.formatDateParam(this.currentDate),
            documentTitle: `Team Calendar - ${this.rangeLabel}`,
            rangeLabel: this.rangeLabel,
            calendarId: this.selectedCalendarId || '',
            calendarLabel: this.getSelectedCalendarLabel(),
            statusFilter: this.selectedStatus || '',
            statusLabel: this.getSelectedStatusLabel(),
            selectedUserLabelText: this.getSelectedUserLabelText(),
            showWeekends: String(this.showWeekends)
        };

        Object.entries(fieldValues).forEach(([name, value]) => {
            const input = this.ownerDocument.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = value ?? '';
            exportForm.appendChild(input);
        });

        const eventsField = this.ownerDocument.createElement('textarea');
        eventsField.name = 'eventsJson';
        eventsField.value = JSON.stringify(this.events || []);
        exportForm.appendChild(eventsField);

        host.appendChild(exportForm);
        exportForm.submit();
    }

    formatDateParam(dateValue) {
        if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
            return '';
        }

        const yearValue = dateValue.getFullYear();
        const monthValue = String(dateValue.getMonth() + 1).padStart(2, '0');
        const dayValue = String(dateValue.getDate()).padStart(2, '0');

        return `${yearValue}-${monthValue}-${dayValue}`;
    }

    getSelectedCalendarLabel() {
        if (!this.selectedCalendarId) {
            return 'All Calendars';
        }

        return this.selectedCalendarDefinition?.name || 'Selected Calendar';
    }

    getSelectedStatusLabel() {
        if (!this.selectedStatus) {
            return 'All Statuses';
        }

        const matched = (this.statusOptions || []).find(
            (option) => option.value === this.selectedStatus
        );

        return matched?.label || this.selectedStatus;
    }

    getSelectedUserLabelText() {
        const labels = this.selectedUsersDetailed.map((user) => user.label).filter(Boolean);
        return labels.length ? labels.join(', ') : 'None';
    }

    handleHeaderNewEvent() {
        this.defaultStart = null;
        this.defaultEnd = null;
        this.showCreateModal = true;
    }

    handleDaySelect(event) {
        const selectedDate = event.detail?.dateKey;
        this.defaultStart = selectedDate;
        this.defaultEnd = selectedDate;
        this.showCreateModal = true;
    }

    handleEventOpen(event) {
        this.selectedRecordId = event.detail?.recordId || null;
        this.showDrawer = Boolean(this.selectedRecordId);
    }

    handleCloseModal() {
        this.showCreateModal = false;
    }

    async handleCreateSuccess() {
        this.showCreateModal = false;
        await this.loadEvents();
    }

    handleCreateError(event) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Create Event Error',
                message: this.extractErrorMessage(event?.detail) || 'Unable to create the event.',
                variant: 'error'
            })
        );
    }

    async handleCloseDrawer() {
        this.showDrawer = false;
        this.selectedRecordId = null;
        await this.loadEvents();
    }

    async loadGoogleConnectionState() {
        if (!this.selectedCalendarId || this.isCalendarViewBackedSelection) {
            this.googleConnection = createDefaultGoogleConnection();
            this.googleCalendarOptions = [{ label: 'Select Google calendar', value: '' }];
            return;
        }

        try {
            const state = await getConnectionState({ calendarId: this.selectedCalendarId });
            this.googleConnection = createDefaultGoogleConnection(state || {});
            await this.loadGoogleCalendarOptions();
        } catch (error) {
            this.googleConnection = createDefaultGoogleConnection({
                status: 'Error',
                message: this.extractErrorMessage(error)
            });
            this.googleCalendarOptions = [{ label: 'Select Google calendar', value: '' }];
        }
    }

    async loadGoogleCalendarOptions() {
        if (
            !this.selectedCalendarId ||
            this.isCalendarViewBackedSelection ||
            !this.googleConnection.configured ||
            !this.googleConnection.connected
        ) {
            this.googleCalendarOptions = [{ label: 'Select Google calendar', value: '' }];
            return;
        }

        try {
            const rows = await listAvailableCalendars({ calendarId: this.selectedCalendarId });
            this.googleCalendarOptions = [
                { label: 'Select Google calendar', value: '' },
                ...(Array.isArray(rows) ? rows : []).map((row) => ({
                    label: row.primary ? `${row.label} (Primary)` : row.label,
                    value: row.id
                }))
            ];
        } catch (error) {
            this.googleCalendarOptions = [{ label: 'Select Google calendar', value: '' }];
            this.googleImportStatus = 'Error';
            this.googleImportMessage = this.extractErrorMessage(error);
        }
    }

    async handleGoogleImportAction() {
        if (this.isCalendarViewBackedSelection) {
            this.googleImportModalCalendarId = '';
        } else {
            this.googleImportModalCalendarId = this.isGoogleSyncCalendarId(this.selectedCalendarId)
                ? this.selectedCalendarId
                : '';
        }

        this.showGoogleImportModal = true;
    }

    async handleGoogleExportAction() {
        this.googleExportModalCalendarId = this.isGoogleSyncCalendarId(this.selectedCalendarId)
            ? this.selectedCalendarId
            : '';
        this.showGoogleExportModal = true;
    }

    async handleGoogleDisconnect() {
        if (!this.selectedCalendarId) {
            return;
        }

        this.isGoogleBusy = true;

        try {
            const result = await disconnectGoogle({ calendarId: this.selectedCalendarId });

            this.syncStatus = result?.success ? 'Disconnected' : 'Error';
            this.syncMessage = result?.message || '';
            this.googleImportStatus = this.syncStatus;
            this.googleImportMessage = this.syncMessage;

            this.showToast(
                'Google Disconnect',
                this.syncMessage || 'Google connection removed.',
                result?.success ? 'success' : 'error'
            );
        } catch (error) {
            const message = this.extractErrorMessage(error);
            this.syncStatus = 'Error';
            this.syncMessage = message;
            this.googleImportStatus = 'Error';
            this.googleImportMessage = message;
            this.showToast('Google Disconnect Error', message, 'error');
        } finally {
            this.isGoogleBusy = false;
            this.showGoogleConnectModal = false;
            this.showGoogleImportModal = false;
            this.showGoogleExportModal = false;
            await this.loadGoogleConnectionState();
        }
    }

    async startGoogleConnect() {
        this.isGoogleBusy = true;

        try {
            const result = await getAuthenticationUrl({ calendarId: this.selectedCalendarId });
            const authUrl = result?.authUrl;

            if (!authUrl) {
                throw new Error(result?.message || 'Google authentication URL was not returned.');
            }

            this.syncStatus = 'Authentication Required';
            this.syncMessage = 'Complete Google sign-in in the new tab, then click I Finished Connecting.';
            this.googleImportStatus = 'Authentication Required';
            this.googleImportMessage = 'Complete Google sign-in in the new tab, then click I Finished Connecting.';

            const popup = window.open(authUrl, '_blank', 'noopener');

            if (!popup) {
                this.showToast(
                    'Google Connect',
                    'Popup blocked. Allow popups for Salesforce and try again.',
                    'warning'
                );
            } else {
                this.showToast(
                    'Google Connect',
                    'Complete Google sign-in in the new tab, then return here and click I Finished Connecting.',
                    'success'
                );
            }
        } catch (error) {
            const message = this.extractErrorMessage(error);
            this.syncStatus = 'Error';
            this.syncMessage = message;
            this.googleImportStatus = 'Error';
            this.googleImportMessage = message;
            this.showToast('Google Connect Error', message, 'error');
        } finally {
            this.isGoogleBusy = false;
        }
    }

    async runGoogleImportSync() {
        this.isGoogleBusy = true;

        try {
            const visibleRange = getVisibleRange(this.currentDate, this.currentView);
            const result = await importEventsFromGoogle({
                calendarId: this.selectedCalendarId,
                start: visibleRange?.start || null,
                endDate: visibleRange?.end || null
            });

            this.googleImportStatus = result?.success ? 'Imported' : 'Error';
            this.googleImportMessage = result?.message || '';

            this.showToast(
                'Google Import',
                this.googleImportMessage || 'Google events imported into Salesforce.',
                result?.success ? 'success' : 'warning'
            );

            await this.loadEvents();
        } catch (error) {
            const message = this.extractErrorMessage(error);
            this.googleImportStatus = 'Error';
            this.googleImportMessage = message;
            this.showToast('Google Import Error', message, 'error');
        } finally {
            this.isGoogleBusy = false;
            await this.loadGoogleConnectionState();
        }
    }

    async runGoogleSync() {
        this.isGoogleBusy = true;

        try {
            const result = await pushEventsForCalendar({
                calendarId: this.selectedCalendarId,
                start: null,
                endDate: null
            });

            this.syncStatus = result?.success ? 'Queued' : 'Error';
            this.syncMessage = result?.message || '';

            this.showToast(
                'Google Sync',
                this.syncMessage || 'Google sync job queued.',
                result?.success ? 'success' : 'warning'
            );
        } catch (error) {
            const message = this.extractErrorMessage(error);
            this.syncStatus = 'Error';
            this.syncMessage = message;
            this.showToast('Google Sync Error', message, 'error');
        } finally {
            this.isGoogleBusy = false;
            await this.loadGoogleConnectionState();
        }
    }

    async loadCalendars() {
        try {
            const rows = await getCalendars();

            this.calendarDefinitions = (Array.isArray(rows) ? rows : [])
                .map((row) => this.normalizeCalendarDefinition(row))
                .filter(Boolean);

            this.calendarOptions = [
                { label: 'All Calendars', value: '' },
                ...this.calendarDefinitions.map((row) => ({
                    label: row.name,
                    value: row.id
                }))
            ];

            this.applyUserLayoutPreference(this.userLayoutPreference);
        } catch (error) {
            this.error = this.extractErrorMessage(error);
        }
    }

    async loadActiveUsers() {
        try {
            const rows = await getActiveUsers();

            this.activeUserOptions = (Array.isArray(rows) ? rows : []).map((row) => ({
                id: row.id,
                label: row.label
            }));

            const activeUserIdSet = new Set(this.activeUserOptions.map((row) => row.id));
            this.selectedUserIds = (this.selectedUserIds || [])
                .filter((id) => activeUserIdSet.has(id))
                .slice(0, this.maxSelectedUsers);

            this.pruneUserCalendarState();
        } catch (error) {
            this.activeUserOptions = [];
            this.showToast('Active Users Load Error', this.extractErrorMessage(error), 'error');
        }
    }

    async loadUserCalendars() {
        if (!this.selectedUserIds.length) {
            this.userCalendarsByUser = {};
            this.selectedCalendarsByUser = {};
            this.activeUserCalendarUserId = null;
            this.calendarViewPayloadsById = {};
            this.calendarViewErrorsById = {};
            return;
        }

        try {
            const rows = await getUserCalendars({
                selectedUserIds: this.selectedUserIds
            });

            const grouped = {};
            (rows || []).forEach((row) => {
                const normalizedRow = this.normalizeCalendarDefinition(row);
                const assignedUserId = normalizedRow?.assignedUserId || normalizedRow?.ownerId;

                if (!assignedUserId) {
                    return;
                }

                if (!grouped[assignedUserId]) {
                    grouped[assignedUserId] = [];
                }

                grouped[assignedUserId].push({
                    id: normalizedRow.id,
                    label: normalizedRow.name,
                    color: normalizedRow.color,
                    sourceScope: normalizedRow.sourceScope || 'Shared',
                    sobjectType: normalizedRow.sobjectType,
                    startField: normalizedRow.startField,
                    endField: normalizedRow.endField,
                    displayField: normalizedRow.displayField,
                    listViewFilterId: normalizedRow.listViewFilterId,
                    listViewApiName: normalizedRow.listViewApiName,
                    listViewObjectApiName: normalizedRow.listViewObjectApiName
                });
            });

            this.userCalendarsByUser = grouped;
            this.pruneSelectedCalendarsToLoadedCalendars();
            this.pruneCalendarViewLoaderState();
        } catch (error) {
            this.userCalendarsByUser = {};
            this.selectedCalendarsByUser = {};
            this.calendarViewPayloadsById = {};
            this.calendarViewErrorsById = {};
            this.showToast('User Calendars Load Error', this.extractErrorMessage(error), 'error');
        }
    }

    handleCalendarViewPayloadLoad(event) {
        const definitionId = event.detail?.definitionId;
        const payload = event.detail?.payload;

        if (!definitionId || !payload) {
            return;
        }

        if (this.calendarViewPayloadsById[definitionId] === payload) {
            return;
        }

        this.calendarViewPayloadsById = {
            ...this.calendarViewPayloadsById,
            [definitionId]: payload
        };
        this.clearCalendarViewLoadError(definitionId);
        this.loadEvents();
    }

    handleCalendarViewPayloadError(event) {
        const definition = event.detail?.definition;
        const error = event.detail?.error;
        const definitionId = definition?.id;

        if (!definitionId) {
            return;
        }

        const nextPayloadsById = { ...this.calendarViewPayloadsById };
        delete nextPayloadsById[definitionId];
        this.calendarViewPayloadsById = nextPayloadsById;

        this.recordCalendarViewLoadError(definition, error);
        this.loadEvents();
    }

    isCalendarViewDefinition(definition) {
        return Boolean(
            definition &&
            definition.listViewFilterId &&
            definition.sobjectType &&
            definition.startField &&
            definition.listViewApiName &&
            (definition.listViewObjectApiName || definition.sobjectType)
        );
    }

    buildCalendarViewDefinitionsToLoad() {
        const definitionsById = new Map();

        if (this.isCalendarViewBackedSelection && this.selectedCalendarDefinition) {
            definitionsById.set(this.selectedCalendarDefinition.id, this.selectedCalendarDefinition);
        }

        (this.selectedUserIds || []).forEach((userId) => {
            const availableCalendars = this.userCalendarsByUser[userId] || [];
            const selectedCalendarIds = this.selectedCalendarsByUser[userId] || [];
            const effectiveIds = new Set(
                selectedCalendarIds.length
                    ? selectedCalendarIds
                    : availableCalendars.map((calendar) => calendar.id)
            );

            availableCalendars.forEach((calendar) => {
                if (!effectiveIds.has(calendar.id)) {
                    return;
                }

                const normalizedDefinition = this.normalizeCalendarDefinition({
                    id: calendar.id,
                    name: calendar.label,
                    color: calendar.color,
                    assignedUserId: userId,
                    sourceScope: calendar.sourceScope,
                    sobjectType: calendar.sobjectType,
                    startField: calendar.startField,
                    endField: calendar.endField,
                    displayField: calendar.displayField,
                    listViewFilterId: calendar.listViewFilterId,
                    listViewApiName: calendar.listViewApiName,
                    listViewObjectApiName: calendar.listViewObjectApiName
                });

                if (!this.isCalendarViewDefinition(normalizedDefinition)) {
                    return;
                }

                if (!definitionsById.has(normalizedDefinition.id)) {
                    definitionsById.set(normalizedDefinition.id, normalizedDefinition);
                }
            });
        });

        return Array.from(definitionsById.values());
    }

    loadCalendarViewEventsForDefinitions(definitions, visibleRange) {
        if (!Array.isArray(definitions) || !definitions.length) {
            return [];
        }

        const startBoundary = new Date(`${visibleRange.startDate}T00:00:00`);
        const endBoundaryExclusive = new Date(`${visibleRange.endDate}T00:00:00`);
        endBoundaryExclusive.setDate(endBoundaryExclusive.getDate() + 1);

        const merged = [];

        definitions.forEach((definition) => {
            const isPrimarySelectedDefinition =
                this.selectedCalendarDefinition &&
                definition.id === this.selectedCalendarDefinition.id;

            const hasError = isPrimarySelectedDefinition
                ? Boolean(this.calendarViewWireError)
                : Boolean(this.calendarViewErrorsById[definition.id]);

            if (hasError) {
                return;
            }

            const payload = isPrimarySelectedDefinition
                ? this.calendarViewWireData
                : this.calendarViewPayloadsById[definition.id];

            if (!payload) {
                return;
            }

            const rawRecords = this.extractListRecords(payload);

            merged.push(
                ...(rawRecords || [])
                    .map((record) =>
                        this.mapCalendarViewRecord(
                            record,
                            definition,
                            startBoundary,
                            endBoundaryExclusive
                        )
                    )
                    .filter(Boolean)
                    .map((row) => this.normalizeEvent(row))
            );
        });

        return this.dedupeNormalizedEvents(merged);
    }

    buildCalendarViewOptionalFields(definition) {
        const objectApiName = definition?.listViewObjectApiName || definition?.sobjectType;

        if (!objectApiName) {
            return [];
        }

        const fieldNames = [
            definition.startField,
            definition.endField,
            definition.displayField,
            'OwnerId',
            'Name'
        ].filter(Boolean);

        return [...new Set(fieldNames.map((fieldName) => `${objectApiName}.${fieldName}`))];
    }

    dedupeNormalizedEvents(events) {
        const rowsByKey = new Map();

        (events || []).forEach((row) => {
            const key =
                `${row.calendarId || 'none'}::` +
                `${row.id || row.externalEventId || row.name || 'row'}`;

            if (!rowsByKey.has(key)) {
                rowsByKey.set(key, row);
            }
        });

        return Array.from(rowsByKey.values()).sort((left, right) => {
            const leftTime = this.toTime(left.start);
            const rightTime = this.toTime(right.start);

            if (leftTime !== rightTime) {
                return leftTime - rightTime;
            }

            return String(left.name || '').localeCompare(String(right.name || ''));
        });
    }

    async loadEvents() {
        const loadId = ++this.loadSequence;
        this.isLoading = true;

        try {
            const visibleRange = getVisibleRange(this.currentDate, this.currentView);
            let nextEvents = [];

            if (!this.isCalendarViewBackedSelection) {
                const rows = await getEventsForRange({
                    startDate: visibleRange.startDate,
                    endDate: visibleRange.endDate,
                    calendarId: this.selectedCalendarId || null,
                    statusFilter: this.selectedStatus || null,
                    selectedUserIds: this.selectedUserIds.length ? this.selectedUserIds : null,
                    userCalendarSelectionJson: this.userCalendarSelectionJson
                });

                if (loadId !== this.loadSequence) {
                    return;
                }

                nextEvents = (rows || []).map((row) => this.normalizeEvent(row));
            }

            const calendarViewDefinitions = this.buildCalendarViewDefinitionsToLoad();
            this.pruneCalendarViewLoaderState(calendarViewDefinitions);

            if (calendarViewDefinitions.length) {
                const calendarViewEvents = this.loadCalendarViewEventsForDefinitions(
                    calendarViewDefinitions,
                    visibleRange
                );

                if (loadId !== this.loadSequence) {
                    return;
                }

                nextEvents = this.dedupeNormalizedEvents([
                    ...nextEvents,
                    ...calendarViewEvents
                ]);
            } else {
                nextEvents = this.dedupeNormalizedEvents(nextEvents);
            }

            if (loadId !== this.loadSequence) {
                return;
            }

            this.events = nextEvents;
            this.rebuildViewModels();
            this.error = undefined;
        } catch (error) {
            if (loadId === this.loadSequence) {
                this.events = [];
                this.weeks = [];
                this.agendaGroups = [];
                this.teamLoadRows = [];
                this.conflictRows = [];
                this.error = this.extractErrorMessage(error);

                // eslint-disable-next-line no-console
                console.error('Team Calendar loadEvents failed', {
                    selectedCalendarId: this.selectedCalendarId,
                    selectedCalendarDefinition: this.selectedCalendarDefinition,
                    selectedUserIds: this.selectedUserIds,
                    selectedCalendarsByUser: this.selectedCalendarsByUser,
                    userCalendarsByUser: this.userCalendarsByUser,
                    calendarViewDefinitions: this.buildCalendarViewDefinitionsToLoad(),
                    error
                });

                this.showToast('Calendar Load Error', this.error, 'error');
            }
        } finally {
            if (loadId === this.loadSequence) {
                this.isLoading = false;
            }
        }
    }

    applyCalendarViewData(payload) {
        const visibleRange = getVisibleRange(this.currentDate, this.currentView);
        const rawRecords = this.extractListRecords(payload);

        const startBoundary = new Date(`${visibleRange.startDate}T00:00:00`);
        const endBoundaryExclusive = new Date(`${visibleRange.endDate}T00:00:00`);
        endBoundaryExclusive.setDate(endBoundaryExclusive.getDate() + 1);

        this.events = (rawRecords || [])
            .map((record) =>
                this.mapCalendarViewRecord(
                    record,
                    this.selectedCalendarDefinition,
                    startBoundary,
                    endBoundaryExclusive
                )
            )
            .filter(Boolean)
            .map((row) => this.normalizeEvent(row));

        this.rebuildViewModels();
        this.error = undefined;
        this.isLoading = false;
    }

    extractListRecords(payload) {
        if (Array.isArray(payload?.records)) {
            return payload.records;
        }

        if (Array.isArray(payload?.records?.records)) {
            return payload.records.records;
        }

        if (Array.isArray(payload?.items)) {
            return payload.items;
        }

        if (Array.isArray(payload?.records?.items)) {
            return payload.records.items;
        }

        return [];
    }

    mapCalendarViewRecord(record, calendarDefinition, startBoundary, endBoundaryExclusive) {
        const startRaw = this.getUiFieldValue(record, calendarDefinition.startField);
        if (!startRaw) {
            return null;
        }

        const startValue = this.toUiDateTimeValue(startRaw);
        if (!startValue || Number.isNaN(startValue.getTime())) {
            return null;
        }

        const endRaw = calendarDefinition.endField
            ? this.getUiFieldValue(record, calendarDefinition.endField)
            : null;
        const endValue = endRaw ? this.toUiDateTimeValue(endRaw) : null;

        if (startValue >= endBoundaryExclusive) {
            return null;
        }

        if (endValue && endValue < startBoundary) {
            return null;
        }

        if (!endValue && startValue < startBoundary) {
            return null;
        }

        const titleField = calendarDefinition.displayField || 'Name';

        const preferredDisplayValue = this.getUiFieldDisplayValue(record, titleField);
        const preferredRawValue = this.getUiFieldValue(record, titleField);

        const fallbackNameDisplay = this.getUiFieldDisplayValue(record, 'Name');
        const fallbackNameValue = this.getUiFieldValue(record, 'Name');

        const titleValue =
            preferredDisplayValue ||
            (
                preferredRawValue &&
                !/^[a-zA-Z0-9]{15,18}$/.test(String(preferredRawValue))
                    ? preferredRawValue
                    : null
            ) ||
            fallbackNameDisplay ||
            fallbackNameValue ||
            'Untitled';

        const isDateOnlyStart = /^\d{4}-\d{2}-\d{2}$/.test(String(startRaw));

        return {
            id: record.id,
            name: String(titleValue),
            ownerId: this.getUiFieldValue(record, 'OwnerId'),
            ownerName: this.getUiFieldDisplayValue(record, 'OwnerId'),
            start: this.formatUiDateForBoard(startRaw),
            endDateTime: endRaw ? this.formatUiDateForBoard(endRaw) : null,
            allDay: Boolean(isDateOnlyStart && !calendarDefinition.endField),
            status: 'Calendar View',
            notes: `${calendarDefinition.name} • ${calendarDefinition.sobjectType}`,
            calendarId: calendarDefinition.id,
            calendarName: calendarDefinition.name,
            calendarColor: calendarDefinition.color || '#0176d3',
            externalEventId: null,
            syncStatus: null,
            syncError: null,
            lastSyncedAt: null
        };
    }

    getUiFieldValue(record, fieldApiName) {
        return record?.fields?.[fieldApiName]?.value ?? null;
    }

    getUiFieldDisplayValue(record, fieldApiName) {
        return record?.fields?.[fieldApiName]?.displayValue ?? null;
    }

    toUiDateTimeValue(rawValue) {
        if (!rawValue) {
            return null;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawValue))) {
            return new Date(`${rawValue}T00:00:00`);
        }

        return new Date(rawValue);
    }

    formatUiDateForBoard(rawValue) {
        if (!rawValue) {
            return null;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawValue))) {
            return `${rawValue}T00:00:00`;
        }

        return rawValue;
    }

    rebuildViewModels() {
        this.weeks = [];
        this.agendaGroups = [];
        this.teamLoadRows = [];
        this.conflictRows = [];

        if (this.isAgendaView) {
            this.agendaGroups = buildAgendaGroups(this.events);
            return;
        }

        if (this.isTeamLoadView) {
            this.teamLoadRows = this.buildTeamLoadRows(this.events);
            return;
        }

        if (this.isConflictsView) {
            this.conflictRows = this.buildConflictRows(this.events);
            return;
        }

        this.weeks = buildCalendarWeeks(this.currentDate, this.currentView, this.events);

        if (!this.showWeekends) {
            this.weeks = (this.weeks || []).map((week) => {
                if (!Array.isArray(week?.days)) {
                    return week;
                }

                return {
                    ...week,
                    days: week.days.filter((day) => !this.isWeekendDay(day))
                };
            });
        }
    }

    buildTeamLoadRows(events) {
        const buckets = new Map();

        events.forEach((eventRecord) => {
            const key = eventRecord.calendarId || 'unassigned';

            if (!buckets.has(key)) {
                buckets.set(key, {
                    key,
                    calendarName: eventRecord.calendarName || 'Unassigned',
                    total: 0,
                    planned: 0,
                    confirmed: 0,
                    cancelled: 0,
                    allDay: 0,
                    timed: 0,
                    rawColor: eventRecord.calendarColor || '#dddbda'
                });
            }

            const row = buckets.get(key);
            row.total += 1;

            if (eventRecord.allDay) {
                row.allDay += 1;
            } else {
                row.timed += 1;
            }

            const normalizedStatus = (eventRecord.status || '').toLowerCase();
            if (normalizedStatus === 'planned') row.planned += 1;
            if (normalizedStatus === 'confirmed') row.confirmed += 1;
            if (normalizedStatus === 'cancelled') row.cancelled += 1;
        });

        return Array.from(buckets.values())
            .sort((left, right) => {
                if (right.total !== left.total) {
                    return right.total - left.total;
                }

                return left.calendarName.localeCompare(right.calendarName);
            })
            .map((row) => ({
                ...row,
                colorStyle: `display:inline-block;width:0.75rem;height:0.75rem;border-radius:999px;background:${row.rawColor};`
            }));
    }

    buildConflictRows(events) {
        const groupedByCalendar = new Map();

        events.forEach((eventRecord) => {
            const calendarKey = eventRecord.calendarId || 'unassigned';
            if (!groupedByCalendar.has(calendarKey)) {
                groupedByCalendar.set(calendarKey, []);
            }
            groupedByCalendar.get(calendarKey).push(eventRecord);
        });

        const conflicts = [];

        groupedByCalendar.forEach((calendarEvents) => {
            const sorted = [...calendarEvents].sort(
                (left, right) => this.toTime(left.start) - this.toTime(right.start)
            );

            for (let index = 0; index < sorted.length; index += 1) {
                const current = sorted[index];
                const currentEnd = this.toTime(current.endDateTime || current.start);

                for (let compareIndex = index + 1; compareIndex < sorted.length; compareIndex += 1) {
                    const candidate = sorted[compareIndex];
                    const candidateStart = this.toTime(candidate.start);

                    if (candidateStart >= currentEnd) {
                        break;
                    }

                    conflicts.push({
                        key: `${current.id}-${candidate.id}`,
                        calendarName: current.calendarName || 'Unassigned',
                        firstTitle: current.name,
                        firstTime: this.formatEventStamp(current),
                        secondTitle: candidate.name,
                        secondTime: this.formatEventStamp(candidate)
                    });
                }
            }
        });

        return conflicts;
    }

    normalizeEvent(row) {
        return {
            ...row,
            start: row.start,
            endDateTime: row.endDateTime || row.end || null,
            calendarColor: this.normalizeCalendarColor(row.calendarColor)
        };
    }

    normalizeCalendarColor(rawColor) {
        if (!rawColor) {
            return '#0176d3';
        }

        const normalized = String(rawColor).trim();
        return normalized.startsWith('#') ? normalized : `#${normalized}`;
    }

    isWeekendDay(day) {
        const rawDate =
            day?.dateKey ||
            day?.isoDate ||
            day?.dateValue ||
            (day?.date instanceof Date ? day.date.toISOString().slice(0, 10) : null);

        if (!rawDate) {
            return false;
        }

        const candidate = new Date(`${rawDate}T00:00:00`);
        const dayIndex = candidate.getDay();
        return dayIndex === 0 || dayIndex === 6;
    }

    pruneUserCalendarState() {
        const selectedIdSet = new Set(this.selectedUserIds || []);

        const nextLoaded = {};
        Object.keys(this.userCalendarsByUser || {}).forEach((userId) => {
            if (selectedIdSet.has(userId)) {
                nextLoaded[userId] = this.userCalendarsByUser[userId];
            }
        });
        this.userCalendarsByUser = nextLoaded;

        const nextSelectedCalendars = {};
        Object.keys(this.selectedCalendarsByUser || {}).forEach((userId) => {
            if (selectedIdSet.has(userId)) {
                nextSelectedCalendars[userId] = this.selectedCalendarsByUser[userId];
            }
        });
        this.selectedCalendarsByUser = nextSelectedCalendars;

        if (
            this.activeUserCalendarUserId &&
            !selectedIdSet.has(this.activeUserCalendarUserId)
        ) {
            this.activeUserCalendarUserId = null;
        }
    }

    pruneSelectedCalendarsToLoadedCalendars() {
        const nextSelections = {};

        (this.selectedUserIds || []).forEach((userId) => {
            const validCalendarIds = new Set(
                (this.userCalendarsByUser[userId] || []).map((calendar) => calendar.id)
            );

            const retained = (this.selectedCalendarsByUser[userId] || []).filter((calendarId) =>
                validCalendarIds.has(calendarId)
            );

            nextSelections[userId] = retained;
        });

        this.selectedCalendarsByUser = nextSelections;
    }

    pruneCalendarViewLoaderState(definitions = this.buildCalendarViewDefinitionsToLoad()) {
        const validDefinitionIds = new Set((definitions || []).map((definition) => definition.id));

        const nextPayloadsById = {};
        Object.keys(this.calendarViewPayloadsById || {}).forEach((definitionId) => {
            if (validDefinitionIds.has(definitionId)) {
                nextPayloadsById[definitionId] = this.calendarViewPayloadsById[definitionId];
            }
        });
        this.calendarViewPayloadsById = nextPayloadsById;

        const nextErrorsById = {};
        Object.keys(this.calendarViewErrorsById || {}).forEach((definitionId) => {
            if (validDefinitionIds.has(definitionId)) {
                nextErrorsById[definitionId] = this.calendarViewErrorsById[definitionId];
            }
        });
        this.calendarViewErrorsById = nextErrorsById;
    }

    clearCalendarViewLoadError(definitionId) {
        if (!definitionId || !this.calendarViewErrorsById[definitionId]) {
            return;
        }

        const nextErrorsById = { ...this.calendarViewErrorsById };
        delete nextErrorsById[definitionId];
        this.calendarViewErrorsById = nextErrorsById;
    }

    recordCalendarViewLoadError(definition, error) {
        const definitionId = definition?.id;
        if (!definitionId) {
            return;
        }

        const message = this.extractErrorMessage(error);
        const nextErrorsById = {
            ...this.calendarViewErrorsById,
            [definitionId]: message
        };
        const previousMessage = this.calendarViewErrorsById[definitionId];

        this.calendarViewErrorsById = nextErrorsById;

        if (previousMessage !== message) {
            this.showToast(
                'Calendar View Warning',
                `${definition?.name || 'Calendar'}: ${message}`,
                'warning'
            );
        }
    }

    toTime(value) {
        return new Date(value).getTime();
    }

    formatEventStamp(eventRecord) {
        const start = new Date(eventRecord.start);
        const endValue = eventRecord.endDateTime ? new Date(eventRecord.endDateTime) : null;

        const dateLabel = start.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
        });

        if (eventRecord.allDay) {
            return `${dateLabel} • All day`;
        }

        const startLabel = start.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
        });

        if (!endValue) {
            return `${dateLabel} • ${startLabel}`;
        }

        const endLabel = endValue.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
        });

        return `${dateLabel} • ${startLabel} - ${endLabel}`;
    }

    extractErrorMessage(error) {
        if (!error) {
            return 'Unknown error';
        }

        if (typeof error === 'string') {
            return error;
        }

        if (error.body?.message) {
            return error.body.message;
        }

        if (Array.isArray(error.body)) {
            return error.body.map((item) => item.message).join(', ');
        }

        if (error.detail?.message) {
            return error.detail.message;
        }

        if (error.message) {
            return error.message;
        }

        return 'Unknown error';
    }

    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }
}

function createDefaultLayoutPreference(overrides = {}) {
    return {
        defaultView: 'month',
        defaultCalendarViewId: '',
        defaultStatus: '',
        showSecurityButton: true,
        showRefreshButton: true,
        showTodayButton: true,
        showPrevNextButtons: true,
        showNewButton: true,
        showFiltersButton: true,
        showSelectUsersBox: true,
        showFilterControls: true,
        showWeekends: true,
        autoExpandDayHeight: true,
        wrapEventTitles: true,
        compactEventDensity: false,
        isActive: true,
        ...overrides
    };
}

function normalizeLayoutPreference(rawValue) {
    const fallback = createDefaultLayoutPreference();
    const source = rawValue || {};

    return {
        defaultView:
            source.defaultView === 'week' || source.defaultView === 'agenda'
                ? source.defaultView
                : 'month',
        defaultCalendarViewId: source.defaultCalendarViewId || '',
        defaultStatus: source.defaultStatus || '',
        showSecurityButton:
            source.showSecurityButton === undefined
                ? fallback.showSecurityButton
                : source.showSecurityButton === true,
        showRefreshButton:
            source.showRefreshButton === undefined
                ? fallback.showRefreshButton
                : source.showRefreshButton === true,
        showTodayButton:
            source.showTodayButton === undefined
                ? fallback.showTodayButton
                : source.showTodayButton === true,
        showPrevNextButtons:
            source.showPrevNextButtons === undefined
                ? fallback.showPrevNextButtons
                : source.showPrevNextButtons === true,
        showNewButton:
            source.showNewButton === undefined
                ? fallback.showNewButton
                : source.showNewButton === true,
        showFiltersButton:
            source.showFiltersButton === undefined
                ? fallback.showFiltersButton
                : source.showFiltersButton === true,
        showSelectUsersBox:
            source.showSelectUsersBox === undefined
                ? fallback.showSelectUsersBox
                : source.showSelectUsersBox === true,
        showFilterControls:
            source.showFilterControls === undefined
                ? fallback.showFilterControls
                : source.showFilterControls === true,
        showWeekends:
            source.showWeekends === undefined ? fallback.showWeekends : source.showWeekends === true,
        autoExpandDayHeight:
            source.autoExpandDayHeight === undefined
                ? fallback.autoExpandDayHeight
                : source.autoExpandDayHeight === true,
        wrapEventTitles:
            source.wrapEventTitles === undefined
                ? fallback.wrapEventTitles
                : source.wrapEventTitles === true,
        compactEventDensity: source.compactEventDensity === true,
        isActive: source.isActive === undefined ? fallback.isActive : source.isActive === true
    };
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createDefaultGoogleConnection(overrides = {}) {
    return {
        configured: false,
        connected: false,
        requiresAuthentication: false,
        mode: 'NamedPrincipal',
        status: 'Not Connected',
        message: 'Select a single calendar to manage Google connection.',
        namedCredential: 'GoogleCalendar',
        externalCredential: 'GoogleCalendar_ExternalCredential',
        principalName: 'GoogleCalendarNamedPrincipal',
        googleCalendarId: null,
        googleImportCalendarIds: [],
        ...overrides
    };
}