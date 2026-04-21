import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { encodeDefaultFieldValues } from 'lightning/pageReferenceUtils';
import getCalendars from '@salesforce/apex/TeamCalendarBoardController.getCalendars';
import getActiveUsers from '@salesforce/apex/TeamCalendarBoardController.getActiveUsers';
import getUserCalendars from '@salesforce/apex/TeamCalendarBoardController.getUserCalendars';
import getEventsForRange from '@salesforce/apex/TeamCalendarBoardController.getEventsForRange';
import getTaskEventsForCalendarViews from '@salesforce/apex/TeamCalendarBoardController.getTaskEventsForCalendarViews';
import getCurrentUserLayoutPreference from '@salesforce/apex/TeamCalendarSecurityController.getCurrentUserLayoutPreference';
import saveCurrentUserLayoutPreference from '@salesforce/apex/TeamCalendarSecurityController.saveCurrentUserLayoutPreference';
import updateCalendarEvent from '@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent';
import deleteCalendarEvent from '@salesforce/apex/TeamCalendarRecordMutationService.deleteCalendarEvent';
import createCalendarEventSeries from '@salesforce/apex/TeamCalendarRecordMutationService.createCalendarEventSeries';
import deleteTask from '@salesforce/apex/TeamCalendarRecordMutationService.deleteTask';
import { getListRecordsByName } from 'lightning/uiListsApi';
import {
    buildCalendarWeeks,
    buildAgendaGroups,
    buildRangeLabel,
    getVisibleRange,
    buildDayViewData
} from 'c/calendarUtils';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import USER_ID from '@salesforce/user/Id';
import {
    createDefaultLayoutPreference,
    normalizeLayoutPreference,
    createDefaultGoogleConnection,
    createContextLink,
    dedupeContextLinks,
    isInContractStage
} from './calendarBoardHelpers';
import {
    getDefinitionObjectApiName,
    buildCalendarViewOptionalFields,
    extractListRecords,
    mapCalendarViewRecord,
    buildCalendarViewContextLinks,
    buildCalendarViewHoverDetails,
    dedupeNormalizedEvents,
    toTime
} from './calendarViewMapper';
import {
    buildEventContextMenuStyle,
    buildHoverPreviewStyle,
    buildMovedCalendarEventRequest,
    formatMoveTargetLabel,
    resolveNativeContextMenuSource as resolveNativeContextMenuSourceFn,
    buildContextMenuSourceFromDetail as buildContextMenuSourceFromDetailFn,
    resolveContextLinksForRecord,
    buildEventContextMenuItems as buildEventContextMenuItemsFn,
    buildHoverTimeLabel,
    buildHoveredEventPreview as buildHoveredEventPreviewFn,
    resolveRecordObjectApiName as resolveRecordObjectApiNameFn
} from './calendarContextMenuHelpers';
import {
    buildEmptyGoogleCalendarOptions,
    buildGoogleSyncCalendarDefinitions,
    buildGoogleSyncViewState,
    isGoogleSyncCalendarId as isGoogleSyncCalendarIdFn
} from './calendarGoogleSyncState';
import {
    resetGoogleSyncSelectionContext,
    routeGoogleToolbarEvent as routeGoogleToolbarEventFn,
    routeGoogleModalEvent as routeGoogleModalEventFn,
    loadGoogleConnectionState as loadGoogleConnectionStateFn,
    loadGoogleCalendarOptions as loadGoogleCalendarOptionsFn,
    handleGoogleDisconnect as handleGoogleDisconnectFn,
    startGoogleConnect as startGoogleConnectFn,
    runGoogleImportSync as runGoogleImportSyncFn,
    runGoogleSync as runGoogleSyncFn
} from './calendarGoogleSyncController';
import {
    handleExportCsv as handleExportCsvFn,
    handleExportIcal as handleExportIcalFn
} from './calendarExportController';
import {
    DEFAULT_PDF_EXPORT_PAGE_URL,
    handleGeneratePdf as handleGeneratePdfFn,
    loadPdfExportPageUrl as loadPdfExportPageUrlFn
} from './calendarPdfExportController';
import {
    buildDeleteMutation as buildDeleteMutationFn,
    clearMutationTimers as clearMutationTimersFn,
    registerMutation as registerMutationFn,
    handleMutationNoticeAction as handleMutationNoticeActionFn,
    dismissMutationNotice as dismissMutationNoticeFn
} from './calendarMutationController';
import {
    initializeRealtimeUpdates as initializeRealtimeUpdatesFn,
    disconnectRealtimeUpdates as disconnectRealtimeUpdatesFn
} from './calendarRealtimeController';

const RELATED_RECORD_CONTEXT_OBJECTS = new Set(['Marine__Boat__c', 'Appraisal__c', 'Marine__Deal__c']);

export default class TeamCalendarBoard extends NavigationMixin(LightningElement) {
    error;
    isLoading = false;
    isGoogleBusy = false;

