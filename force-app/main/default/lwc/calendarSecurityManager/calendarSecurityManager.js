import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import canCurrentUserManageSecurity from '@salesforce/apex/TeamCalendarSecurityController.canCurrentUserManageSecurity';
import getSecurityUsers from '@salesforce/apex/TeamCalendarSecurityController.getSecurityUsers';
import getCalendarViewsForSecurity from '@salesforce/apex/TeamCalendarSecurityController.getCalendarViewsForSecurity';
import getUserCalendarAccess from '@salesforce/apex/TeamCalendarSecurityController.getUserCalendarAccess';
import saveUserCalendarAccess from '@salesforce/apex/TeamCalendarSecurityController.saveUserCalendarAccess';
import getUserLayoutPreference from '@salesforce/apex/TeamCalendarSecurityController.getUserLayoutPreference';
import saveUserLayoutPreference from '@salesforce/apex/TeamCalendarSecurityController.saveUserLayoutPreference';
import setLayoutFieldForAllUsers from '@salesforce/apex/TeamCalendarSecurityController.setLayoutFieldForAllUsers';

import {
    ACCESS_TAB,
    LAYOUT_TAB,
    LAYOUT_FIELD_LABELS,
    createDefaultLayoutDraft,
    normalizeLayoutDraft,
    normalizeAccessRow,
    normalizeCalendarView,
    buildAccessRow,
    rowHasGrantedAccess,
    applyAccessPresetToRows,
    getPresetLabel,
    getRowPresetSummary,
    buildToolbarVisibilitySummary,
    buildBoardLayoutSummary,
    buildSelectedUsersVisibilitySummaryLine,
    buildLayoutActivationSummary,
    buildApprovedSelectedUsersSummary,
    buildApprovedSelectedUsersButtonLabel,
    buildApprovedSelectedUsersCountLabel
} from './calendarSecurityManagerHelpers';

export default class CalendarSecurityManager extends LightningElement {
    users = [];
    calendarViews = [];
    allAccessRows = [];

    selectedUserId;
    selectedUserName = '';

    userSearch = '';
    calendarSearch = '';
    ownerFilter = '';
    approvedSelectedUsersSearch = '';
    showOnlySelectedOwnerViews = false;
    showOnlyActiveAccess = false;
    showOnlyGrantedAccess = false;

    isOpen = false;
    isBusy = false;
    isSaving = false;
    isApprovedSelectedUsersOpen = false;
    applyingAllUsersFieldName = '';

    activeTab = ACCESS_TAB;
    layoutDraft = createDefaultLayoutDraft();

    canManage = false;
    layoutDraftsByUser = {};

    connectedCallback() {
        this.bootstrap();
    }

    async bootstrap() {
        try {
            this.canManage = await canCurrentUserManageSecurity();

            if (!this.canManage) {
                return;
            }

            const [users, calendarViews] = await Promise.all([
                getSecurityUsers(),
                getCalendarViewsForSecurity()
            ]);

            this.users = Array.isArray(users) ? users : [];
            this.calendarViews = Array.isArray(calendarViews)
                ? calendarViews.map(normalizeCalendarView)
                : [];

            if (this.users.length > 0 && !this.selectedUserId) {
                await this.loadUserAccess(this.users[0].id);
            }
        } catch (error) {
            this.showError('Unable to load calendar security.', error);
        }
    }

    get showGear() {
        return this.canManage;
    }

    get selectedUserLabel() {
        return this.selectedUserName || 'Select a user';
    }

    get isAccessTabActive() {
        return this.activeTab === ACCESS_TAB;
    }

    get isLayoutTabActive() {
        return this.activeTab === LAYOUT_TAB;
    }

    get accessTabClass() {
        return this.isAccessTabActive
            ? 'security-tabs__button security-tabs__button--active'
            : 'security-tabs__button';
    }

    get layoutTabClass() {
        return this.isLayoutTabActive
            ? 'security-tabs__button security-tabs__button--active'
            : 'security-tabs__button';
    }

