import { LightningElement, api } from 'lwc';

function createDefaultLayoutSettings() {
    return {
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
        compactEventDensity: false
    };
}

function normalizeLayoutSettings(rawValue) {
    const fallback = createDefaultLayoutSettings();
    const source = rawValue || {};

    return {
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
        compactEventDensity: source.compactEventDensity === true
    };
}

/**
 * @fires CalendarToolbar#viewchange
 * @fires CalendarToolbar#calendarchange
 * @fires CalendarToolbar#statuschange
 * @fires CalendarToolbar#userselectionchange
 * @fires CalendarToolbar#usercalendaropen
 * @fires CalendarToolbar#usercalendarselectionchange
 * @fires CalendarToolbar#usercalendarmenuclose
 * @fires CalendarToolbar#layoutchange
 * @fires CalendarToolbar#generatepdf
 * @fires CalendarToolbar#googledisconnect
 * @fires CalendarToolbar#googleimportaction
 * @fires CalendarToolbar#googleexportaction
 */
export default class CalendarToolbar extends LightningElement {
    @api rangeLabel = '';
    @api eventCount = 0;

    @api currentView = 'month';
    @api viewOptions = [];

    @api selectedCalendarId = '';
    @api calendarOptions = [];

    @api selectedStatus = '';
    @api statusOptions = [];

    @api googleImportActionLabel = '';
    @api googleImportActionDisabled = false;
    @api googleExportActionLabel = '';
    @api googleExportActionDisabled = false;

    @api userOptions = [];
    @api activeUserOptions = [];

    @api selectedUserIds = [];
    @api selectedUsers = [];

    @api selectedUserCount = 0;
    @api activeUserCount = 0;

    @api maxSelectedUsers = 20;
    @api maxUsers = 20;

    @api selectedUsersDetailed = [];
    @api selectedUserDetails = [];

    @api activeUserCalendarMenu;
    @api activeUserMenu;

    _userLayoutPreference = createDefaultLayoutSettings();
    layoutSettings = createDefaultLayoutSettings();

    isUserMenuOpen = false;
    isFilterMenuOpen = false;

    @api
    get userLayoutPreference() {
        return this._userLayoutPreference;
    }

    set userLayoutPreference(value) {
        this._userLayoutPreference = normalizeLayoutSettings(value);
        this.layoutSettings = {
            ...this.layoutSettings,
            ...this._userLayoutPreference
        };
    }

    get toolbarClass() {
        let classes = this.layoutSettings.compactEventDensity
            ? 'toolbar toolbar--compact'
            : 'toolbar';

        if (!this.showSidePanel) {
            classes += ' toolbar--single-column';
        }

        return classes;
    }

    get normalizedViewOptions() {
        return Array.isArray(this.viewOptions) ? this.viewOptions : [];
    }

    get normalizedCalendarOptions() {
        return Array.isArray(this.calendarOptions) ? this.calendarOptions : [];
    }

    get normalizedStatusOptions() {
        return Array.isArray(this.statusOptions) ? this.statusOptions : [];
    }

    get normalizedUserOptionsSource() {
        if (Array.isArray(this.activeUserOptions) && this.activeUserOptions.length) {
            return this.activeUserOptions;
        }

        return Array.isArray(this.userOptions) ? this.userOptions : [];
    }

    get normalizedSelectedUserIds() {
        if (Array.isArray(this.selectedUserIds)) {
            return this.selectedUserIds;
        }

        if (Array.isArray(this.selectedUsers)) {
            return this.selectedUsers;
        }

        return [];
    }

    get normalizedSelectedUsersDetailed() {
        if (Array.isArray(this.selectedUsersDetailed) && this.selectedUsersDetailed.length) {
            return this.selectedUsersDetailed;
        }

        if (Array.isArray(this.selectedUserDetails)) {
            return this.selectedUserDetails;
        }

        return [];
    }