    _eventCache = new Map();
    static _CACHE_TTL_MS = 60000;

    currentDate = new Date();
    currentView = 'month';

    showCreateModal = false;
    showDrawer = false;
    showKeyboardShortcutOverlay = false;
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
    selectedRecordOccurrenceDate = null;
    selectedRecordIsRecurring = false;
    defaultStart = null;
    defaultEnd = null;
    activeEventMenu = null;
    hoveredQuickActionRecord = null;
    hoveredEventPreview = null;

    events = [];
    _searchTerm = '';
    _ariaMessage = '';
    weeks = [];
    agendaGroups = [];
    dayViewData = null;
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
    googleCalendarOptions = buildEmptyGoogleCalendarOptions();
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
        { label: 'Day', value: 'day' },
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
    pdfExportPageUrl = DEFAULT_PDF_EXPORT_PAGE_URL;
    realtimeSubscription = null;

    calendarViewWireData;
    calendarViewWireError;
    calendarViewPageSize = 2000;
    _isMobile = false;
    _touchStartX = 0;
    _touchStartY = 0;
    _quickCreate = null;
    _navDebounceTimer = null;
    _skipNextDrawerReload = false;
    _mutationHistory = [];
    _redoMutationHistory = [];
    _mutationSequence = 0;
    activeMutationNotice = null;
    legendColorSaveSequence = 0;
    boundWindowContextMenuHandler;
    boundWindowMouseDownHandler;
    boundDocumentContextMenuHandler;
    boundDocumentPointerDownHandler;
    boundKeyDownHandler;
    boundResizeHandler;

    connectedCallback() {
        this.boundWindowContextMenuHandler = this.handleWindowContextMenu.bind(this);
        this.boundWindowMouseDownHandler = this.handleWindowMouseDown.bind(this);
        this.boundDocumentContextMenuHandler = this.handleDocumentContextMenu.bind(this);
        this.boundDocumentPointerDownHandler = this.handleDocumentPointerDown.bind(this);
        this.boundKeyDownHandler = this.handleKeyDown.bind(this);
        this.boundResizeHandler = this._handleResize.bind(this);
        window.addEventListener('mousedown', this.boundWindowMouseDownHandler, true);
        window.addEventListener('contextmenu', this.boundWindowContextMenuHandler, true);
        window.addEventListener('keydown', this.boundKeyDownHandler, true);
        window.addEventListener('resize', this.boundResizeHandler, { passive: true });
        this._isMobile = window.innerWidth <= 640;
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
        if (this.boundKeyDownHandler) {
            window.removeEventListener('keydown', this.boundKeyDownHandler, true);
        }
        if (this.boundResizeHandler) {
            window.removeEventListener('resize', this.boundResizeHandler);
        }
        clearMutationTimersFn(this);
        disconnectRealtimeUpdatesFn(this);
    }

    async initialize() {
        await this.loadCurrentUserLayoutPreference();
        await Promise.all([
            this.loadCalendars(),
            this.loadActiveUsers(),
            loadPdfExportPageUrlFn(this)
        ]);
        await Promise.all([this.loadEvents(), this.loadGoogleConnectionState()]);
        await initializeRealtimeUpdatesFn(this);
    }

    get rangeLabel() {
        return buildRangeLabel(this.currentDate, this.currentView);
    }

    get monthYearLabel() {
        return buildRangeLabel(this.currentDate, 'month');
    }

    get eventCount() {
        return this.filteredEvents.length;
    }

    get filteredEvents() {
        if (!this._searchTerm) return this.events;
        const term = this._searchTerm.toLowerCase();
        return this.events.filter((ev) => {
            const name = (ev.name || '').toLowerCase();
            const notes = (ev.notes || '').toLowerCase();
            return name.includes(term) || notes.includes(term);
        });
    }

    get legendItems() {
        const selectedDefinition = this.selectedCalendarDefinition;
        if (!selectedDefinition) {
            return [];
        }

        return [
            {
                id: selectedDefinition.id,
                label: selectedDefinition.name,
                color: selectedDefinition.color,
                defaultColor: selectedDefinition.baseColor || selectedDefinition.color
            }
        ];
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
        if (this._isMobile) return false;
        return this.currentView === 'month' || this.currentView === 'week';
    }

    get isDayView() {
        if (this._isMobile) return false;
        return this.currentView === 'day';
    }

    get isWeekView() {
        return this.currentView === 'week';
    }