    get defaultAllowedSelectedUserIds() {
        return (this.users || []).map((row) => row.id).filter(Boolean);
    }

    get isApplyingLayoutFieldToAll() {
        return Boolean(this.applyingAllUsersFieldName);
    }

    get isAllUsersUpdateDisabled() {
        return this.isBusy || this.isApplyingLayoutFieldToAll;
    }

    get filteredUsers() {
        const search = (this.userSearch || '').trim().toLowerCase();

        return this.users
            .filter((row) => {
                if (!search) {
                    return true;
                }

                return (
                    (row.name || '').toLowerCase().includes(search) ||
                    (row.username || '').toLowerCase().includes(search) ||
                    (row.profileName || '').toLowerCase().includes(search) ||
                    (row.roleName || '').toLowerCase().includes(search)
                );
            })
            .map((row) => ({
                ...row,
                rowClass:
                    row.id === this.selectedUserId
                        ? 'security-users__item security-users__item--selected'
                        : 'security-users__item'
            }));
    }

    get visibleRows() {
        const search = (this.calendarSearch || '').trim().toLowerCase();
        const ownerFilter = this.ownerFilter || '';

        return this.allAccessRows.filter((row) => {
            const matchesSearch =
                !search ||
                (row.name || '').toLowerCase().includes(search) ||
                (row.ownerName || '').toLowerCase().includes(search) ||
                (row.startField || '').toLowerCase().includes(search) ||
                (row.displayField || '').toLowerCase().includes(search);

            const matchesOwner = !ownerFilter || row.ownerId === ownerFilter;
            const matchesSelectedOwner =
                !this.showOnlySelectedOwnerViews || row.ownerId === this.selectedUserId;
            const matchesActive = !this.showOnlyActiveAccess || row.isActive === true;
            const matchesGranted =
                !this.showOnlyGrantedAccess || rowHasGrantedAccess(row);

            return (
                matchesSearch &&
                matchesOwner &&
                matchesSelectedOwner &&
                matchesActive &&
                matchesGranted
            );
        });
    }

    get hasVisibleRows() {
        return this.visibleRows.length > 0;
    }

    get visibleRowGroups() {
        const groupsByOwner = new Map();

        this.visibleRows.forEach((row) => {
            const ownerId = row.ownerId || 'unknown-owner';
            const ownerName = row.ownerName || 'Unknown Owner';

            if (!groupsByOwner.has(ownerId)) {
                groupsByOwner.set(ownerId, {
                    key: ownerId,
                    ownerId,
                    ownerName,
                    countLabel: '' ,
                    rows: []
                });
            }

            groupsByOwner.get(ownerId).rows.push({
                ...row,
                presetSummary: getRowPresetSummary(row)
            });
        });

        return Array.from(groupsByOwner.values())
            .sort((left, right) => {
                const leftIsSelectedOwner = left.ownerId === this.selectedUserId;
                const rightIsSelectedOwner = right.ownerId === this.selectedUserId;

                if (leftIsSelectedOwner !== rightIsSelectedOwner) {
                    return leftIsSelectedOwner ? -1 : 1;
                }

                return (left.ownerName || '').localeCompare(right.ownerName || '');
            })
            .map((group) => ({
                ...group,
                countLabel: `${group.rows.length} view${group.rows.length === 1 ? '' : 's'}`
            }));
    }

    get visibleRowsCount() {
        return this.visibleRows.length;
    }

    get totalAccessRowsCount() {
        return this.allAccessRows.length;
    }

    get ownerFilterOptions() {
        const options = [{ label: 'All Owners', value: '' }];
        const ownersById = new Map();

        (this.allAccessRows || []).forEach((row) => {
            if (!row.ownerId || ownersById.has(row.ownerId)) {
                return;
            }

            ownersById.set(row.ownerId, row.ownerName || 'Unknown Owner');
        });

        Array.from(ownersById.entries())
            .sort((left, right) => left[1].localeCompare(right[1]))
            .forEach(([value, label]) => {
                options.push({ label, value });
            });

        return options;
    }

