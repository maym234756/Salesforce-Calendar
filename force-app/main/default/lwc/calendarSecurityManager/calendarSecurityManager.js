import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import canCurrentUserManageSecurity from '@salesforce/apex/TeamCalendarSecurityController.canCurrentUserManageSecurity';
import getSecurityUsers from '@salesforce/apex/TeamCalendarSecurityController.getSecurityUsers';
import getCalendarViewsForSecurity from '@salesforce/apex/TeamCalendarSecurityController.getCalendarViewsForSecurity';
import getUserCalendarAccess from '@salesforce/apex/TeamCalendarSecurityController.getUserCalendarAccess';
import saveUserCalendarAccess from '@salesforce/apex/TeamCalendarSecurityController.saveUserCalendarAccess';
import getUserLayoutPreference from '@salesforce/apex/TeamCalendarSecurityController.getUserLayoutPreference';
import saveUserLayoutPreference from '@salesforce/apex/TeamCalendarSecurityController.saveUserLayoutPreference';
import setLayoutFieldForAllUsers from '@salesforce/apex/TeamCalendarSecurityController.setLayoutFieldForAllUsers';

const ACCESS_TAB = 'access';
const LAYOUT_TAB = 'layout';
const LAYOUT_FIELD_LABELS = {
    showSecurityButton: 'Show Security button',
    showRefreshButton: 'Show Refresh button',
    showTodayButton: 'Show Today button',
    showPrevNextButtons: 'Show Prev / Next buttons',
    showNewButton: 'Show New button',
    showFiltersButton: 'Show Filters button',
    showSelectUsersBox: 'Show Select Users panel',
    showFilterControls: 'Show View / Calendar / Status controls',
    showWeekends: 'Show weekends',
    autoExpandDayHeight: 'Auto-expand day height',
    wrapEventTitles: 'Wrap event titles',
    compactEventDensity: 'Compact event density',
    isActive: 'Layout preference active'
};

function normalizeAllowedSelectedUserIds(rawValue, fallbackIds = []) {
    const source = Array.isArray(rawValue) ? rawValue : fallbackIds;
    const seenIds = new Set();

    return source.filter((row) => {
        const candidate = typeof row === 'string' ? row.trim() : '';
        if (!candidate || seenIds.has(candidate)) {
            return false;
        }

        seenIds.add(candidate);
        return true;
    });
}

function createDefaultLayoutDraft(defaultAllowedSelectedUserIds = []) {
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
        allowedSelectedUserIds: normalizeAllowedSelectedUserIds(defaultAllowedSelectedUserIds),
        isActive: true
    };
}

function normalizeLayoutDraft(rawValue, defaultAllowedSelectedUserIds = []) {
    const fallback = createDefaultLayoutDraft(defaultAllowedSelectedUserIds);
    const source = rawValue || {};

    let defaultView = typeof source.defaultView === 'string' ? source.defaultView : '';
    if (defaultView.toLowerCase() === 'teamload') {
        defaultView = 'teamLoad';
    }

    const allowedViews = new Set(['month', 'week', 'agenda', 'teamLoad', 'conflicts']);

    return {
        defaultView: allowedViews.has(defaultView) ? defaultView : fallback.defaultView,
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
            source.showWeekends === undefined
                ? fallback.showWeekends
                : source.showWeekends === true,
        autoExpandDayHeight:
            source.autoExpandDayHeight === undefined
                ? fallback.autoExpandDayHeight
                : source.autoExpandDayHeight === true,
        wrapEventTitles:
            source.wrapEventTitles === undefined
                ? fallback.wrapEventTitles
                : source.wrapEventTitles === true,
        compactEventDensity: source.compactEventDensity === true,
        allowedSelectedUserIds: normalizeAllowedSelectedUserIds(
            source.allowedSelectedUserIds,
            fallback.allowedSelectedUserIds
        ),
        isActive: source.isActive === undefined ? fallback.isActive : source.isActive === true
    };
}

export default class CalendarSecurityManager extends LightningElement {
    @track users = [];
    @track calendarViews = [];
    @track allAccessRows = [];

    @track selectedUserId;
    @track selectedUserName = '';

    @track userSearch = '';
    @track calendarSearch = '';
    @track approvedSelectedUsersSearch = '';

