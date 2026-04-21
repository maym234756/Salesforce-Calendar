export function buildEmptyGoogleCalendarOptions() {
    return [{ label: 'Select Google calendar', value: '' }];
}

export function buildGoogleSyncCalendarDefinitions(
    calendarDefinitions = [],
    isCalendarViewDefinition = () => false
) {
    return (calendarDefinitions || []).filter(
        (definition) => definition && !isCalendarViewDefinition(definition)
    );
}

export function isGoogleSyncCalendarId(calendarId, googleSyncCalendarDefinitions = []) {
    if (!calendarId) {
        return false;
    }

    return (googleSyncCalendarDefinitions || []).some(
        (definition) => definition.id === calendarId
    );
}

function buildTeamCalendarModalOptions(definitions = [], selectedValue = '') {
    return [
        {
            label: 'Select a Team Calendar',
            value: '',
            selected: !selectedValue
        },
        ...(definitions || []).map((definition) => ({
            label: definition.name,
            value: definition.id,
            selected: definition.id === selectedValue
        }))
    ];
}

function buildGoogleCalendarOptions(options = [], selectedValue = '') {
    return (Array.isArray(options) ? options : buildEmptyGoogleCalendarOptions()).map((option) => ({
        ...option,
        selected: (option.value || '') === selectedValue
    }));
}