    get normalizedMaxSelectedUsers() {
        const directValue = Number(this.maxSelectedUsers);
        if (!Number.isNaN(directValue) && directValue > 0) {
            return directValue;
        }

        const aliasValue = Number(this.maxUsers);
        if (!Number.isNaN(aliasValue) && aliasValue > 0) {
            return aliasValue;
        }

        return 20;
    }

    get normalizedSelectedUserCount() {
        const explicitValue = Number(this.selectedUserCount);
        if (!Number.isNaN(explicitValue) && explicitValue >= 0) {
            return explicitValue;
        }

        return this.normalizedSelectedUserIds.length;
    }

    get hasSelectedUsers() {
        return this.normalizedSelectedUsersDetailed.length > 0;
    }

    get hasUserOptions() {
        return this.normalizedUserOptions.length > 0;
    }

    get selectedUserCountLabel() {
        return `${this.normalizedSelectedUserCount} / ${this.normalizedMaxSelectedUsers} selected`;
    }

    get userTriggerLabel() {
        const count = this.normalizedSelectedUserCount;
        return count === 0 ? 'Select Users' : `Edit Users (${count})`;
    }

    get userLimitMessage() {
        if (this.normalizedSelectedUserCount >= this.normalizedMaxSelectedUsers) {
            return `You have reached the ${this.normalizedMaxSelectedUsers}-user limit.`;
        }

        return `Select up to ${this.normalizedMaxSelectedUsers} users.`;
    }

    get normalizedUserOptions() {
        const selectedIds = new Set(this.normalizedSelectedUserIds);
        const limitReached = selectedIds.size >= this.normalizedMaxSelectedUsers;

        return this.normalizedUserOptionsSource.map((option, index) => {
            const id =
                option && (option.id || option.value)
                    ? option.id || option.value
                    : `user-${index}`;
            const label =
                option && (option.label || option.name)
                    ? option.label || option.name
                    : `User ${index + 1}`;
            const checked = selectedIds.has(id);

            return {
                id,
                label,
                checked,
                disabled: !checked && limitReached
            };
        });
    }

    get showTodayButton() {
        return this.layoutSettings.showTodayButton;
    }

    get showRefreshButton() {
        return this.layoutSettings.showRefreshButton;
    }

    get showPrevNextButtons() {
        return this.layoutSettings.showPrevNextButtons;
    }

    get showNewButton() {
        return this.layoutSettings.showNewButton;
    }

    get showFiltersButton() {
        return this.layoutSettings.showFiltersButton;
    }

    get showSelectedUsersPanel() {
        return this.layoutSettings.showSelectUsersBox;
    }

    get showFilterControls() {
        return this.layoutSettings.showFilterControls;
    }

    get resolvedActiveUserCalendarMenu() {
        return this.activeUserCalendarMenu || this.activeUserMenu || null;
    }

    get hasActiveUserCalendarMenu() {
        return Boolean(this.resolvedActiveUserCalendarMenu);
    }

    get showGooglePanel() {
        return true;
    }

    get showSidePanel() {
        return true;
    }

    get resolvedGoogleImportActionLabel() {
        return this.googleImportActionLabel || 'Google > Salesforce';
    }

    get resolvedGoogleExportActionLabel() {
        return this.googleExportActionLabel || 'Salesforce > Google';
    }

    emitToday() {
        this.dispatchEvent(new CustomEvent('today'));
    }

    emitRefresh() {
        this.dispatchEvent(new CustomEvent('refresh'));
    }

    emitPrev() {
        this.dispatchEvent(new CustomEvent('prev'));
    }

    emitNext() {
        this.dispatchEvent(new CustomEvent('next'));
    }

    emitNew() {
        this.dispatchEvent(new CustomEvent('new'));
    }

    emitGeneratePdf() {
        this.dispatchEvent(new CustomEvent('generatepdf'));
    }

    emitGoogleImportAction() {
        this.dispatchEvent(new CustomEvent('googleimportaction'));
    }

    emitGoogleExportAction() {
        this.dispatchEvent(new CustomEvent('googleexportaction'));
    }

