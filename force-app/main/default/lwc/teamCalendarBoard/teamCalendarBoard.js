import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { encodeDefaultFieldValues } from 'lightning/pageReferenceUtils';
import getCalendars from '@salesforce/apex/TeamCalendarBoardController.getCalendars';
import getActiveUsers from '@salesforce/apex/TeamCalendarBoardController.getActiveUsers';
import getUserCalendars from '@salesforce/apex/TeamCalendarBoardController.getUserCalendars';
import getEventsForRange from '@salesforce/apex/TeamCalendarBoardController.getEventsForRange';
import getPdfExportPageUrl from '@salesforce/apex/TeamCalendarBoardController.getPdfExportPageUrl';
import getTaskEventsForCalendarViews from '@salesforce/apex/TeamCalendarBoardController.getTaskEventsForCalendarViews';
import getCurrentUserLayoutPreference from '@salesforce/apex/TeamCalendarSecurityController.getCurrentUserLayoutPreference';
import pushEventsForCalendar from '@salesforce/apex/GoogleCalendarSyncService.pushEventsForCalendar';
import importEventsFromGoogle from '@salesforce/apex/GoogleCalendarSyncService.importEventsFromGoogle';
import getConnectionState from '@salesforce/apex/GoogleCalendarConnectionService.getConnectionState';
import getAuthenticationUrl from '@salesforce/apex/GoogleCalendarConnectionService.getAuthenticationUrl';
import disconnectGoogle from '@salesforce/apex/GoogleCalendarConnectionService.disconnectGoogle';
import listAvailableCalendars from '@salesforce/apex/GoogleCalendarConnectionService.listAvailableCalendars';
import saveCalendarSelection from '@salesforce/apex/GoogleCalendarConnectionService.saveCalendarSelection';
import saveImportCalendarSelections from '@salesforce/apex/GoogleCalendarConnectionService.saveImportCalendarSelections';
import updateCalendarEvent from '@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent';
import deleteCalendarEvent from '@salesforce/apex/TeamCalendarRecordMutationService.deleteCalendarEvent';
import deleteTask from '@salesforce/apex/TeamCalendarRecordMutationService.deleteTask';
import { getListRecordsByName } from 'lightning/uiListsApi';
import {
    buildCalendarWeeks,
    buildAgendaGroups,
    buildRangeLabel,
    getVisibleRange
} from 'c/calendarUtils';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import USER_ID from '@salesforce/user/Id';

const RELATED_RECORD_CONTEXT_OBJECTS = new Set(['Marine__Boat__c', 'Appraisal__c', 'Marine__Deal__c']);

export default class TeamCalendarBoard extends NavigationMixin(LightningElement) {
    error;
    isLoading = false;
    isGoogleBusy = false;

    currentDate = new Date();
    currentView = 'month';

    showCreateModal = false;
    showDrawer = false;
    isDeletingEvent = false;
    isMovingEvent = false;
    pendingDeleteConfirm = null;

    selectedCalendarId = '';
    selectedStatus = '';
    selectedRecordId = null;
    selectedRecordObjectApiName = 'Calendar_Event__c';
    selectedRecordContextId = null;
    selectedRecordCanEdit = true;
    selectedRecordCanDelete = true;
    defaultStart = null;
    defaultEnd = null;
    activeEventMenu = null;
    hoveredQuickActionRecord = null;
    hoveredEventPreview = null;

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
    boundWindowContextMenuHandler;
    boundWindowMouseDownHandler;
    boundDocumentContextMenuHandler;
    boundDocumentPointerDownHandler;

    connectedCallback() {
        this.boundWindowContextMenuHandler = this.handleWindowContextMenu.bind(this);
        this.boundWindowMouseDownHandler = this.handleWindowMouseDown.bind(this);
        this.boundDocumentContextMenuHandler = this.handleDocumentContextMenu.bind(this);
        this.boundDocumentPointerDownHandler = this.handleDocumentPointerDown.bind(this);
        window.addEventListener('mousedown', this.boundWindowMouseDownHandler, true);
        window.addEventListener('contextmenu', this.boundWindowContextMenuHandler, true);
        if (this.ownerDocument) {
            this.ownerDocument.addEventListener('pointerdown', this.boundDocumentPointerDownHandler, true);
            this.ownerDocument.addEventListener('contextmenu', this.boundDocumentContextMenuHandler, true);
        }
        this.initialize();
    }