    get selectedOwnerViewsChipLabel() {
        return this.selectedUserName
            ? `Owned by ${this.selectedUserName}`
            : 'Owned by selected user';
    }

    get activeAccessChipLabel() {
        return 'Only Active';
    }

    get grantedAccessChipLabel() {
        return 'Only Granted';
    }

    get filteredRowsSummary() {
        if (!this.totalAccessRowsCount) {
            return 'No calendar views available.';
        }

        return `Showing ${this.visibleRowsCount} of ${this.totalAccessRowsCount} calendar views`;
    }

    get hasVisibleRowsForBulkActions() {
        return this.visibleRowsCount > 0;
    }

    get bulkActionsDisabled() {
        return this.isSaving || !this.hasVisibleRowsForBulkActions;
    }

    get layoutViewOptions() {
        return [
            { label: 'Month', value: 'month' },
            { label: 'Week', value: 'week' },
            { label: 'Agenda', value: 'agenda' },
            { label: 'Team Load', value: 'teamLoad' },
            { label: 'Conflicts', value: 'conflicts' }
        ];
    }

    get layoutStatusOptions() {
        return [
            { label: 'All Statuses', value: '' },
            { label: 'Planned', value: 'Planned' },
            { label: 'Confirmed', value: 'Confirmed' },
            { label: 'Cancelled', value: 'Cancelled' }
        ];
    }

    get availableLayoutCalendarViews() {
        const rows = Array.isArray(this.allAccessRows) ? this.allAccessRows : [];
        const optionsById = new Map();

        rows.forEach((row) => {
            const ownsView =
                Boolean(this.selectedUserId) && row.ownerId === this.selectedUserId;
            const hasGrantedView = row.canView === true && row.isActive === true;

            if (!ownsView && !hasGrantedView) {
                return;
            }

            optionsById.set(row.id, {
                id: row.id,
                name: row.name,
                ownerId: row.ownerId,
                ownerName: row.ownerName || '',
                ownsView
            });
        });

        return Array.from(optionsById.values()).sort((left, right) =>
            (left.name || '').localeCompare(right.name || '')
        );
    }

    get layoutCalendarOptions() {
        const options = [{ label: 'No default calendar', value: '' }];

        this.availableLayoutCalendarViews.forEach((row) => {
            options.push({
                label: row.name,
                value: row.id
            });
        });

        return options;
    }

    get currentLayoutCalendarName() {
        if (!this.layoutDraft?.defaultCalendarViewId) {
            return 'No default calendar selected.';
        }

        const accessibleMatch = this.availableLayoutCalendarViews.find(
            (row) => row.id === this.layoutDraft.defaultCalendarViewId
        );
        if (accessibleMatch) {
            return accessibleMatch.name;
        }

        const globalMatch = this.calendarViews.find(
            (row) => row.id === this.layoutDraft.defaultCalendarViewId
        );
        if (globalMatch) {
            return `${globalMatch.name} (not currently accessible to selected user)`;
        }

        return 'No default calendar selected.';
    }

    get currentLayoutStatusName() {
        return this.layoutDraft?.defaultStatus || 'All Statuses';
    }

    get approvedSelectedUsersButtonLabel() {
        return buildApprovedSelectedUsersButtonLabel(this.layoutDraft, this.defaultAllowedSelectedUserIds.length);
    }

    get approvedSelectedUsersCountLabel() {
        return buildApprovedSelectedUsersCountLabel(this.layoutDraft, this.defaultAllowedSelectedUserIds.length);
    }

    get approvedSelectedUsersSummary() {
        return buildApprovedSelectedUsersSummary(this.users, this.layoutDraft, this.defaultAllowedSelectedUserIds.length);
    }