export function buildGoogleSyncViewState({
    selectedCalendarId = '',
    isCalendarViewBackedSelection = false,
    selectedCalendarDefinition = null,
    isGoogleBusy = false,
    googleConnection = {},
    googleCalendarOptions = buildEmptyGoogleCalendarOptions(),
    googleImportModalCalendarId = '',
    googleExportModalCalendarId = '',
    googleSyncCalendarDefinitions = [],
    syncStatus = '',
    syncMessage = '',
    googleImportStatus = '',
    googleImportMessage = ''
} = {}) {
    const selectedGoogleCalendarId = googleConnection?.googleCalendarId || '';
    const selectedImportCalendarIds = Array.isArray(googleConnection?.googleImportCalendarIds)
        ? googleConnection.googleImportCalendarIds
        : [];
    const resolvedImportModalCalendarId = isGoogleSyncCalendarId(
        googleImportModalCalendarId,
        googleSyncCalendarDefinitions
    )
        ? googleImportModalCalendarId
        : isGoogleSyncCalendarId(selectedCalendarId, googleSyncCalendarDefinitions)
            ? selectedCalendarId
            : '';
    const resolvedExportModalCalendarId = isGoogleSyncCalendarId(
        googleExportModalCalendarId,
        googleSyncCalendarDefinitions
    )
        ? googleExportModalCalendarId
        : isGoogleSyncCalendarId(selectedCalendarId, googleSyncCalendarDefinitions)
            ? selectedCalendarId
            : '';
    const isImportModalCalendarSelected = Boolean(resolvedImportModalCalendarId);
    const isImportModalUsingCurrentCalendar =
        resolvedImportModalCalendarId === (selectedCalendarId || '');
    const isExportModalCalendarSelected = Boolean(resolvedExportModalCalendarId);
    const isExportModalUsingCurrentCalendar =
        resolvedExportModalCalendarId === (selectedCalendarId || '');
    const isExportModalConnected =
        isExportModalUsingCurrentCalendar && googleConnection.connected === true;
    const isImportModalReadyForConnection =
        isImportModalCalendarSelected && isImportModalUsingCurrentCalendar;
    const isImportModalConfigured =
        isImportModalReadyForConnection && googleConnection.configured === true;
    const isImportModalConnected = googleConnection.connected === true;
    const importCalendarOptions = (Array.isArray(googleCalendarOptions)
        ? googleCalendarOptions
        : buildEmptyGoogleCalendarOptions()
    ).filter((option) => option.value);

    let importActionLabel = 'Import to Salesforce';
    if (!selectedCalendarId) {
        importActionLabel = 'Select Calendar';
    } else if (isCalendarViewBackedSelection) {
        importActionLabel = 'Calendar View';
    } else if (!googleConnection.configured) {
        importActionLabel = 'Setup Needed';
    }

    let exportActionLabel = 'Sync to Google';
    if (!selectedCalendarId) {
        exportActionLabel = 'Select Calendar';
    } else if (isCalendarViewBackedSelection) {
        exportActionLabel = 'Calendar View';
    } else if (!googleConnection.configured) {
        exportActionLabel = 'Setup Needed';
    }

    let importStatusMessage = googleConnection.message || '';
    if (isCalendarViewBackedSelection) {
        if (selectedCalendarDefinition) {
            importStatusMessage = `${selectedCalendarDefinition.name} is powered by ${selectedCalendarDefinition.sobjectType} via list view ${selectedCalendarDefinition.listViewFilterId}. Google Sync only applies to Team Calendar event calendars.`;
        } else {
            importStatusMessage = 'This selection is backed by a Salesforce Calendar View.';
        }
    } else if (isGoogleBusy) {
        importStatusMessage = 'Please wait while the Google action finishes.';
    } else if (googleImportMessage) {
        importStatusMessage = googleImportMessage;
    }

    let importModalTitle = 'Choose Salesforce Calendar';
    if (isImportModalCalendarSelected && isImportModalConfigured) {
        importModalTitle = isImportModalConnected
            ? 'Choose Google Calendars'
            : 'Connect Google Calendar';
    }

    let exportModalTitle = 'Choose Salesforce Calendar';
    if (isExportModalCalendarSelected) {
        exportModalTitle = isExportModalConnected
            ? 'Choose Google Calendar'
            : 'Connect Google Calendar';
    }

    let importModalCalendarHelpText =
        'Continue to connect Google and choose the Google calendars to import.';
    if (!(googleSyncCalendarDefinitions || []).length) {
        importModalCalendarHelpText = 'No Team Calendars are available for Google sync.';
    } else if (!isImportModalCalendarSelected) {
        importModalCalendarHelpText =
            'Choose which Salesforce Team Calendar should receive imported Google events.';
    } else if (!isImportModalUsingCurrentCalendar) {
        importModalCalendarHelpText =
            'Continue to load Google connection settings for the selected Salesforce Team Calendar.';
    } else if (!googleConnection.configured) {
        importModalCalendarHelpText = 'Google connection settings are unavailable right now.';
    }

    let exportHelpText =
        'Choose the single Google calendar that should receive Salesforce events.';
    if (!isExportModalCalendarSelected) {
        exportHelpText =
            'Choose which Salesforce Team Calendar should sync outward to Google.';
    } else if (!isExportModalUsingCurrentCalendar) {
        exportHelpText =
            'Continue to load Google connection settings for the selected Salesforce Team Calendar.';
    } else if (!isExportModalConnected) {
        exportHelpText = 'Connect Google first, then choose which Google calendar to sync.';
    } else if ((googleCalendarOptions || []).length <= 1) {
        exportHelpText = 'No writable Google calendars were returned for this Google account.';
    }

    let importHelpText =
        'Choose which Google calendars should feed back into this Salesforce Team Calendar.';
    if (isCalendarViewBackedSelection) {
        importHelpText = 'Google import is only available for Team Calendar records.';
    } else if (!googleConnection.configured) {
        importHelpText = 'Google connection settings are unavailable right now.';
    } else if (!googleConnection.connected) {
        importHelpText = 'Connect Google first, then choose one or more Google calendars to import.';
    } else if (!importCalendarOptions.length) {
        importHelpText = 'No writable Google calendars were returned for this Google account.';
    }

    return {
        importActionLabel,
        importActionDisabled: isGoogleBusy,
        exportActionLabel,
        exportActionDisabled: isGoogleBusy,
        importStatusMessage,
        importModalTitle,
        exportModalTitle,
        importModalCalendarHelpText,
        importHelpText,
        exportHelpText,
        importModalSelectOptions: buildTeamCalendarModalOptions(
            googleSyncCalendarDefinitions,
            resolvedImportModalCalendarId
        ),
        exportModalSelectOptions: buildTeamCalendarModalOptions(
            googleSyncCalendarDefinitions,
            resolvedExportModalCalendarId
        ),
        exportSelectOptions: buildGoogleCalendarOptions(
            googleCalendarOptions,
            selectedGoogleCalendarId
        ),
        importCalendarOptions,
        selectedImportCalendarIds,
        calendarSelectionDisabled:
            isGoogleBusy || !isExportModalUsingCurrentCalendar || !googleConnection.connected,
        importCalendarsDisabled:
            isGoogleBusy || !selectedCalendarId || !googleConnection.connected,
        resolvedImportModalCalendarId,
        resolvedExportModalCalendarId,
        isImportModalCalendarSelected,
        isImportModalUsingCurrentCalendar,
        isImportModalConfigured,
        isImportModalConnected,
        isExportModalCalendarSelected,
        isExportModalUsingCurrentCalendar,
        isExportModalConnected,
        googleSyncCalendarDefinitions,
        selectedGoogleCalendarId,
        syncStatus,
        syncMessage,
        googleImportStatus,
        googleImportMessage
    };
}