    disconnectedCallback() {
        if (this.ownerDocument) {
            if (this.boundDocumentPointerDownHandler) {
                this.ownerDocument.removeEventListener('pointerdown', this.boundDocumentPointerDownHandler, true);
            }
            if (this.boundDocumentContextMenuHandler) {
                this.ownerDocument.removeEventListener('contextmenu', this.boundDocumentContextMenuHandler, true);
            }
        }
        if (this.boundWindowMouseDownHandler) {
            window.removeEventListener('mousedown', this.boundWindowMouseDownHandler, true);
        }
        if (this.boundWindowContextMenuHandler) {
            window.removeEventListener('contextmenu', this.boundWindowContextMenuHandler, true);
        }
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

    get legendItems() {
        return (this.calendarDefinitions || [])
            .filter((row) => row.isDisplayed)
            .map((row) => ({
                id: row.id,
                label: row.name,
                color: row.color
            }));
    }

    get hasLegendItems() {
        return this.legendItems.length > 0;
    }

    get selectedUserCount() {
        return Array.isArray(this.selectedUserIds) ? this.selectedUserIds.length : 0;
    }

    get activeUserCount() {
        return Array.isArray(this.activeUserOptions) ? this.activeUserOptions.length : 0;
    }

    get hasActiveEventMenu() {
        return Boolean(this.activeEventMenu?.recordId);
    }

    get eventContextMenuStyle() {
        if (!this.hasActiveEventMenu) {
            return '';
        }

        return this.activeEventMenu.style || '';
    }

    get eventContextMenuRecordName() {
        return this.activeEventMenu?.recordName || 'this event';
    }

    get eventContextMenuItems() {
        return Array.isArray(this.activeEventMenu?.items) ? this.activeEventMenu.items : [];
    }

    get hasHoveredEventPreview() {
        return Boolean(this.hoveredEventPreview?.title);
    }

    get hoveredEventPreviewStyle() {
        if (!this.hasHoveredEventPreview) {
            return '';
        }

        return this.hoveredEventPreview.style || '';
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

    get isTaskCalendarSelection() {
        return this.getDefinitionObjectApiName(this.selectedCalendarDefinition) === 'Task';
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
            .filter((definition) =>
                definition?.id &&
                definition.id !== primarySelectedDefinitionId &&
                !this.isTaskCalendarDefinition(definition)
            )
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
            canCreate:
                row.canCreate !== undefined
                    ? row.canCreate
                    : row.CanCreate !== undefined
                        ? row.CanCreate
                        : true,
            canEdit:
                row.canEdit !== undefined
                    ? row.canEdit
                    : row.CanEdit !== undefined
                        ? row.CanEdit
                        : true,
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

        const googleCalendarIds = Array.isArray(event.detail?.value)
            ? event.detail.value
            : Array.isArray(event.detail)
                ? event.detail
                : [];
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
        this.closeEventContextMenu();
        this.defaultStart = null;
        this.defaultEnd = null;
        this.openCreateFlow();
    }

    handleDaySelect(event) {
        this.closeEventContextMenu();
        const selectedDate = event.detail?.dateKey;
        this.defaultStart = selectedDate;
        this.defaultEnd = selectedDate;
        this.openCreateFlow();
    }

    async handleEventDrop(event) {
        const recordId = event.detail?.recordId || null;
        const targetDateKey = event.detail?.targetDateKey || null;

        if (!recordId || !targetDateKey || this.isMovingEvent) {
            return;
        }

        const eventRecord = (this.events || []).find((row) => row.id === recordId);
        if (!eventRecord || eventRecord.recordObjectApiName !== 'Calendar_Event__c' || eventRecord.canEdit !== true) {
            return;
        }

        const requestPayload = this.buildMovedCalendarEventRequest(eventRecord, targetDateKey);
        if (!requestPayload) {
            this.showToast('Move Event Error', 'The calendar event could not be moved.', 'error');
            return;
        }

        this.isMovingEvent = true;

        try {
            await updateCalendarEvent({
                requestJson: JSON.stringify(requestPayload)
            });
            await this.loadEvents();
            this.showToast('Event Moved', `${eventRecord.name} was moved to ${this.formatMoveTargetLabel(targetDateKey)}.`, 'success');
        } catch (error) {
            this.showToast('Move Event Error', this.extractErrorMessage(error), 'error');
        } finally {
            this.isMovingEvent = false;
        }
    }

    handleEventOpen(event) {
        this.closeEventContextMenu();
        const recordContextId = event.detail?.recordContextId || null;
        const recordId = event.detail?.recordId || null;
        const recordObjectApiName =
            event.detail?.recordObjectApiName || this.resolveRecordObjectApiName(recordContextId);

        if (!this.shouldOpenDrawerForRecord(recordObjectApiName)) {
            this.showDrawer = false;
            this.selectedRecordId = null;
            this.selectedRecordContextId = null;
            this.navigateToRecord(recordId, recordObjectApiName);
            return;
        }

        this.selectedRecordId = recordId;
        this.selectedRecordObjectApiName = recordObjectApiName;
        this.selectedRecordContextId = recordContextId;
        this.selectedRecordCanEdit = event.detail?.canEdit !== false;
        this.selectedRecordCanDelete = event.detail?.canDelete === true;
        this.showDrawer = Boolean(this.selectedRecordId);
    }

    handleEventHover(event) {
        const source = this.buildContextMenuSourceFromDetail(event.detail);
        const eventRecord = this.findEventRecord(source?.recordId, source?.recordContextId);

        this.hoveredQuickActionRecord = source?.canContextMenu ? source : null;
        this.hoveredEventPreview = this.buildHoveredEventPreview(
            source,
            eventRecord,
            event.detail?.clientX,
            event.detail?.clientY
        );
    }

    handleEventUnhover() {
        this.hoveredQuickActionRecord = null;
        this.hoveredEventPreview = null;
    }

    handleEventContextMenu(event) {
        const source = this.buildContextMenuSourceFromDetail(event.detail);
        if (!source) {
            this.closeEventContextMenu();
            return;
        }

        this.openQuickActionMenu(source, {
            clientX: event.detail?.clientX,
            clientY: event.detail?.clientY,
            preventDefault() {},
            stopPropagation() {},
            stopImmediatePropagation() {}
        });
    }

    handleBoardContextMenu(event) {
        const source = this.resolveNativeContextMenuSource(event);
        if (!source) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.activeEventMenu = {
            recordId: source.recordId,
            recordName: source.recordName,
            recordObjectApiName: source.recordObjectApiName,
            recordContextId: source.recordContextId,
            style: this.buildEventContextMenuStyle(event.clientX, event.clientY)
        };
    }

    handleWindowContextMenu(event) {
        const source = this.hoveredQuickActionRecord || this.resolveNativeContextMenuSource(event);
        if (!source) {
            return;
        }

        this.openQuickActionMenu(source, event);
    }

    handleWindowMouseDown(event) {
        if (event.button !== 2) {
            return;
        }

        const source = this.hoveredQuickActionRecord || this.resolveNativeContextMenuSource(event);
        if (!source) {
            return;
        }

        this.openQuickActionMenu(source, event);
    }

    handleDocumentContextMenu(event) {
        const source = this.hoveredQuickActionRecord || this.resolveNativeContextMenuSource(event);
        if (!source) {
            return;
        }

        this.openQuickActionMenu(source, event);
    }

    handleDocumentPointerDown(event) {
        if (event.button !== 2) {
            return;
        }

        const source = this.hoveredQuickActionRecord || this.resolveNativeContextMenuSource(event);
        if (!source) {
            return;
        }

        this.openQuickActionMenu(source, event);
    }

    openQuickActionMenu(source, event) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }

        const eventRecord = this.findEventRecord(source.recordId, source.recordContextId);
        const items = this.buildEventContextMenuItems(source, eventRecord);
        if (!items.length) {
            this.closeEventContextMenu();
            return;
        }

        this.hoveredEventPreview = null;
        this.activeEventMenu = {
            recordId: source.recordId,
            recordName: source.recordName,
            recordObjectApiName: source.recordObjectApiName,
            recordContextId: source.recordContextId,
            items,
            style: this.buildEventContextMenuStyle(event.clientX, event.clientY, items.length)
        };
    }