    get approvedSelectedUserOptions() {
        const approvedIds = new Set(this.layoutDraft?.allowedSelectedUserIds || []);
        const search = (this.approvedSelectedUsersSearch || '').trim().toLowerCase();

        return (this.users || [])
            .filter((row) => {
                if (!search) {
                    return true;
                }

                return (
                    (row.name || '').toLowerCase().includes(search) ||
                    (row.username || '').toLowerCase().includes(search) ||
                    (row.profileName || '').toLowerCase().includes(search) ||
                    (row.roleName || '').toLowerCase().includes(search)
                );
            })
            .map((row) => ({
                ...row,
                checked: approvedIds.has(row.id),
                meta: [row.profileName, row.roleName].filter(Boolean).join(' • ')
            }));
    }

    get hasApprovedSelectedUserOptions() {
        return this.approvedSelectedUserOptions.length > 0;
    }

    get saveButtonLabel() {
        return this.isLayoutTabActive ? 'Save Layout' : 'Save Rules';
    }

    get toolbarVisibilitySummary() {
        return buildToolbarVisibilitySummary(this.layoutDraft);
    }

    get boardLayoutSummary() {
        return buildBoardLayoutSummary(this.layoutDraft);
    }

    get selectedUsersVisibilitySummaryLine() {
        return buildSelectedUsersVisibilitySummaryLine(this.layoutDraft, this.defaultAllowedSelectedUserIds.length);
    }

    get layoutActivationSummary() {
        return buildLayoutActivationSummary(this.layoutDraft);
    }

    openModal() {
        this.isOpen = true;
    }

    closeModal() {
        this.cacheCurrentLayoutDraft();
        this.isApprovedSelectedUsersOpen = false;
        this.isOpen = false;
    }

    handleAccessTabClick() {
        this.cacheCurrentLayoutDraft();
        this.activeTab = ACCESS_TAB;
    }

    handleLayoutTabClick() {
        this.cacheCurrentLayoutDraft();
        this.activeTab = LAYOUT_TAB;
    }

    handleUserSearchChange(event) {
        this.userSearch = event.target.value || '';
    }

    handleCalendarSearchChange(event) {
        this.calendarSearch = event.target.value || '';
    }

    handleOwnerFilterChange(event) {
        this.ownerFilter = event.detail.value || '';
    }

    handleQuickFilterToggle(event) {
        const filterName = event.currentTarget.dataset.filter;

        if (filterName === 'selectedOwner') {
            this.showOnlySelectedOwnerViews = !this.showOnlySelectedOwnerViews;
        }

        if (filterName === 'active') {
            this.showOnlyActiveAccess = !this.showOnlyActiveAccess;
        }

        if (filterName === 'granted') {
            this.showOnlyGrantedAccess = !this.showOnlyGrantedAccess;
        }
    }

    handleApprovedSelectedUsersSearchChange(event) {
        this.approvedSelectedUsersSearch = event.target.value || '';
    }

    async handleSelectUser(event) {
        const userId = event.currentTarget.dataset.id;
        if (!userId || userId === this.selectedUserId) {
            return;
        }

        this.cacheCurrentLayoutDraft();
        await this.loadUserAccess(userId);
    }

