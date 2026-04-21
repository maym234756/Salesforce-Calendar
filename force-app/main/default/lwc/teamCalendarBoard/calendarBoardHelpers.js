/**
 * Pure helper functions used by teamCalendarBoard.
 * Extracted to reduce the main component file size.
 */

const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeCalendarHexColor(rawValue, fallback = null) {
    if (typeof rawValue !== 'string') {
        return fallback;
    }

    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) {
        return fallback;
    }

    const withHash = normalized.startsWith('#') ? normalized : `#${normalized}`;
    return HEX_COLOR_REGEX.test(withHash) ? withHash : fallback;
}

function normalizeCalendarColorOverrides(rawValue) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        return {};
    }

    return Object.entries(rawValue).reduce((result, [calendarId, color]) => {
        const normalizedCalendarId = typeof calendarId === 'string' ? calendarId.trim() : '';
        const normalizedColor = normalizeCalendarHexColor(color);

        if (normalizedCalendarId && normalizedColor) {
            result[normalizedCalendarId] = normalizedColor;
        }

        return result;
    }, {});
}

export function createDefaultLayoutPreference(overrides = {}) {
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
        isActive: true,
        ...overrides
    };
}

export function normalizeLayoutPreference(rawValue) {
    const fallback = createDefaultLayoutPreference();
    const source = rawValue || {};

    return {
        defaultView:
            ['month', 'week', 'day', 'agenda', 'teamLoad', 'conflicts'].includes(source.defaultView)
                ? source.defaultView
                : 'month',
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

export function createDefaultGoogleConnection(overrides = {}) {
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

export function createContextLink(key, label, recordId, objectApiName, recordName) {
    return {
        key,
        label,
        recordId,
        objectApiName,
        recordName: recordName || ''
    };
}

export function dedupeContextLinks(links) {
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

export function isInContractStage(value) {
    return String(value || '').trim().toLowerCase() === 'in contract';
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