    handleEventContextMenuClose() {
        this.closeEventContextMenu();
    }

    handleContextMenuItemClick(event) {
        const actionType = event.currentTarget.dataset.actionType || '';

        if (actionType === 'delete') {
            this.handleDeleteEventClick();
            return;
        }

        if (actionType === 'open-record') {
            this.closeEventContextMenu();
            this.navigateToRecord(
                event.currentTarget.dataset.recordId || null,
                event.currentTarget.dataset.objectApiName || null
            );
        }
    }

    async handleDeleteEventClick() {
        const recordId = this.activeEventMenu?.recordId;
        if (!recordId || this.isDeletingEvent) {
            return;
        }

        const recordName = this.activeEventMenu?.recordName || 'this event';
        const isTaskRecord = this.activeEventMenu?.recordObjectApiName === 'Task';

        this.pendingDeleteConfirm = {
            recordId,
            recordName,
            isTaskRecord,
            recordContextId: this.activeEventMenu?.recordContextId || null,
            message: `Delete ${isTaskRecord ? 'task' : 'event'} "${recordName}"?`
        };
    }

    handleCancelDelete() {
        this.pendingDeleteConfirm = null;
        this.closeEventContextMenu();
    }

    async handleConfirmDelete() {
        const pending = this.pendingDeleteConfirm;
        if (!pending || this.isDeletingEvent) {
            return;
        }

        this.pendingDeleteConfirm = null;
        const { recordId, recordName, isTaskRecord, recordContextId } = pending;

        this.isDeletingEvent = true;

        try {
            if (isTaskRecord) {
                await deleteTask({
                    recordId,
                    calendarViewId: recordContextId
                });
            } else {
                await deleteCalendarEvent({ recordId });
            }

            if (this.selectedRecordId === recordId) {
                this.selectedRecordId = null;
                this.showDrawer = false;
            }

            this.closeEventContextMenu();
            await this.loadEvents();
            this.showToast(isTaskRecord ? 'Task Deleted' : 'Event Deleted', `${recordName} was deleted.`, 'success');
        } catch (error) {
            this.showToast(
                isTaskRecord ? 'Delete Task Error' : 'Delete Event Error',
                this.extractErrorMessage(error),
                'error'
            );
        } finally {
            this.isDeletingEvent = false;
        }
    }