    @track isOpen = false;
    @track isBusy = false;
    @track isSaving = false;
    @track isApprovedSelectedUsersOpen = false;
    @track applyingAllUsersFieldName = '';

    @track activeTab = ACCESS_TAB;
    @track layoutDraft = createDefaultLayoutDraft();

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
                ? calendarViews.map((row) => this.normalizeCalendarView(row))
                : [];

            if (this.users.length > 0 && !this.selectedUserId) {
                await this.loadUserAccess(this.users[0].id);
            }
        } catch (error) {
            this.showError('Unable to load calendar security.', error);
        }
    }

    normalizeCalendarView(row) {
        return {
            id: row?.id || row?.Id || '',
            name: row?.name || row?.Name || '',
            ownerId: row?.ownerId || row?.OwnerId || '',
            ownerName: row?.ownerName || row?.OwnerName || '',
            startField: row?.startField || row?.StartField || '',
            endField: row?.endField || row?.EndField || '',
            displayField: row?.displayField || row?.DisplayField || '',
            listViewFilterId: row?.listViewFilterId || row?.ListViewFilterId || '',
            isDisplayed:
                row?.isDisplayed !== undefined
                    ? row.isDisplayed === true
                    : row?.IsDisplayed === true
        };
    }

    buildAccessRow(viewRow, existingRule) {
        return {
            id: viewRow.id,
            name: viewRow.name,
            ownerId: viewRow.ownerId,
            ownerName: viewRow.ownerName || '',
            startField: viewRow.startField || '',
            endField: viewRow.endField || '',
            displayField: viewRow.displayField || '',
            listViewFilterId: viewRow.listViewFilterId || '',
            isDisplayed: viewRow.isDisplayed === true,

            canView: existingRule ? existingRule.canView === true : false,
            canCreate: existingRule ? existingRule.canCreate === true : false,
            canEdit: existingRule ? existingRule.canEdit === true : false,
            canDelete: existingRule ? existingRule.canDelete === true : false,
            canAssignUsers: existingRule ? existingRule.canAssignUsers === true : false,
            canManageSecurity: existingRule ? existingRule.canManageSecurity === true : false,
            isActive: existingRule ? existingRule.isActive === true : false,
            notes: existingRule ? existingRule.notes || '' : ''
        };
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

        return this.allAccessRows.filter((row) => {
            if (!search) {
                return true;
            }

            return (
                (row.name || '').toLowerCase().includes(search) ||
                (row.ownerName || '').toLowerCase().includes(search) ||
                (row.startField || '').toLowerCase().includes(search) ||
                (row.displayField || '').toLowerCase().includes(search)
            );
        });
    }

    get hasVisibleRows() {
        return this.visibleRows.length > 0;
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
        const totalCount = this.defaultAllowedSelectedUserIds.length;
        const approvedCount = (this.layoutDraft?.allowedSelectedUserIds || []).length;

        if (!totalCount || approvedCount === totalCount) {
            return 'All active users approved';
        }

        if (!approvedCount) {
            return 'No approved users';
        }

        return `${approvedCount} approved user${approvedCount === 1 ? '' : 's'}`;
    }

    get approvedSelectedUsersSummary() {
        const approvedIds = new Set(this.layoutDraft?.allowedSelectedUserIds || []);
        const approvedNames = (this.users || [])
            .filter((row) => approvedIds.has(row.id))
            .map((row) => row.name)
            .filter(Boolean);

        if (!approvedNames.length) {
            return 'This user will not see any names in the Selected Users picker.';
        }

        if (approvedNames.length === this.defaultAllowedSelectedUserIds.length) {
            return 'This user can see every active user in the Selected Users picker.';
        }

        return approvedNames.join(', ');
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
                .map((viewRow) => this.buildAccessRow(viewRow, existingRules.get(viewRow.id)))
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

            return updated;
        });

        this.enforceAccessibleDefaultCalendar();
        this.cacheCurrentLayoutDraft();
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

            const payload = this.allAccessRows.map((row) => ({
                calendarViewId: row.id,
                calendarViewName: row.name,
                calendarViewOwnerId: row.ownerId,
                canView: row.canView,
                canCreate: row.canCreate,
                canEdit: row.canEdit,
                canDelete: row.canDelete,
                canAssignUsers: row.canAssignUsers,
                canManageSecurity: row.canManageSecurity,
                isActive: row.isActive,
                notes: row.notes
            }));

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
}