    get isAgendaView() {
        if (this._isMobile && (this.currentView === 'month' || this.currentView === 'week' || this.currentView === 'day')) {
            return true;
        }
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

    get hasQuickCreate() {
        return this._quickCreate !== null;
    }

    get quickCreateStyle() {
        if (!this._quickCreate) return '';
        const r = this._quickCreate.anchorRect;
        const popoverWidth = 280;
        const margin = 6;
        const viewportWidth = window.innerWidth || 800;
        let top = r.bottom + margin;
        let left = r.left;
        if (left + popoverWidth > viewportWidth - margin) {
            left = viewportWidth - popoverWidth - margin;
        }
        if (left < margin) left = margin;
        return `top:${top}px; left:${left}px;`;
    }

    get quickCreateCalendarOptions() {
        return (this.calendarDefinitions || [])
            .filter((row) => row.canCreate === true)
            .map((row) => ({ label: row.name, value: row.id }));
    }

    get quickCreateTitle() {
        return this._quickCreate ? (this._quickCreate.title || '') : '';
    }

    get quickCreateCalendarId() {
        return this._quickCreate ? (this._quickCreate.calendarId || '') : '';
    }

    get quickCreateIsSaving() {
        return this._quickCreate ? (this._quickCreate.isSaving === true) : false;
    }

    get skeletonCells() {
        const cells = [];
        for (let i = 0; i < 35; i++) {
            cells.push({ key: `skel-${i}` });
        }
        return cells;
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
        return getDefinitionObjectApiName(this.selectedCalendarDefinition) === 'Task';
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

    get googleSyncCalendarDefinitions() {
        return buildGoogleSyncCalendarDefinitions(
            this.calendarDefinitions,
            (definition) => this.isCalendarViewDefinition(definition)
        );
    }

    isGoogleSyncCalendarId(calendarId) {
        return isGoogleSyncCalendarIdFn(calendarId, this.googleSyncCalendarDefinitions);
    }

    get googleSyncViewState() {
        return buildGoogleSyncViewState({
            selectedCalendarId: this.selectedCalendarId,
            isCalendarViewBackedSelection: this.isCalendarViewBackedSelection,
            selectedCalendarDefinition: this.selectedCalendarDefinition,
            isGoogleBusy: this.isGoogleBusy,
            googleConnection: this.googleConnection,
            googleCalendarOptions: this.googleCalendarOptions,
            googleImportModalCalendarId: this.googleImportModalCalendarId,
            googleExportModalCalendarId: this.googleExportModalCalendarId,
            googleSyncCalendarDefinitions: this.googleSyncCalendarDefinitions,
            syncStatus: this.syncStatus,
            syncMessage: this.syncMessage,
            googleImportStatus: this.googleImportStatus,
            googleImportMessage: this.googleImportMessage
        });
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
                optionalFieldsCsv: buildCalendarViewOptionalFields(definition).join(',')
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

        const calendarId = row.id || row.Id || null;
        const baseColor = this.normalizeCalendarColor(
            row.baseColor || row.BaseColor || row.defaultColor || row.DefaultColor || row.color || row.Color
        );

        return {
            id: calendarId,
            name: row.name || row.Name || '',
            baseColor,
            color: this.resolveCalendarDisplayColor(calendarId, baseColor),
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

        if (shouldApplySelections) {
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

        this.refreshCalendarColorsFromPreference();
    }

    handleToolbarSearchChange(event) {
        this._searchTerm = (event.detail || '').trim();
        this.rebuildViewModels();
    }

    handleKeyDown(event) {
        // Ignore when a modifier key is held (e.g. Ctrl+R = browser refresh)
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        // Ignore when focus is inside an editable element (search box, inputs, etc.)
        const path = event.composedPath ? event.composedPath() : [];
        const activeEl = path[0] || event.target;
        const tag = (activeEl?.tagName || '').toUpperCase();
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || activeEl?.isContentEditable) return;

        const key = event.key;

        // Escape: close overlay or topmost open panel
        if (key === 'Escape') {
            if (this.showKeyboardShortcutOverlay) {
                this.showKeyboardShortcutOverlay = false;
                event.preventDefault();
            } else if (this.pendingDeleteConfirm) {
                this.handleCancelDelete();
                event.preventDefault();
            } else if (this.showCreateModal) {
                this.handleCloseModal();
                event.preventDefault();
            } else if (this.showDrawer) {
                this.handleCloseDrawer();
                event.preventDefault();
            }
            return;
        }

        // ? — toggle shortcut overlay
        if (key === '?') {
            this.showKeyboardShortcutOverlay = !this.showKeyboardShortcutOverlay;
            event.preventDefault();
            return;
        }

        // Don't intercept letter shortcuts when any modal/drawer is open
        if (
            this.showCreateModal ||
            this.showDrawer ||
            this.pendingDeleteConfirm ||
            this.showGoogleConnectModal ||
            this.showGoogleImportModal ||
            this.showGoogleExportModal
        ) {
            return;
        }

        switch (key) {
            case 't':
            case 'T':
                this.handleToday();
                event.preventDefault();
                break;
            case 'm':
            case 'M':
                this._switchView('month');
                event.preventDefault();
                break;
            case 'w':
            case 'W':
                this._switchView('week');
                event.preventDefault();
                break;
            case 'd':
            case 'D':
                this._switchView('day');
                event.preventDefault();
                break;
            case 'a':
            case 'A':
                this._switchView('agenda');
                event.preventDefault();
                break;
            case 'n':
            case 'N':
                this.handleHeaderNewEvent();
                event.preventDefault();
                break;
            case 'r':
            case 'R':
                this.handleRefresh();
                event.preventDefault();
                break;
            case 'ArrowLeft':
                this.handlePrev();
                event.preventDefault();
                break;
            case 'ArrowRight':
                this.handleNext();
                event.preventDefault();
                break;
            default:
                break;
        }
    }

    _switchView(view) {
        if (this.currentView !== view) {
            this.currentView = view;
            this.loadEvents();
        }
    }

    handleKeyboardShortcutOverlayClose() {
        this.showKeyboardShortcutOverlay = false;
    }

    _handleResize() {
        const nowMobile = window.innerWidth <= 640;
        if (nowMobile !== this._isMobile) {
            this._isMobile = nowMobile;
            this.rebuildViewModels();
        }
    }

    handleTouchStart(event) {
        if (event.touches.length !== 1) return;
        this._touchStartX = event.touches[0].clientX;
        this._touchStartY = event.touches[0].clientY;
    }

    handleTouchEnd(event) {
        if (event.changedTouches.length !== 1) return;
        const dx = event.changedTouches[0].clientX - this._touchStartX;
        const dy = event.changedTouches[0].clientY - this._touchStartY;
        // Only trigger if mostly horizontal and > 55px
        if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) {
            this.handleNext();
        } else {
            this.handlePrev();
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

    async handleLegendColorChange(event) {
        const calendarId = event.detail?.calendarId;
        const color = event.detail?.color;
        if (!calendarId || !color) {
            return;
        }

        await this.updateCalendarColorOverride(calendarId, color);
    }

    async handleLegendColorReset(event) {
        const calendarId = event.detail?.calendarId;
        if (!calendarId) {
            return;
        }

        await this.updateCalendarColorOverride(calendarId, null);
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
        const viewLabel = (this.viewOptions.find((v) => v.value === this.currentView) || {}).label || this.currentView;
        this._announce(`Now showing ${viewLabel} view`);
        this.loadEvents();
    }

    handleCalendarChange(event) {
        this.selectedCalendarId = event.detail;
        resetGoogleSyncSelectionContext(this);

        this.loadEvents();
        this.loadGoogleConnectionState();
    }

    async handleGoogleToolbarEvent(event) {
        await routeGoogleToolbarEventFn(this, event);
    }

    async handleGoogleModalEvent(event) {
        await routeGoogleModalEventFn(this, event);
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
        handleGeneratePdfFn(this);
    }

    handleExportCsv() {
        handleExportCsvFn(this, this.filteredEvents, {
            scope: 'visible',
            fileLabel: this.rangeLabel
        });
    }

    handleExportIcal() {
        handleExportIcalFn(this, this.filteredEvents, {
            scope: 'visible',
            fileLabel: this.rangeLabel
        });
    }

    handlePrev() {
        const nextDate = new Date(this.currentDate);

        if (this.currentView === 'day') {
            nextDate.setDate(nextDate.getDate() - 1);
        } else if (this.currentView === 'week') {
            nextDate.setDate(nextDate.getDate() - 7);
        } else {
            nextDate.setMonth(nextDate.getMonth() - 1);
        }

        this.currentDate = nextDate;
        this._debouncedLoadEvents();
    }

    handleNext() {
        const nextDate = new Date(this.currentDate);

        if (this.currentView === 'day') {
            nextDate.setDate(nextDate.getDate() + 1);
        } else if (this.currentView === 'week') {
            nextDate.setDate(nextDate.getDate() + 7);
        } else {
            nextDate.setMonth(nextDate.getMonth() + 1);
        }

        this.currentDate = nextDate;
        this._debouncedLoadEvents();
    }

    _debouncedLoadEvents() {
        if (this._navDebounceTimer) {
            clearTimeout(this._navDebounceTimer);
        }
        this._navDebounceTimer = setTimeout(() => {
            this._navDebounceTimer = null;
            this.loadEvents();
        }, 250);
    }

    handleMoreEvents(event) {
        const dateKey = event.detail?.dateKey;
        if (!dateKey) return;
        // Parse YYYY-MM-DD at noon local time to avoid timezone boundary issues
        const parts = dateKey.split('-');
        const d = new Date(
            parseInt(parts[0], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[2], 10),
            12, 0, 0
        );
        this.currentDate = d;
        this.currentView = 'day';
        this._announce(`Expanded to Day view for ${dateKey}`);
        this.loadEvents();
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

    handleGridQuickCreate(event) {
        this.closeEventContextMenu();
        const { dateKey, anchorRect } = event.detail || {};
        if (!dateKey) return;
        const defaultCal =
            (this.calendarDefinitions || []).find((r) => r.canCreate === true)?.id || '';
        this._quickCreate = {
            dateKey,
            anchorRect,
            title: '',
            calendarId: this.selectedCalendarId || defaultCal,
            isSaving: false
        };
    }

    handleQuickCreateTitleChange(event) {
        if (!this._quickCreate) return;
        this._quickCreate = { ...this._quickCreate, title: event.target.value };
    }

    handleQuickCreateCalendarChange(event) {
        if (!this._quickCreate) return;
        this._quickCreate = { ...this._quickCreate, calendarId: event.detail.value };
    }

    handleQuickCreateClose() {
        this._quickCreate = null;
    }

    handleQuickCreateMoreDetails() {
        if (!this._quickCreate) return;
        const { dateKey } = this._quickCreate;
        this._quickCreate = null;
        this.defaultStart = dateKey;
        this.defaultEnd = dateKey;
        this.openCreateFlow();
    }

    async handleQuickCreateSave() {
        if (!this._quickCreate || this._quickCreate.isSaving) return;
        const title = (this._quickCreate.title || '').trim();
        if (!title) {
            this.showToast('Title required', 'Please enter an event title before saving.', 'warning');
            return;
        }
        const calendarId = this._quickCreate.calendarId || this.selectedCalendarId;
        const dateKey = this._quickCreate.dateKey;
        this._quickCreate = { ...this._quickCreate, isSaving: true };

        try {
            const request = {
                primaryEvent: {
                    name: title,
                    calendarId,
                    startValue: dateKey,
                    endValue: dateKey,
                    allDay: true,
                    status: 'Planned'
                },
                followUpEvents: []
            };
            await createCalendarEventSeries({ requestJson: JSON.stringify(request) });
            this._quickCreate = null;
            this._announce(`Event "${title}" created.`);
            this._invalidateCache();
            await this.loadEvents();
        } catch (err) {
            this._quickCreate = { ...this._quickCreate, isSaving: false };
            const msg = err?.body?.message || err?.message || 'Unknown error';
            this.showToast('Could not save event', msg, 'error');
        }
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

        const requestPayload = buildMovedCalendarEventRequest(eventRecord, targetDateKey);
        if (!requestPayload) {
            this.showToast('Move Event Error', 'The calendar event could not be moved.', 'error');
            return;
        }

        this.isMovingEvent = true;

        try {
            await updateCalendarEvent({
                requestJson: JSON.stringify(requestPayload)
            });
            this._invalidateCache();
            await this.loadEvents();
            const moveLabel = `${eventRecord.name} was moved to ${formatMoveTargetLabel(targetDateKey)}.`;
            const moveMutation = this.buildMoveMutation(eventRecord, requestPayload, targetDateKey);
            if (moveMutation) {
                registerMutationFn(this, moveMutation);
            } else {
                this.showToast('Event Moved', moveLabel, 'success');
            }
            this._announce(moveLabel);
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
        this.selectedRecordOccurrenceDate = event.detail?.occurrenceDate || null;
        this.selectedRecordIsRecurring = event.detail?.isRecurring === true;
        this.showDrawer = Boolean(this.selectedRecordId);
    }

    handleEventHover(event) {
        const source = this.buildContextMenuSourceFromDetail(event.detail);
        const eventRecord = this.findEventRecord(source?.recordId, source?.recordContextId);

        this.hoveredQuickActionRecord = source?.canContextMenu ? source : null;
        this.hoveredEventPreview = buildHoveredEventPreviewFn(
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
            style: buildEventContextMenuStyle(event.clientX, event.clientY)
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
        const items = buildEventContextMenuItemsFn(source, eventRecord);
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
            style: buildEventContextMenuStyle(event.clientX, event.clientY, items.length)
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

        if (actionType === 'export-csv' || actionType === 'export-ical') {
            this.handleContextMenuExport(actionType);
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

    handleContextMenuExport(actionType) {
        const recordId = this.activeEventMenu?.recordId;
        const recordContextId = this.activeEventMenu?.recordContextId || null;
        const eventRecord = this.findEventRecord(recordId, recordContextId);

        if (!eventRecord) {
            this.closeEventContextMenu();
            this.showToast(
                'Export unavailable',
                'The selected event is no longer available for export.',
                'warning'
            );
            return;
        }

        const fileLabel = this.activeEventMenu?.recordName || eventRecord.name || 'event';
        this.closeEventContextMenu();

        if (actionType === 'export-csv') {
            handleExportCsvFn(this, [eventRecord], {
                scope: 'single',
                fileLabel
            });
            return;
        }

        handleExportIcalFn(this, [eventRecord], {
            scope: 'single',
            fileLabel
        });
    }

    async handleDeleteEventClick() {
        const recordId = this.activeEventMenu?.recordId;
        if (!recordId || this.isDeletingEvent) {
            return;
        }

        const recordName = this.activeEventMenu?.recordName || 'this event';
        const isTaskRecord = this.activeEventMenu?.recordObjectApiName === 'Task';
        const eventRecord = this.findEventRecord(recordId, this.activeEventMenu?.recordContextId || null);

        this.pendingDeleteConfirm = {
            recordId,
            recordName,
            isTaskRecord,
            recordContextId: this.activeEventMenu?.recordContextId || null,
            undoMutation: buildDeleteMutationFn({
                recordId,
                recordName,
                isTaskRecord,
                recordContextId: this.activeEventMenu?.recordContextId || null,
                supportsUndo: isTaskRecord || eventRecord?.isRecurring !== true
            }),
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
        const { recordId, recordName, isTaskRecord, recordContextId, undoMutation } = pending;

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
            this._invalidateCache();
            await this.loadEvents();
            const deleteMsg = `${recordName} was deleted.`;
            if (undoMutation) {
                registerMutationFn(this, undoMutation);
            } else {
                this.showToast(isTaskRecord ? 'Task Deleted' : 'Event Deleted', deleteMsg, 'success');
            }
            this._announce(deleteMsg);
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
        this._announce(message);

        this._invalidateCache();
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

    async handleDrawerMutation(event) {
        const mutation = event.detail;
        if (!mutation) {
            return;
        }

        this._skipNextDrawerReload = true;
        this._invalidateCache();
        await this.loadEvents();
        registerMutationFn(this, mutation);
        this._announce(mutation.message);
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

    resolveNativeContextMenuSource(event) {
        return resolveNativeContextMenuSourceFn(
            event,
            (contextId) => this.resolveRecordObjectApiName(contextId)
        );
    }

    async handleCloseDrawer() {
        const shouldSkipReload = this._skipNextDrawerReload === true;
        this._skipNextDrawerReload = false;
        this.showDrawer = false;
        this.selectedRecordId = null;
        this.selectedRecordObjectApiName = 'Calendar_Event__c';
        this.selectedRecordContextId = null;
        this.selectedRecordCanEdit = true;
        this.selectedRecordCanDelete = true;
        this.selectedRecordOccurrenceDate = null;
        this.selectedRecordIsRecurring = false;
        if (!shouldSkipReload) {
            await this.loadEvents();
        }
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
        return buildContextMenuSourceFromDetailFn(
            detail,
            (contextId) => this.resolveRecordObjectApiName(contextId)
        );
    }

    resolveRecordObjectApiName(recordContextId) {
        return resolveRecordObjectApiNameFn(recordContextId, this.calendarDefinitions);
    }

    async loadGoogleConnectionState() {
        await loadGoogleConnectionStateFn(this);
    }

    async loadGoogleCalendarOptions() {
        await loadGoogleCalendarOptionsFn(this);
    }

    async handleGoogleDisconnect() {
        await handleGoogleDisconnectFn(this);
    }

    async startGoogleConnect() {
        await startGoogleConnectFn(this);
    }

    async runGoogleImportSync() {
        await runGoogleImportSyncFn(this);
    }

    async runGoogleSync() {
        await runGoogleSyncFn(this);
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
                    baseColor: normalizedRow.baseColor,
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
                    baseColor: calendar.baseColor || calendar.color,
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

            const rawRecords = extractListRecords(payload);

            merged.push(
                ...(rawRecords || [])
                    .map((record) =>
                        mapCalendarViewRecord(
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

        return dedupeNormalizedEvents(merged);
    }

    hasPendingCalendarViewPayloads(definitions) {
        return (definitions || []).some((definition) => {
            const isPrimarySelectedDefinition =
                this.selectedCalendarDefinition &&
                definition.id === this.selectedCalendarDefinition.id;

            const hasError = isPrimarySelectedDefinition
                ? Boolean(this.calendarViewWireError)
                : Boolean(this.calendarViewErrorsById[definition.id]);

            if (hasError) {
                return false;
            }

            const payload = isPrimarySelectedDefinition
                ? this.calendarViewWireData
                : this.calendarViewPayloadsById[definition.id];

            return !payload;
        });
    }

    _buildCacheKey(visibleRange) {
        const userIds = [...(this.selectedUserIds || [])].sort().join(',');
        return [
            this.selectedCalendarId || '',
            this.selectedStatus || '',
            userIds,
            this.userCalendarSelectionJson || '',
            visibleRange.startDate,
            visibleRange.endDate
        ].join('|');
    }

    _invalidateCache() {
        this._eventCache.clear();
    }

    async loadEvents() {
        const loadId = ++this.loadSequence;
        const visibleRange = getVisibleRange(this.currentDate, this.currentView);
        const cacheKey = this._buildCacheKey(visibleRange);
        const now = Date.now();
        const cached = this._eventCache.get(cacheKey);

        if (cached && (now - cached.timestamp) < TeamCalendarBoard._CACHE_TTL_MS) {
            // Serve from cache — no spinner, no Apex
            if (loadId !== this.loadSequence) return;
            this.events = cached.events;
            this.rebuildViewModels();
            this.error = undefined;
            return;
        }

        this.isLoading = true;

        try {
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
            const hasPendingCalendarViewPayloads = this.hasPendingCalendarViewPayloads(
                nonTaskDefinitions
            );

            if (nonTaskDefinitions.length) {
                const calendarViewEvents = this.loadCalendarViewEventsForDefinitions(
                    nonTaskDefinitions,
                    visibleRange
                );

                if (loadId !== this.loadSequence) {
                    return;
                }

                nextEvents = dedupeNormalizedEvents([
                    ...nextEvents,
                    ...calendarViewEvents
                ]);
            } else {
                nextEvents = dedupeNormalizedEvents(nextEvents);
            }

            if (taskDefinitions.length) {
                const taskEvents = await this.loadTaskCalendarEvents(
                    taskDefinitions,
                    visibleRange
                );

                if (loadId !== this.loadSequence) {
                    return;
                }

                nextEvents = dedupeNormalizedEvents([
                    ...nextEvents,
                    ...taskEvents
                ]);
            }

            if (loadId !== this.loadSequence) {
                return;
            }

            if (!hasPendingCalendarViewPayloads) {
                this._eventCache.set(cacheKey, { events: nextEvents, timestamp: Date.now() });
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
                this.dayViewData = null;
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
        const rawRecords = extractListRecords(payload);

        const startBoundary = new Date(`${visibleRange.startDate}T00:00:00`);
        const endBoundaryExclusive = new Date(`${visibleRange.endDate}T00:00:00`);
        endBoundaryExclusive.setDate(endBoundaryExclusive.getDate() + 1);

        this.events = (rawRecords || [])
            .map((record) =>
                mapCalendarViewRecord(
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
        const count = this.filteredEvents.length;
        this._announce(`Showing ${count} event${count === 1 ? '' : 's'} for ${this.rangeLabel}`);
    }

    rebuildViewModels() {
        this.weeks = [];
        this.agendaGroups = [];
        this.teamLoadRows = [];
        this.conflictRows = [];
        this.dayViewData = null;

        if (this.isDayView) {
            this.dayViewData = buildDayViewData(this.currentDate, this.filteredEvents);
            return;
        }

        if (this.isAgendaView) {
            this.agendaGroups = buildAgendaGroups(this.filteredEvents);
            return;
        }

        if (this.isTeamLoadView) {
            this.teamLoadRows = this.buildTeamLoadRows(this.filteredEvents);
            return;
        }

        if (this.isConflictsView) {
            this.conflictRows = this.buildConflictRows(this.filteredEvents);
            return;
        }

        this.weeks = buildCalendarWeeks(this.currentDate, this.currentView, this.filteredEvents);

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
                (left, right) => toTime(left.start) - toTime(right.start)
            );

            for (let index = 0; index < sorted.length; index += 1) {
                const current = sorted[index];
                const currentEnd = toTime(current.endDateTime || current.start);

                for (let compareIndex = index + 1; compareIndex < sorted.length; compareIndex += 1) {
                    const candidate = sorted[compareIndex];
                    const candidateStart = toTime(candidate.start);

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
        const calendarKey = row.calendarId || row.recordContextId || null;
        const baseCalendarColor = this.normalizeCalendarColor(
            row.baseCalendarColor || row.calendarColor,
            '#0176d3'
        );
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
            baseCalendarColor,
            calendarColor: this.resolveCalendarDisplayColor(calendarKey, baseCalendarColor),
            recordObjectApiName,
            recordContextId: row.recordContextId || row.calendarId || null,
            contextLinks: Array.isArray(row.contextLinks) ? row.contextLinks : [],
            hoverDetails: Array.isArray(row.hoverDetails) ? row.hoverDetails : [],
            canEdit,
            canEditAttr: canEdit ? 'true' : 'false',
            canDelete,
            canDeleteAttr: canDelete ? 'true' : 'false',
            hasContextMenu,
            hasContextMenuAttr: hasContextMenu ? 'true' : 'false',
            // Recurrence
            recurrenceRule: row.recurrenceRule || null,
            recurrenceParentId: row.recurrenceParentId || null,
            isRecurrenceException: row.isRecurrenceException === true,
            occurrenceDate: row.occurrenceDate || null,
            isRecurring: row.isRecurring === true
        };
    }

    normalizeCalendarColor(rawColor, fallbackColor = '#0176d3') {
        if (!rawColor) {
            return fallbackColor;
        }

        const normalized = String(rawColor).trim().toLowerCase();
        if (!normalized) {
            return fallbackColor;
        }

        const withHash = normalized.startsWith('#') ? normalized : `#${normalized}`;
        return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(withHash) ? withHash : fallbackColor;
    }

    resolveCalendarDisplayColor(calendarId, baseColor) {
        const overrideColor = calendarId
            ? this.userLayoutPreference?.calendarColorOverrides?.[calendarId]
            : null;

        return this.normalizeCalendarColor(overrideColor || baseColor, '#0176d3');
    }

    refreshCalendarColorsFromPreference() {
        if (Array.isArray(this.calendarDefinitions) && this.calendarDefinitions.length) {
            this.calendarDefinitions = this.calendarDefinitions.map((row) =>
                this.normalizeCalendarDefinition(row)
            );
        }

        if (this.userCalendarsByUser && Object.keys(this.userCalendarsByUser).length) {
            const nextUserCalendarsByUser = {};

            Object.keys(this.userCalendarsByUser).forEach((userId) => {
                nextUserCalendarsByUser[userId] = (this.userCalendarsByUser[userId] || []).map((row) => ({
                    ...row,
                    baseColor: this.normalizeCalendarColor(row.baseColor || row.color, '#0176d3'),
                    color: this.resolveCalendarDisplayColor(
                        row.id,
                        this.normalizeCalendarColor(row.baseColor || row.color, '#0176d3')
                    )
                }));
            });

            this.userCalendarsByUser = nextUserCalendarsByUser;
        }

        if (Array.isArray(this.events) && this.events.length) {
            this.events = this.events.map((row) => this.normalizeEvent(row));
        }

        this.rebuildViewModels();
    }

    buildUserLayoutPreferencePayload(preference = this.userLayoutPreference) {
        return {
            ...preference,
            defaultCalendarViewId: preference?.defaultCalendarViewId || null,
            calendarColorOverrides: preference?.calendarColorOverrides || {}
        };
    }

    async updateCalendarColorOverride(calendarId, requestedColor) {
        const previousPreference = normalizeLayoutPreference(this.userLayoutPreference);
        const nextOverrides = {
            ...(previousPreference.calendarColorOverrides || {})
        };
        const normalizedDefaultColor = this.normalizeCalendarColor(
            this.calendarDefinitions.find((row) => row.id === calendarId)?.baseColor,
            '#0176d3'
        );
        const normalizedRequestedColor = requestedColor
            ? this.normalizeCalendarColor(requestedColor, null)
            : null;

        if (!normalizedRequestedColor || normalizedRequestedColor === normalizedDefaultColor) {
            delete nextOverrides[calendarId];
        } else {
            nextOverrides[calendarId] = normalizedRequestedColor;
        }

        const nextPreference = normalizeLayoutPreference({
            ...previousPreference,
            calendarColorOverrides: nextOverrides
        });

        this.applyUserLayoutPreference(nextPreference, { applySelections: false });
        this._invalidateCache();

        const saveSequence = ++this.legendColorSaveSequence;

        try {
            const savedPreference = await saveCurrentUserLayoutPreference({
                preferenceJson: JSON.stringify(this.buildUserLayoutPreferencePayload(nextPreference))
            });

            if (saveSequence !== this.legendColorSaveSequence) {
                return;
            }

            this.applyUserLayoutPreference(savedPreference, { applySelections: false });
            this._announce('Calendar color preference saved.');
        } catch (error) {
            if (saveSequence !== this.legendColorSaveSequence) {
                return;
            }

            this.applyUserLayoutPreference(previousPreference, { applySelections: false });
            this._invalidateCache();
            this.showToast('Calendar Colors', this.extractErrorMessage(error), 'error');
        }
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

    buildCalendarEventPayloadFromRecord(eventRecord) {
        if (!eventRecord) {
            return null;
        }

        return {
            recordId: eventRecord.id,
            calendarId: eventRecord.calendarId || null,
            name: eventRecord.name || '',
            startValue: eventRecord.start || null,
            endValue: eventRecord.endDateTime || eventRecord.end || eventRecord.start || null,
            allDay: eventRecord.allDay === true,
            status: eventRecord.status || 'Planned',
            notes: eventRecord.notes || ''
        };
    }

    buildMoveMutation(eventRecord, nextPayload, targetDateKey) {
        const previousPayload = this.buildCalendarEventPayloadFromRecord(eventRecord);
        if (!previousPayload || eventRecord?.isRecurring === true) {
            return null;
        }

        const recordName = eventRecord.name || 'Event';
        return {
            mutationType: 'calendar-update',
            recordId: eventRecord.id,
            recordName,
            previousPayload,
            nextPayload,
            message: `${recordName} was moved to ${formatMoveTargetLabel(targetDateKey)}.`,
            undoMessage: `Undid move for ${recordName}.`,
            redoMessage: `Moved ${recordName} back to ${formatMoveTargetLabel(targetDateKey)}.`
        };
    }

    async handleMutationNoticeAction() {
        await handleMutationNoticeActionFn(this);
    }

    dismissMutationNotice() {
        dismissMutationNoticeFn(this);
    }

    _announce(message) {
        // Clear first so the same message re-triggers the live region
        this._ariaMessage = '';
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this._ariaMessage = message;
        }, 50);
    }
}