export const ACCESS_TAB = 'access';
export const LAYOUT_TAB = 'layout';

export function createDefaultEventTemplateDraft() {
    return {
        id: '',
        name: '',
        durationMinutes: 60,
        calendarId: '',
        calendarName: '',
        defaultStatus: 'Planned',
        notes: '',
        isActive: true
    };
}

export function normalizeEventTemplateDraft(rawValue) {
    const fallback = createDefaultEventTemplateDraft();
    const source = rawValue || {};
    const parsedDuration = parseInt(source.durationMinutes, 10);

    return {
        id: source.id || '',
        name: source.name || '',
        durationMinutes: Number.isNaN(parsedDuration) || parsedDuration <= 0 ? fallback.durationMinutes : parsedDuration,
        calendarId: source.calendarId || '',
        calendarName: source.calendarName || '',
        defaultStatus: source.defaultStatus || fallback.defaultStatus,
        notes: source.notes || '',
        isActive: source.isActive !== false
    };
}

export function normalizeEventTemplateRow(rawValue) {
    return normalizeEventTemplateDraft(rawValue);
}

export function buildEventTemplateSummary(row) {
    const normalized = normalizeEventTemplateRow(row);
    return [
        `${normalized.durationMinutes} min`,
        normalized.calendarName || 'No calendar',
        normalized.defaultStatus || 'Planned'
    ].join(' • ');
}

export const LAYOUT_FIELD_LABELS = {
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

export const TOOLBAR_LAYOUT_FIELDS = [
    'showSecurityButton',
    'showRefreshButton',
    'showTodayButton',
    'showPrevNextButtons',
    'showNewButton',
    'showFiltersButton',
    'showSyncPanel'
];

export const BOARD_LAYOUT_FIELDS = [
    'showSelectUsersBox',
    'showFilterControls',
    'showWeekends',
    'autoExpandDayHeight',
    'wrapEventTitles',
    'compactEventDensity',
    'isActive'
];

export function normalizeAllowedSelectedUserIds(rawValue, fallbackIds = []) {
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

function normalizeCalendarColorOverrides(rawValue) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        return {};
    }

    return Object.entries(rawValue).reduce((result, [calendarId, color]) => {
        const normalizedCalendarId = typeof calendarId === 'string' ? calendarId.trim() : '';
        const normalizedColor = typeof color === 'string' ? color.trim() : '';

        if (normalizedCalendarId && normalizedColor) {
            result[normalizedCalendarId] = normalizedColor;
        }

        return result;
    }, {});
}

export function createDefaultLayoutDraft(defaultAllowedSelectedUserIds = []) {
    return {
        defaultView: 'month',
        defaultCalendarViewId: '',
        defaultStatus: '',
        calendarColorOverrides: {},
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
        allowedSelectedUserIds: normalizeAllowedSelectedUserIds(defaultAllowedSelectedUserIds),
        isActive: true
    };
}