    handleCloseModal() {
        this.showCreateModal = false;
    }

    async handleCreateSuccess(event) {
        this.showCreateModal = false;
        this.closeEventContextMenu();

        const followUpCreatedCount = Number(event?.detail?.followUpCreatedCount || 0);
        const followUpFailedCount = Number(event?.detail?.followUpFailedCount || 0);

        let message = 'Calendar event saved.';
        let variant = 'success';

        if (followUpCreatedCount > 0) {
            message = `Calendar event saved with ${followUpCreatedCount} follow-up event${followUpCreatedCount === 1 ? '' : 's'} created.`;
        }

        if (followUpFailedCount > 0) {
            message += ` ${followUpFailedCount} follow-up event${followUpFailedCount === 1 ? '' : 's'} could not be created.`;
            variant = 'warning';
        }

        this.dispatchEvent(
            new ShowToastEvent({
                title: variant === 'warning' ? 'Event Saved With Warnings' : 'Event Saved',
                message,
                variant
            })
        );

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

    closeEventContextMenu() {
        this.activeEventMenu = null;
    }

    navigateToRecord(recordId, objectApiName) {
        if (!recordId) {
            return;
        }

        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId,
                objectApiName: objectApiName || undefined,
                actionName: 'view'
            }
        });
    }

    shouldOpenDrawerForRecord(objectApiName) {
        return objectApiName === 'Calendar_Event__c';
    }

    buildMovedCalendarEventRequest(eventRecord, targetDateKey) {
        const originalStart = new Date(eventRecord.start);
        const originalEnd = new Date(eventRecord.endDateTime || eventRecord.start);

        if (Number.isNaN(originalStart.getTime()) || Number.isNaN(originalEnd.getTime())) {
            return null;
        }

        const durationMs = Math.max(
            originalEnd.getTime() - originalStart.getTime(),
            eventRecord.allDay ? (23 * 60 + 59) * 60 * 1000 : 60 * 60 * 1000
        );

        const nextStart = new Date(`${targetDateKey}T00:00:00`);
        if (Number.isNaN(nextStart.getTime())) {
            return null;
        }

        if (eventRecord.allDay) {
            nextStart.setHours(0, 0, 0, 0);
        } else {
            nextStart.setHours(
                originalStart.getHours(),
                originalStart.getMinutes(),
                originalStart.getSeconds(),
                originalStart.getMilliseconds()
            );
        }

        const nextEnd = new Date(nextStart.getTime() + durationMs);

        return {
            recordId: eventRecord.id,
            calendarId: eventRecord.calendarId,
            name: eventRecord.name,
            startValue: nextStart.toISOString(),
            endValue: nextEnd.toISOString(),
            allDay: eventRecord.allDay === true,
            status: eventRecord.status,
            notes: eventRecord.notes
        };
    }

    formatMoveTargetLabel(targetDateKey) {
        const targetDate = new Date(`${targetDateKey}T12:00:00`);
        if (Number.isNaN(targetDate.getTime())) {
            return targetDateKey;
        }

        return targetDate.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    resolveNativeContextMenuSource(event) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const sourceNode = path.find(
            (node) =>
                node &&
                node.dataset &&
                node.dataset.id &&
                node.dataset.canContextMenu === 'true'
        );

        if (!sourceNode) {
            return null;
        }

        return {
            recordId: sourceNode.dataset.id,
            recordName: sourceNode.dataset.name || '',
            recordObjectApiName:
                sourceNode.dataset.recordObjectApiName ||
                this.resolveRecordObjectApiName(sourceNode.dataset.recordContextId || null),
            recordContextId: sourceNode.dataset.recordContextId || null,
            canDelete: sourceNode.dataset.canDelete === 'true',
            canContextMenu: sourceNode.dataset.canContextMenu === 'true'
        };
    }

    buildEventContextMenuStyle(clientX, clientY, itemCount = 1) {
        const menuWidth = 216;
        const menuHeight = 64 + Math.max(itemCount, 1) * 48;
        const margin = 12;
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
        const nextLeft = Math.min(
            Math.max(Number(clientX) || margin, margin),
            Math.max(viewportWidth - menuWidth - margin, margin)
        );
        const nextTop = Math.min(
            Math.max(Number(clientY) || margin, margin),
            Math.max(viewportHeight - menuHeight - margin, margin)
        );

        return `left:${nextLeft}px; top:${nextTop}px;`;
    }

    buildHoverPreviewStyle(clientX, clientY) {
        const previewWidth = 260;
        const previewHeight = 148;
        const margin = 12;
        const horizontalOffset = 14;
        const verticalOffset = 18;
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
        const requestedLeft = (Number(clientX) || margin) + horizontalOffset;
        const requestedTop = (Number(clientY) || margin) + verticalOffset;
        const nextLeft = Math.min(
            Math.max(requestedLeft, margin),
            Math.max(viewportWidth - previewWidth - margin, margin)
        );
        const nextTop = Math.min(
            Math.max(requestedTop, margin),
            Math.max(viewportHeight - previewHeight - margin, margin)
        );

        return `left:${nextLeft}px; top:${nextTop}px;`;
    }

    async handleCloseDrawer() {
        this.showDrawer = false;
        this.selectedRecordId = null;
        this.selectedRecordObjectApiName = 'Calendar_Event__c';
        this.selectedRecordContextId = null;
        this.selectedRecordCanEdit = true;
        this.selectedRecordCanDelete = true;
        await this.loadEvents();
    }

    openCreateFlow() {
        if (!this.isTaskCalendarSelection) {
            this.showCreateModal = true;
            return;
        }

        if (this.selectedCalendarDefinition?.canCreate !== true) {
            this.showToast(
                'Task Access Required',
                'Calendar Security Manager does not allow you to create Task records for this calendar view.',
                'error'
            );
            return;
        }

        this.navigateToTaskCreate();
    }

    navigateToTaskCreate() {
        const defaultFieldValues = {};
        const selectedDate = this.resolveDefaultTaskDate();
        const ownerId = this.selectedCalendarDefinition?.assignedUserId || null;

        if (selectedDate) {
            defaultFieldValues.ActivityDate = selectedDate;
        }

        if (ownerId) {
            defaultFieldValues.OwnerId = ownerId;
        }

        this[NavigationMixin.Navigate]({
            type: 'standard__objectPage',
            attributes: {
                objectApiName: 'Task',
                actionName: 'new'
            },
            state: Object.keys(defaultFieldValues).length
                ? {
                    defaultFieldValues: encodeDefaultFieldValues(defaultFieldValues)
                }
                : undefined
        });
    }

    resolveDefaultTaskDate() {
        const candidate = this.defaultStart || null;
        if (!candidate) {
            return null;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
            return candidate;
        }

        const parsedDate = new Date(candidate);
        if (Number.isNaN(parsedDate.getTime())) {
            return null;
        }

        const yearValue = parsedDate.getFullYear();
        const monthValue = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const dayValue = String(parsedDate.getDate()).padStart(2, '0');
        return `${yearValue}-${monthValue}-${dayValue}`;
    }

    getDefinitionObjectApiName(definition) {
        return definition?.listViewObjectApiName || definition?.sobjectType || null;
    }

    findEventRecord(recordId, recordContextId = null) {
        if (!recordId) {
            return null;
        }

        return (
            (this.events || []).find(
                (row) =>
                    row.id === recordId &&
                    (recordContextId == null || row.recordContextId === recordContextId)
            ) || null
        );
    }

    buildContextMenuSourceFromDetail(detail) {
        const recordId = detail?.recordId || null;
        if (!recordId) {
            return null;
        }

        return {
            recordId,
            recordName: detail?.recordName || '',
            recordObjectApiName:
                detail?.recordObjectApiName || this.resolveRecordObjectApiName(detail?.recordContextId),
            recordContextId: detail?.recordContextId || null,
            canDelete: detail?.canDelete === true,
            canContextMenu: detail?.canContextMenu !== false
        };
    }

    buildEventContextMenuItems(source, eventRecord) {
        const items = [];
        const contextLinks = this.resolveContextLinksForRecord(source, eventRecord);

        contextLinks.forEach((link) => {
            items.push({
                key: `open-${link.key}`,
                actionType: 'open-record',
                label: link.label,
                description: link.recordName || '',
                recordId: link.recordId,
                objectApiName: link.objectApiName,
                className: 'event-context-menu__item'
            });
        });

        if (
            source.canDelete === true &&
            (source.recordObjectApiName === 'Task' || source.recordObjectApiName === 'Calendar_Event__c')
        ) {
            items.push({
                key: 'delete-record',
                actionType: 'delete',
                label: source.recordObjectApiName === 'Task' ? 'Delete Task' : 'Delete Event',
                description: '',
                recordId: source.recordId,
                objectApiName: source.recordObjectApiName,
                className: 'event-context-menu__item event-context-menu__item--destructive'
            });
        }

        return items;
    }

    resolveContextLinksForRecord(source, eventRecord) {
        const links = Array.isArray(eventRecord?.contextLinks) ? [...eventRecord.contextLinks] : [];

        if (!links.length && source?.recordObjectApiName === 'Marine__Boat__c') {
            links.push(createContextLink('unit', 'Unit', source.recordId, 'Marine__Boat__c', source.recordName));
        }

        return dedupeContextLinks(links);
    }

    buildHoveredEventPreview(source, eventRecord, clientX, clientY) {
        const title = source?.recordName || eventRecord?.name || '';
        if (!title) {
            return null;
        }

        const lines = [];
        const timeLabel = this.buildHoverTimeLabel(eventRecord);

        if (eventRecord?.calendarName) {
            lines.push(eventRecord.calendarName);
        }

        if (timeLabel) {
            lines.push(timeLabel);
        }

        if (eventRecord?.status && eventRecord.status !== 'Calendar View') {
            lines.push(`Status: ${eventRecord.status}`);
        }

        (Array.isArray(eventRecord?.hoverDetails) ? eventRecord.hoverDetails : []).forEach((line) => {
            if (line && !lines.includes(line)) {
                lines.push(line);
            }
        });

        return {
            title,
            lines: lines.map((text, idx) => ({ key: `line-${idx}`, text })),
            style: this.buildHoverPreviewStyle(clientX, clientY)
        };
    }

    buildHoverTimeLabel(eventRecord) {
        if (!eventRecord?.start) {
            return '';
        }

        const start = new Date(eventRecord.start);
        const end = eventRecord.endDateTime ? new Date(eventRecord.endDateTime) : null;
        if (Number.isNaN(start.getTime())) {
            return '';
        }

        const dateLabel = start.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        if (eventRecord.allDay) {
            return `${dateLabel} • All Day`;
        }

        const startLabel = start.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
        });

        if (!end || Number.isNaN(end.getTime())) {
            return `${dateLabel} • ${startLabel}`;
        }

        const endLabel = end.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
        });

        return `${dateLabel} • ${startLabel} - ${endLabel}`;
    }

    resolveRecordObjectApiName(recordContextId) {
        if (!recordContextId) {
            return 'Calendar_Event__c';
        }

        const definition = (this.calendarDefinitions || []).find((row) => row.id === recordContextId);
        return this.getDefinitionObjectApiName(definition) || 'Calendar_Event__c';
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
                start: visibleRange?.startDate || null,
                endDate: visibleRange?.endDate || null
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
                    canCreate: normalizedRow.canCreate,
                    canEdit: normalizedRow.canEdit,
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
        const UNSUPPORTED_UI_API_OBJECTS = new Set([
            'ContentDocument', 'ContentVersion'
        ]);
        const objectType = definition?.sobjectType || definition?.listViewObjectApiName;
        return Boolean(
            definition &&
            definition.listViewFilterId &&
            definition.sobjectType &&
            !UNSUPPORTED_UI_API_OBJECTS.has(objectType) &&
            definition.startField &&
            definition.listViewApiName &&
            (definition.listViewObjectApiName || definition.sobjectType)
        );
    }

    isTaskCalendarDefinition(definition) {
        const objectType = definition?.sobjectType || definition?.listViewObjectApiName;
        return objectType === 'Task';
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
                    canCreate: calendar.canCreate,
                    canEdit: calendar.canEdit,
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

    async loadTaskCalendarEvents(taskDefinitions, visibleRange) {
        if (!taskDefinitions.length) {
            return [];
        }

        const requests = taskDefinitions.map((def) => ({
            calendarViewId: def.id,
            calendarViewName: def.name,
            calendarViewColor: def.color || '#706e6b',
            ownerId: def.ownerId || def.assignedUserId,
            startField: def.startField,
            displayField: def.displayField
        }));

        try {
            const rows = await getTaskEventsForCalendarViews({
                requestsJson: JSON.stringify(requests),
                startDate: visibleRange.startDate,
                endDate: visibleRange.endDate
            });
            return (rows || []).map((row) => this.normalizeEvent(row));
        } catch (err) {
            console.error('[TaskCalendar] Failed to load task events:', err);
            return [];
        }
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

        const extraFieldsByObject = {
            Marine__Boat__c: ['Appraisal__c', 'Deal__c', 'In_Contract__c', 'Unit_Deal_Stage__c', 'Stage__c', 'Marine__Stock_Number__c'],
            Appraisal__c: ['Boat__c', 'Deal__c', 'Deal_Stage__c', 'Stage__c'],
            Marine__Deal__c: ['Marine__Boat__c', 'Marine__Stage__c', 'Marine__Boat__r.Appraisal__c']
        };

        fieldNames.push(...(extraFieldsByObject[objectApiName] || []));

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

            const taskDefinitions = calendarViewDefinitions.filter(
                (d) => this.isTaskCalendarDefinition(d)
            );
            const nonTaskDefinitions = calendarViewDefinitions.filter(
                (d) => !this.isTaskCalendarDefinition(d)
            );

            if (nonTaskDefinitions.length) {
                const calendarViewEvents = this.loadCalendarViewEventsForDefinitions(
                    nonTaskDefinitions,
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

            if (taskDefinitions.length) {
                const taskEvents = await this.loadTaskCalendarEvents(
                    taskDefinitions,
                    visibleRange
                );

                if (loadId !== this.loadSequence) {
                    return;
                }

                nextEvents = this.dedupeNormalizedEvents([
                    ...nextEvents,
                    ...taskEvents
                ]);
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
        const recordObjectApiName = this.getDefinitionObjectApiName(calendarDefinition);

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
            lastSyncedAt: null,
            recordObjectApiName,
            recordContextId: calendarDefinition.id,
            canEdit: calendarDefinition?.canEdit === true,
            canDelete: false,
            contextLinks: this.buildCalendarViewContextLinks(record, recordObjectApiName),
            hoverDetails: this.buildCalendarViewHoverDetails(record, calendarDefinition, recordObjectApiName)
        };
    }

    buildCalendarViewContextLinks(record, objectApiName) {
        switch (objectApiName) {
        case 'Marine__Boat__c':
            return this.buildBoatContextLinks(record);
        case 'Appraisal__c':
            return this.buildAppraisalContextLinks(record);
        case 'Marine__Deal__c':
            return this.buildDealContextLinks(record);
        default:
            return [];
        }
    }

    buildBoatContextLinks(record) {
        const links = [
            createContextLink('unit', 'Unit', record.id, 'Marine__Boat__c', this.getUiFieldDisplayValue(record, 'Name') || this.getUiFieldValue(record, 'Name') || 'Unit')
        ];

        const appraisalId = this.getUiFieldValue(record, 'Appraisal__c');
        if (appraisalId) {
            links.push(
                createContextLink(
                    'appraisal',
                    'Appraisal',
                    appraisalId,
                    'Appraisal__c',
                    this.getUiFieldDisplayValue(record, 'Appraisal__c') || 'Appraisal'
                )
            );
        }

        const dealStage = this.getUiFieldDisplayValue(record, 'Unit_Deal_Stage__c') || this.getUiFieldValue(record, 'Unit_Deal_Stage__c');
        const hasInContractDeal = this.getUiFieldValue(record, 'In_Contract__c') === true || isInContractStage(dealStage);
        const dealId = this.getUiFieldValue(record, 'Deal__c');
        if (dealId && hasInContractDeal) {
            links.push(
                createContextLink(
                    'sales-deal',
                    'Sales Deal',
                    dealId,
                    'Marine__Deal__c',
                    this.getUiFieldDisplayValue(record, 'Deal__c') || 'Sales Deal'
                )
            );
        }

        return links;
    }

    buildAppraisalContextLinks(record) {
        const links = [];

        const boatId = this.getUiFieldValue(record, 'Boat__c');
        if (boatId) {
            links.push(
                createContextLink(
                    'unit',
                    'Unit',
                    boatId,
                    'Marine__Boat__c',
                    this.getUiFieldDisplayValue(record, 'Boat__c') || 'Unit'
                )
            );
        }

        links.push(
            createContextLink(
                'appraisal',
                'Appraisal',
                record.id,
                'Appraisal__c',
                this.getUiFieldDisplayValue(record, 'Name') || this.getUiFieldValue(record, 'Name') || 'Appraisal'
            )
        );

        const dealId = this.getUiFieldValue(record, 'Deal__c');
        const dealStage = this.getUiFieldDisplayValue(record, 'Deal_Stage__c') || this.getUiFieldValue(record, 'Deal_Stage__c');
        if (dealId && isInContractStage(dealStage)) {
            links.push(
                createContextLink(
                    'sales-deal',
                    'Sales Deal',
                    dealId,
                    'Marine__Deal__c',
                    this.getUiFieldDisplayValue(record, 'Deal__c') || 'Sales Deal'
                )
            );
        }

        return links;
    }

    buildDealContextLinks(record) {
        const links = [];

        const boatId = this.getUiFieldValue(record, 'Marine__Boat__c');
        if (boatId) {
            links.push(
                createContextLink(
                    'unit',
                    'Unit',
                    boatId,
                    'Marine__Boat__c',
                    this.getUiFieldDisplayValue(record, 'Marine__Boat__c') || 'Unit'
                )
            );
        }

        const appraisalId = this.getUiFieldValue(record, 'Marine__Boat__r.Appraisal__c');
        if (appraisalId) {
            links.push(
                createContextLink(
                    'appraisal',
                    'Appraisal',
                    appraisalId,
                    'Appraisal__c',
                    this.getUiFieldDisplayValue(record, 'Marine__Boat__r.Appraisal__c') || 'Appraisal'
                )
            );
        }

        const dealStage = this.getUiFieldDisplayValue(record, 'Marine__Stage__c') || this.getUiFieldValue(record, 'Marine__Stage__c');
        if (isInContractStage(dealStage)) {
            links.push(
                createContextLink(
                    'sales-deal',
                    'Sales Deal',
                    record.id,
                    'Marine__Deal__c',
                    this.getUiFieldDisplayValue(record, 'Name') || this.getUiFieldValue(record, 'Name') || 'Sales Deal'
                )
            );
        }

        return links;
    }

    buildCalendarViewHoverDetails(record, calendarDefinition, objectApiName) {
        const lines = [];

        if (calendarDefinition?.name) {
            lines.push(calendarDefinition.name);
        }

        if (objectApiName === 'Marine__Boat__c') {
            const stockNumber = this.getUiFieldDisplayValue(record, 'Marine__Stock_Number__c') || this.getUiFieldValue(record, 'Marine__Stock_Number__c');
            const stage = this.getUiFieldDisplayValue(record, 'Stage__c') || this.getUiFieldValue(record, 'Stage__c');

            if (stockNumber) {
                lines.push(`Stock #: ${stockNumber}`);
            }

            if (stage) {
                lines.push(`Stage: ${stage}`);
            }
        }

        if (objectApiName === 'Appraisal__c') {
            const boatLabel = this.getUiFieldDisplayValue(record, 'Boat__c');
            const stage = this.getUiFieldDisplayValue(record, 'Stage__c') || this.getUiFieldValue(record, 'Stage__c');

            if (boatLabel) {
                lines.push(`Unit: ${boatLabel}`);
            }

            if (stage) {
                lines.push(`Appraisal: ${stage}`);
            }
        }

        if (objectApiName === 'Marine__Deal__c') {
            const boatLabel = this.getUiFieldDisplayValue(record, 'Marine__Boat__c');
            const stage = this.getUiFieldDisplayValue(record, 'Marine__Stage__c') || this.getUiFieldValue(record, 'Marine__Stage__c');

            if (boatLabel) {
                lines.push(`Unit: ${boatLabel}`);
            }

            if (stage) {
                lines.push(`Deal: ${stage}`);
            }
        }

        return lines.filter(Boolean);
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
                colorStyle: `display:inline-block;width:0.75rem;height:0.75rem;border-radius:999px;background:${(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(row.rawColor || '') ? row.rawColor : '#1b96ff')};`
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
        const recordObjectApiName =
            row.recordObjectApiName || this.resolveRecordObjectApiName(row.recordContextId || row.calendarId);
        const canEdit = row.canEdit !== undefined ? row.canEdit : recordObjectApiName === 'Calendar_Event__c';
        const canDelete =
            row.canDelete !== undefined
                ? row.canDelete
                : recordObjectApiName === 'Task'
                    ? canEdit
                    : recordObjectApiName === 'Calendar_Event__c';
        const hasContextMenu =
            row.hasContextMenu !== undefined
                ? row.hasContextMenu
                : canDelete || RELATED_RECORD_CONTEXT_OBJECTS.has(recordObjectApiName);

        return {
            ...row,
            start: row.start,
            endDateTime: row.endDateTime || row.end || null,
            calendarColor: this.normalizeCalendarColor(row.calendarColor),
            recordObjectApiName,
            recordContextId: row.recordContextId || row.calendarId || null,
            contextLinks: Array.isArray(row.contextLinks) ? row.contextLinks : [],
            hoverDetails: Array.isArray(row.hoverDetails) ? row.hoverDetails : [],
            canEdit,
            canEditAttr: canEdit ? 'true' : 'false',
            canDelete,
            canDeleteAttr: canDelete ? 'true' : 'false',
            hasContextMenu,
            hasContextMenuAttr: hasContextMenu ? 'true' : 'false'
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
        return day?.isWeekend === true;
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
        showSyncPanel: true,
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
            ['month', 'week', 'agenda', 'teamLoad', 'conflicts'].includes(source.defaultView)
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
        showSyncPanel:
            source.showSyncPanel === undefined
                ? fallback.showSyncPanel
                : source.showSyncPanel === true,
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

function createContextLink(key, label, recordId, objectApiName, recordName) {
    return {
        key,
        label,
        recordId,
        objectApiName,
        recordName: recordName || ''
    };
}

function dedupeContextLinks(links) {
    const linksByKey = new Map();

    (links || []).forEach((link) => {
        if (!link?.recordId || !link?.label) {
            return;
        }

        const key = `${link.label}::${link.recordId}`;
        if (!linksByKey.has(key)) {
            linksByKey.set(key, link);
        }
    });

    return Array.from(linksByKey.values());
}

function isInContractStage(value) {
    return String(value || '').trim().toLowerCase() === 'in contract';
}