    async loadUserAccess(userId) {
        this.isBusy = true;
        this.isApprovedSelectedUsersOpen = false;
        this.approvedSelectedUsersSearch = '';
        this.calendarSearch = '';
        this.ownerFilter = '';
        this.showOnlySelectedOwnerViews = false;
        this.showOnlyActiveAccess = false;
        this.showOnlyGrantedAccess = false;

        try {
            const [accessResponse, layoutResponse] = await Promise.all([
                getUserCalendarAccess({ userId }),
                getUserLayoutPreference({ userId })
            ]);

            this.selectedUserId = accessResponse.userId;
            this.selectedUserName = accessResponse.userName || '';

            const existingRules = new Map();
            (accessResponse.rules || []).forEach((rule) => {
                existingRules.set(rule.calendarViewId, rule);
            });

            this.allAccessRows = this.calendarViews
                .map((viewRow) => buildAccessRow(viewRow, existingRules.get(viewRow.id)))
                .sort((left, right) => (left.name || '').localeCompare(right.name || ''));

            const cachedDraft = this.layoutDraftsByUser[userId];
            this.layoutDraft = normalizeLayoutDraft(
                cachedDraft || layoutResponse,
                this.defaultAllowedSelectedUserIds
            );
            this.enforceAccessibleDefaultCalendar();
            this.enforceAllowedSelectedUsers();
            this.cacheCurrentLayoutDraft();
        } catch (error) {
            this.showError('Unable to load user calendar security.', error);
        } finally {
            this.isBusy = false;
        }
    }

    handleRuleToggle(event) {
        const rowId = event.target.dataset.id;
        const fieldName = event.target.dataset.field;
        const checked = event.target.checked === true;

        this.allAccessRows = this.allAccessRows.map((row) => {
            if (row.id !== rowId) {
                return row;
            }

            const updated = { ...row, [fieldName]: checked };

            if (
                fieldName === 'canView' ||
                fieldName === 'canCreate' ||
                fieldName === 'canEdit' ||
                fieldName === 'canDelete' ||
                fieldName === 'canAssignUsers' ||
                fieldName === 'canManageSecurity'
            ) {
                if (checked) {
                    updated.isActive = true;
                }
            }

            return normalizeAccessRow(updated);
        });

        this.enforceAccessibleDefaultCalendar();
        this.cacheCurrentLayoutDraft();
    }