export function normalizeLayoutDraft(rawValue, defaultAllowedSelectedUserIds = []) {
    const fallback = createDefaultLayoutDraft(defaultAllowedSelectedUserIds);
    const source = rawValue || {};

    let defaultView = typeof source.defaultView === 'string' ? source.defaultView : '';
    if (defaultView.toLowerCase() === 'teamload') {
        defaultView = 'teamLoad';
    }

    const allowedViews = new Set(['month', 'week', 'day', 'agenda', 'teamLoad', 'conflicts']);

    return {
        defaultView: allowedViews.has(defaultView) ? defaultView : fallback.defaultView,
        defaultCalendarViewId: source.defaultCalendarViewId || '',
        defaultStatus: source.defaultStatus || '',
        calendarColorOverrides: normalizeCalendarColorOverrides(source.calendarColorOverrides),
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

export function normalizeAccessRow(row) {
    const normalized = {
        ...row,
        canView: row?.canView === true,
        canCreate: row?.canCreate === true,
        canEdit: row?.canEdit === true,
        canDelete: row?.canDelete === true,
        canAssignUsers: row?.canAssignUsers === true,
        canManageSecurity: row?.canManageSecurity === true,
        isActive: row?.isActive === true
    };

    const hasElevatedAccess =
        normalized.canCreate ||
        normalized.canEdit ||
        normalized.canDelete ||
        normalized.canAssignUsers ||
        normalized.canManageSecurity;

    if (hasElevatedAccess) {
        normalized.canView = true;
        normalized.isActive = true;
    }

    if (!normalized.canView) {
        normalized.canCreate = false;
        normalized.canEdit = false;
        normalized.canDelete = false;
        normalized.canAssignUsers = false;
        normalized.canManageSecurity = false;
    }

    return normalized;
}

export function normalizeCalendarView(row) {
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

export function buildAccessRow(viewRow, existingRule) {
    return normalizeAccessRow({
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
    });
}

export function rowHasGrantedAccess(row) {
    return Boolean(
        row &&
            (row.canView === true ||
                row.canCreate === true ||
                row.canEdit === true ||
                row.canDelete === true ||
                row.canAssignUsers === true ||
                row.canManageSecurity === true)
    );
}

export function applyAccessPresetToRows(rows, rowIds, preset) {
    return rows.map((row) => {
        if (!rowIds.has(row.id)) {
            return row;
        }

        if (preset === 'viewOnly') {
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

        if (preset === 'editor') {
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

        if (preset === 'clear') {
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
}

export function getPresetLabel(preset) {
    const labelByPreset = {
        viewOnly: 'View Only',
        editor: 'Editor',
        clear: 'Clear Access'
    };

    return labelByPreset[preset] || 'Preset';
}

export function getRowPresetSummary(row) {
    if (!row || !row.isActive) {
        return 'Inactive';
    }

    if (
        row.canView === true &&
        row.canCreate !== true &&
        row.canEdit !== true &&
        row.canDelete !== true &&
        row.canAssignUsers !== true &&
        row.canManageSecurity !== true
    ) {
        return 'View Only';
    }

    if (row.canView === true && row.canCreate === true && row.canEdit === true) {
        return 'Editor';
    }

    if (!rowHasGrantedAccess(row)) {
        return 'No Access';
    }

    return 'Custom';
}

export function buildToolbarVisibilitySummary(layoutDraft) {
    const enabledCount = TOOLBAR_LAYOUT_FIELDS.filter(
        (fieldName) => layoutDraft?.[fieldName] === true
    ).length;

    return `${enabledCount} of ${TOOLBAR_LAYOUT_FIELDS.length} toolbar controls visible`;
}

export function buildBoardLayoutSummary(layoutDraft) {
    const flags = [];

    flags.push(layoutDraft?.showSelectUsersBox ? 'Selected Users visible' : 'Selected Users hidden');
    flags.push(layoutDraft?.showFilterControls ? 'filters visible' : 'filters hidden');
    flags.push(layoutDraft?.showWeekends ? 'weekends shown' : 'weekends hidden');
    flags.push(layoutDraft?.compactEventDensity ? 'compact density' : 'standard density');

    return flags.join(' \u2022 ');
}

export function buildSelectedUsersVisibilitySummaryLine(layoutDraft, defaultCount) {
    const approvedCount = (layoutDraft?.allowedSelectedUserIds || []).length;

    if (!approvedCount) {
        return 'No users will appear in the Selected Users picker.';
    }

    if (approvedCount === defaultCount) {
        return 'All active users will appear in the Selected Users picker.';
    }

    return `${approvedCount} active users will appear in the Selected Users picker.`;
}

export function buildLayoutActivationSummary(layoutDraft) {
    return layoutDraft?.isActive
        ? 'Layout preferences are active for this user.'
        : 'Layout preferences are saved but inactive for this user.';
}

export function buildApprovedSelectedUsersSummary(users, layoutDraft, defaultCount) {
    const approvedIds = new Set(layoutDraft?.allowedSelectedUserIds || []);
    const approvedNames = (users || [])
        .filter((row) => approvedIds.has(row.id))
        .map((row) => row.name)
        .filter(Boolean);

    if (!approvedNames.length) {
        return 'This user will not see any names in the Selected Users picker.';
    }

    if (approvedNames.length === defaultCount) {
        return 'This user can see every active user in the Selected Users picker.';
    }

    return approvedNames.join(', ');
}

export function buildApprovedSelectedUsersButtonLabel(layoutDraft, defaultCount) {
    const approvedCount = (layoutDraft?.allowedSelectedUserIds || []).length;

    if (!defaultCount || approvedCount === defaultCount) {
        return 'All active users approved';
    }

    if (!approvedCount) {
        return 'No approved users';
    }

    return `${approvedCount} approved user${approvedCount === 1 ? '' : 's'}`;
}

export function buildApprovedSelectedUsersCountLabel(layoutDraft, defaultCount) {
    const approvedCount = (layoutDraft?.allowedSelectedUserIds || []).length;

    return `${approvedCount} of ${defaultCount} active user${defaultCount === 1 ? '' : 's'} approved`;
}