    handleViewChange(event) {
        this.dispatchEvent(
            new CustomEvent('viewchange', {
                detail: event.detail.value
            })
        );
    }

    handleCalendarChange(event) {
        this.dispatchEvent(
            new CustomEvent('calendarchange', {
                detail: event.detail.value
            })
        );
    }

    handleStatusChange(event) {
        this.dispatchEvent(
            new CustomEvent('statuschange', {
                detail: event.detail.value
            })
        );
    }

    toggleUserMenu() {
        this.isUserMenuOpen = !this.isUserMenuOpen;
    }

    closeUserMenu() {
        this.isUserMenuOpen = false;
    }

    toggleFilterMenu() {
        this.isFilterMenuOpen = !this.isFilterMenuOpen;
    }

    closeFilterMenu() {
        this.isFilterMenuOpen = false;
    }

    handleFilterToggle(event) {
        const toggleName = event.target.name;
        const checked = Boolean(event.target.checked);

        if (toggleName === 'selectedUsersPanel') {
            this.layoutSettings = {
                ...this.layoutSettings,
                showSelectUsersBox: checked
            };
        } else if (toggleName === 'sidebarFilters') {
            this.layoutSettings = {
                ...this.layoutSettings,
                showFilterControls: checked
            };
        }

        this.dispatchLayoutChange();
    }

    resetFilterLayout() {
        this.layoutSettings = {
            ...this.layoutSettings,
            showSelectUsersBox: this._userLayoutPreference.showSelectUsersBox,
            showFilterControls: this._userLayoutPreference.showFilterControls
        };

        this.dispatchLayoutChange();
    }

    dispatchLayoutChange() {
        this.dispatchEvent(
            new CustomEvent('layoutchange', {
                detail: {
                    settings: { ...this.layoutSettings }
                }
            })
        );
    }

    handleUserToggle(event) {
        const toggledId = event.target.dataset.id;
        const isChecked = Boolean(event.target.checked);

        if (!toggledId) {
            return;
        }

        const nextIds = [...this.normalizedSelectedUserIds];
        const existingIndex = nextIds.indexOf(toggledId);

        if (isChecked && existingIndex === -1 && nextIds.length < this.normalizedMaxSelectedUsers) {
            nextIds.push(toggledId);
        }

        if (!isChecked && existingIndex !== -1) {
            nextIds.splice(existingIndex, 1);
        }

        this.dispatchEvent(
            new CustomEvent('userselectionchange', {
                detail: {
                    selectedUserIds: nextIds
                }
            })
        );
    }

    handleRemoveUser(event) {
        const removedId = event.currentTarget.dataset.id;
        if (!removedId) {
            return;
        }

        const nextIds = this.normalizedSelectedUserIds.filter((id) => id !== removedId);

        this.dispatchEvent(
            new CustomEvent('userselectionchange', {
                detail: {
                    selectedUserIds: nextIds
                }
            })
        );
    }

    handleSelectedUserClick(event) {
        const userId = event.currentTarget.dataset.id;
        if (!userId) {
            return;
        }

        this.dispatchEvent(
            new CustomEvent('usercalendaropen', {
                detail: { userId }
            })
        );
    }

    handleUserCalendarToggle(event) {
        const userId = event.target.dataset.userId;
        const calendarId = event.target.dataset.calendarId;
        const isChecked = Boolean(event.target.checked);
        const activeMenu = this.resolvedActiveUserCalendarMenu;

        if (!userId || !calendarId || !activeMenu) {
            return;
        }

        const nextIds = new Set(activeMenu.selectedCalendarIds || []);
        if (isChecked) {
            nextIds.add(calendarId);
        } else {
            nextIds.delete(calendarId);
        }

        this.dispatchEvent(
            new CustomEvent('usercalendarselectionchange', {
                detail: {
                    userId,
                    selectedCalendarIds: [...nextIds]
                }
            })
        );
    }

    handleUserCalendarMenuClose() {
        this.dispatchEvent(new CustomEvent('usercalendarmenuclose'));
    }
}