    handleBulkAction(event) {
        const actionName = event.currentTarget.dataset.action;
        if (!actionName) {
            return;
        }

        const visibleRowIds = new Set(this.visibleRows.map((row) => row.id));
        if (!visibleRowIds.size) {
            return;
        }

        let updatedCount = 0;

        this.allAccessRows = this.allAccessRows.map((row) => {
            if (!visibleRowIds.has(row.id)) {
                return row;
            }

            updatedCount += 1;

            if (actionName === 'viewOnly') {
                return normalizeAccessRow({
                    ...row,
                    canView: true,
                    canCreate: false,
                    canEdit: false,
                    canDelete: false,
                    canAssignUsers: false,
                    canManageSecurity: false,
                    isActive: true
                });
            }

            if (actionName === 'editor') {
                return normalizeAccessRow({
                    ...row,
                    canView: true,
                    canCreate: true,
                    canEdit: true,
                    canDelete: false,
                    canAssignUsers: false,
                    canManageSecurity: false,
                    isActive: true
                });
            }

            if (actionName === 'clear') {
                return normalizeAccessRow({
                    ...row,
                    canView: false,
                    canCreate: false,
                    canEdit: false,
                    canDelete: false,
                    canAssignUsers: false,
                    canManageSecurity: false,
                    isActive: false
                });
            }

            return row;
        });

        this.enforceAccessibleDefaultCalendar();
        this.cacheCurrentLayoutDraft();

        const labelByAction = {
            viewOnly: 'View Only',
            editor: 'Editor',
            clear: 'Clear Access'
        };

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Updated',
                message: `${labelByAction[actionName] || 'Bulk update'} applied to ${updatedCount} calendar view${updatedCount === 1 ? '' : 's'}.`,
                variant: 'success'
            })
        );
    }

    handleRowPreset(event) {
        const rowId = event.currentTarget.dataset.id;
        const preset = event.currentTarget.dataset.preset;

        if (!rowId || !preset) {
            return;
        }

        const updatedRows = applyAccessPresetToRows(this.allAccessRows, new Set([rowId]), preset);
        this.allAccessRows = updatedRows;
        this.enforceAccessibleDefaultCalendar();
        this.cacheCurrentLayoutDraft();

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Updated',
                message: `${getPresetLabel(preset)} applied to 1 calendar view.`,
                variant: 'success'
            })
        );
    }

    handleLayoutFieldChange(event) {
        const fieldName = event.target.dataset.field;
        if (!fieldName) {
            return;
        }

        const nextValue =
            event.target.type === 'checkbox' || event.target.checked !== undefined
                ? event.target.checked === true
                : event.target.value ?? '';

        this.layoutDraft = normalizeLayoutDraft({
            ...this.layoutDraft,
            [fieldName]: nextValue
        }, this.defaultAllowedSelectedUserIds);

        this.enforceAccessibleDefaultCalendar();
        this.enforceAllowedSelectedUsers();
        this.cacheCurrentLayoutDraft();
    }

    handleLayoutPreset(event) {
        const preset = event.currentTarget.dataset.preset;
        if (!preset) {
            return;
        }

        let patch = {};

        if (preset === 'standard') {
            patch = {
                defaultView: 'month',
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
                isActive: true
            };
        }

        if (preset === 'compact') {
            patch = {
                defaultView: 'week',
                showSecurityButton: true,
                showRefreshButton: true,
                showTodayButton: true,
                showPrevNextButtons: true,
                showNewButton: true,
                showFiltersButton: true,
                showSelectUsersBox: true,
                showFilterControls: true,
                showWeekends: false,
                autoExpandDayHeight: false,
                wrapEventTitles: true,
                compactEventDensity: true,
                isActive: true
            };
        }

        if (preset === 'focused') {
            patch = {
                defaultView: 'agenda',
                showSecurityButton: true,
                showRefreshButton: true,
                showTodayButton: true,
                showPrevNextButtons: true,
                showNewButton: false,
                showFiltersButton: false,
                showSelectUsersBox: false,
                showFilterControls: false,
                showWeekends: false,
                autoExpandDayHeight: false,
                wrapEventTitles: false,
                compactEventDensity: true,
                isActive: true
            };
        }

        this.applyLayoutDraftPatch(patch);
    }

    handleLayoutSectionAction(event) {
        const section = event.currentTarget.dataset.section;
        const preset = event.currentTarget.dataset.preset;

        if (!section || !preset) {
            return;
        }

        let patch = {};

        if (section === 'toolbar' && preset === 'all') {
            patch = {
                showSecurityButton: true,
                showRefreshButton: true,
                showTodayButton: true,
                showPrevNextButtons: true,
                showNewButton: true,
                showFiltersButton: true,
                showSyncPanel: true
            };
        }

        if (section === 'toolbar' && preset === 'essential') {
            patch = {
                showSecurityButton: true,
                showRefreshButton: true,
                showTodayButton: true,
                showPrevNextButtons: true,
                showNewButton: false,
                showFiltersButton: false,
                showSyncPanel: false
            };
        }

        if (section === 'board' && preset === 'spacious') {
            patch = {
                showSelectUsersBox: true,
                showFilterControls: true,
                showWeekends: true,
                autoExpandDayHeight: true,
                wrapEventTitles: true,
                compactEventDensity: false,
                isActive: true
            };
        }

        if (section === 'board' && preset === 'compact') {
            patch = {
                showSelectUsersBox: true,
                showFilterControls: true,
                showWeekends: false,
                autoExpandDayHeight: false,
                wrapEventTitles: true,
                compactEventDensity: true,
                isActive: true
            };
        }

        if (section === 'board' && preset === 'minimal') {
            patch = {
                showSelectUsersBox: false,
                showFilterControls: false,
                showWeekends: false,
                autoExpandDayHeight: false,
                wrapEventTitles: false,
                compactEventDensity: true,
                isActive: true
            };
        }

        this.applyLayoutDraftPatch(patch);
    }

    toggleApprovedSelectedUsersMenu() {
        this.isApprovedSelectedUsersOpen = !this.isApprovedSelectedUsersOpen;
    }

    handleAllowedSelectedUserToggle(event) {
        const userId = event.target.dataset.id;
        if (!userId) {
            return;
        }

        const allowedIds = new Set(this.layoutDraft?.allowedSelectedUserIds || []);
        if (event.target.checked === true) {
            allowedIds.add(userId);
        } else {
            allowedIds.delete(userId);
        }

        this.layoutDraft = normalizeLayoutDraft({
            ...this.layoutDraft,
            allowedSelectedUserIds: Array.from(allowedIds)
        }, this.defaultAllowedSelectedUserIds);
        this.cacheCurrentLayoutDraft();
    }

    handleApprovedSelectedUsersBulkAction(event) {
        const action = event.currentTarget.dataset.action;
        if (!action) {
            return;
        }

        let nextAllowedIds = [];

        if (action === 'all') {
            nextAllowedIds = [...this.defaultAllowedSelectedUserIds];
        }

        if (action === 'none') {
            nextAllowedIds = [];
        }

        if (action === 'matching') {
            nextAllowedIds = this.approvedSelectedUserOptions.map((row) => row.id);
        }

        this.layoutDraft = normalizeLayoutDraft({
            ...this.layoutDraft,
            allowedSelectedUserIds: nextAllowedIds
        }, this.defaultAllowedSelectedUserIds);
        this.cacheCurrentLayoutDraft();
    }

    async handleLayoutFieldAllUsersChange(event) {
        const fieldName = event.target.dataset.field;
        if (!fieldName) {
            return;
        }

        const checked = event.target.checked === true;
        this.applyingAllUsersFieldName = fieldName;

        try {
            const updatedCount = await setLayoutFieldForAllUsers({
                fieldName,
                fieldValue: checked
            });

            const nextDraftsByUser = {
                ...this.layoutDraftsByUser
            };

            this.users.forEach((userRow) => {
                nextDraftsByUser[userRow.id] = normalizeLayoutDraft({
                    ...nextDraftsByUser[userRow.id],
                    [fieldName]: checked
                }, this.defaultAllowedSelectedUserIds);
            });

            this.layoutDraftsByUser = nextDraftsByUser;
            this.layoutDraft = normalizeLayoutDraft({
                ...this.layoutDraft,
                [fieldName]: checked
            }, this.defaultAllowedSelectedUserIds);
            this.cacheCurrentLayoutDraft();

            const fieldLabel = LAYOUT_FIELD_LABELS[fieldName] || 'Layout setting';

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Updated',
                    message: `${fieldLabel} ${checked ? 'enabled' : 'disabled'} for ${updatedCount} users.`,
                    variant: 'success'
                })
            );

            this.dispatchEvent(
                new CustomEvent('layoutchanged', {
                    detail: {
                        applyToAllUsers: true,
                        fieldName,
                        value: checked
                    },
                    bubbles: true,
                    composed: true
                })
            );
        } catch (error) {
            const fieldLabel = LAYOUT_FIELD_LABELS[fieldName] || 'layout setting';
            this.showError(`Unable to update ${fieldLabel} for all users.`, error);
        } finally {
            this.applyingAllUsersFieldName = '';
        }
    }

    enforceAccessibleDefaultCalendar() {
        const currentCalendarId = this.layoutDraft?.defaultCalendarViewId;
        if (!currentCalendarId) {
            return;
        }

        const isStillAllowed = this.availableLayoutCalendarViews.some(
            (row) => row.id === currentCalendarId
        );

        if (isStillAllowed) {
            return;
        }

        this.layoutDraft = normalizeLayoutDraft({
            ...this.layoutDraft,
            defaultCalendarViewId: ''
        }, this.defaultAllowedSelectedUserIds);
    }

    enforceAllowedSelectedUsers() {
        const allowedIds = new Set(this.defaultAllowedSelectedUserIds);
        const currentIds = this.layoutDraft?.allowedSelectedUserIds || [];
        const normalizedIds = currentIds.filter((row) => allowedIds.has(row));

        if (normalizedIds.length === currentIds.length) {
            return;
        }

        this.layoutDraft = normalizeLayoutDraft({
            ...this.layoutDraft,
            allowedSelectedUserIds: normalizedIds
        }, this.defaultAllowedSelectedUserIds);
    }

    cacheCurrentLayoutDraft() {
        if (!this.selectedUserId) {
            return;
        }

        this.layoutDraftsByUser = {
            ...this.layoutDraftsByUser,
            [this.selectedUserId]: normalizeLayoutDraft(
                this.layoutDraft,
                this.defaultAllowedSelectedUserIds
            )
        };
    }

    async handleSave() {
        if (!this.selectedUserId) {
            return;
        }

        this.isSaving = true;

        try {
            if (this.isLayoutTabActive) {
                this.enforceAccessibleDefaultCalendar();

                const payload = {
                    ...normalizeLayoutDraft(this.layoutDraft, this.defaultAllowedSelectedUserIds),
                    defaultCalendarViewId: this.layoutDraft.defaultCalendarViewId || null
                };

                const savedPreference = await saveUserLayoutPreference({
                    userId: this.selectedUserId,
                    preferenceJson: JSON.stringify(payload)
                });

                this.layoutDraft = normalizeLayoutDraft(
                    savedPreference,
                    this.defaultAllowedSelectedUserIds
                );
                this.enforceAccessibleDefaultCalendar();
                this.enforceAllowedSelectedUsers();
                this.cacheCurrentLayoutDraft();

                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Saved',
                        message: `Display layout saved for ${this.selectedUserName}.`,
                        variant: 'success'
                    })
                );

                this.dispatchEvent(
                    new CustomEvent('layoutchanged', {
                        detail: {
                            userId: this.selectedUserId,
                            preference: this.layoutDraft
                        },
                        bubbles: true,
                        composed: true
                    })
                );

                return;
            }

            const payload = this.allAccessRows.map((row) => {
                const normalizedRow = normalizeAccessRow(row);

                return {
                    calendarViewId: normalizedRow.id,
                    calendarViewName: normalizedRow.name,
                    calendarViewOwnerId: normalizedRow.ownerId,
                    canView: normalizedRow.canView,
                    canCreate: normalizedRow.canCreate,
                    canEdit: normalizedRow.canEdit,
                    canDelete: normalizedRow.canDelete,
                    canAssignUsers: normalizedRow.canAssignUsers,
                    canManageSecurity: normalizedRow.canManageSecurity,
                    isActive: normalizedRow.isActive,
                    notes: normalizedRow.notes
                };
            });

            await saveUserCalendarAccess({
                userId: this.selectedUserId,
                rulesJson: JSON.stringify(payload)
            });

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Saved',
                    message: `Calendar security saved for ${this.selectedUserName}.`,
                    variant: 'success'
                })
            );

            this.dispatchEvent(
                new CustomEvent('ruleschanged', {
                    detail: { userId: this.selectedUserId },
                    bubbles: true,
                    composed: true
                })
            );

            await this.loadUserAccess(this.selectedUserId);
        } catch (error) {
            this.showError(
                this.isLayoutTabActive
                    ? 'Unable to save layout preferences.'
                    : 'Unable to save calendar security.',
                error
            );
        } finally {
            this.isSaving = false;
        }
    }

    showError(title, error) {
        let message = 'Unknown error';

        if (error?.body?.message) {
            message = error.body.message;
        } else if (error?.message) {
            message = error.message;
        }

        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant: 'error'
            })
        );
    }

    applyLayoutDraftPatch(patch) {
        this.layoutDraft = normalizeLayoutDraft({
            ...this.layoutDraft,
            ...patch
        }, this.defaultAllowedSelectedUserIds);

        this.enforceAccessibleDefaultCalendar();
        this.enforceAllowedSelectedUsers();
        this.cacheCurrentLayoutDraft();
    }

}