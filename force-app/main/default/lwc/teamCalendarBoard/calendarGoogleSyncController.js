import pushEventsForCalendar from '@salesforce/apex/GoogleCalendarSyncService.pushEventsForCalendar';
import importEventsFromGoogle from '@salesforce/apex/GoogleCalendarSyncService.importEventsFromGoogle';
import getConnectionState from '@salesforce/apex/GoogleCalendarConnectionService.getConnectionState';
import getAuthenticationUrl from '@salesforce/apex/GoogleCalendarConnectionService.getAuthenticationUrl';
import disconnectGoogle from '@salesforce/apex/GoogleCalendarConnectionService.disconnectGoogle';
import listAvailableCalendars from '@salesforce/apex/GoogleCalendarConnectionService.listAvailableCalendars';
import saveCalendarSelection from '@salesforce/apex/GoogleCalendarConnectionService.saveCalendarSelection';
import saveImportCalendarSelections from '@salesforce/apex/GoogleCalendarConnectionService.saveImportCalendarSelections';
import { getVisibleRange } from 'c/calendarUtils';
import { createDefaultGoogleConnection } from './calendarBoardHelpers';
import { buildEmptyGoogleCalendarOptions } from './calendarGoogleSyncState';

const GOOGLE_CONNECT_MESSAGE = 'Complete Google sign-in in the new tab, then click I Finished Connecting.';

function resolveSingleValue(event) {
    return event.detail?.value || event.target?.value || '';
}

function resolveArrayValue(event) {
    if (Array.isArray(event.detail?.value)) {
        return event.detail.value;
    }

    if (Array.isArray(event.detail)) {
        return event.detail;
    }

    return [];
}

function resetGoogleSyncFeedback(context) {
    context.syncStatus = '';
    context.syncMessage = '';
    context.googleImportStatus = '';
    context.googleImportMessage = '';
}

function closeGoogleSyncModals(context) {
    context.showGoogleConnectModal = false;
    context.showGoogleImportModal = false;
    context.showGoogleExportModal = false;
}

function resetGoogleCalendarOptions(context) {
    context.googleCalendarOptions = buildEmptyGoogleCalendarOptions();
}

async function switchGoogleCalendarContext(context, calendarId) {
    context.selectedCalendarId = calendarId || '';
    resetGoogleSyncSelectionContext(context);
    await Promise.all([context.loadEvents(), context.loadGoogleConnectionState()]);
}

export function resetGoogleSyncSelectionContext(context) {
    resetGoogleSyncFeedback(context);
    closeGoogleSyncModals(context);
    context.calendarViewWireData = undefined;
    context.calendarViewWireError = undefined;
    resetGoogleCalendarOptions(context);
}

export function syncGoogleImportModalCalendarId(context) {
    context.googleImportModalCalendarId = context.isGoogleSyncCalendarId(context.selectedCalendarId)
        ? context.selectedCalendarId
        : '';
}

export function syncGoogleExportModalCalendarId(context) {
    context.googleExportModalCalendarId = context.isGoogleSyncCalendarId(context.selectedCalendarId)
        ? context.selectedCalendarId
        : '';
}

export async function handleGoogleExportCalendarSelectionChange(context, event) {
    if (!context.selectedCalendarId) {
        return;
    }

    const googleCalendarId = resolveSingleValue(event) || null;
    context.isGoogleBusy = true;

    try {
        const result = await saveCalendarSelection({
            calendarId: context.selectedCalendarId,
            googleCalendarId
        });

        context.syncStatus = result?.success ? 'Configured' : 'Error';
        context.syncMessage = result?.message || '';

        context.showToast(
            'Google Calendar',
            context.syncMessage || 'Google calendar selection saved.',
            result?.success ? 'success' : 'error'
        );
    } catch (error) {
        const message = context.extractErrorMessage(error);
        context.syncStatus = 'Error';
        context.syncMessage = message;
        context.showToast('Google Calendar Error', message, 'error');
    } finally {
        context.isGoogleBusy = false;
        await context.loadGoogleConnectionState();
    }
}

const GOOGLE_TOOLBAR_EVENT_HANDLERS = {
    googleimportaction: handleGoogleImportAction,
    googleexportaction: handleGoogleExportAction
};

const GOOGLE_MODAL_EVENT_HANDLERS = {
    googleconnectmodalclose: handleGoogleConnectModalClose,
    googleconnectmodallaunch: handleGoogleConnectModalLaunch,
    googleconnectmodalrefresh: handleGoogleConnectModalRefresh,
    googleimportmodalclose: handleGoogleImportModalClose,
    googleimportmodalcalendarchange: handleGoogleImportModalCalendarChange,
    googleimportmodallaunch: handleGoogleImportModalLaunch,
    googleimportmodalrefresh: handleGoogleImportModalRefresh,
    googleimportmodalcontinue: handleGoogleImportModalContinue,
    googleimportcalendarselectionchange: handleGoogleImportCalendarSelectionChange,
    googleexportmodalclose: handleGoogleExportModalClose,
    googleexportmodalcalendarchange: handleGoogleExportModalCalendarChange,
    googleexportmodallaunch: handleGoogleExportModalLaunch,
    googleexportmodalrefresh: handleGoogleExportModalRefresh,
    googleexportmodalcontinue: handleGoogleExportModalContinue,
    googleexportcalendarselectionchange: handleGoogleExportCalendarSelectionChange
};

export async function routeGoogleToolbarEvent(context, event) {
    const handler = GOOGLE_TOOLBAR_EVENT_HANDLERS[event?.type];

    if (!handler) {
        return false;
    }

    await handler(context, event);
    return true;
}

export async function routeGoogleModalEvent(context, event) {
    const handler = GOOGLE_MODAL_EVENT_HANDLERS[event?.type];

    if (!handler) {
        return false;
    }

    await handler(context, event);
    return true;
}

export async function handleGoogleImportCalendarSelectionChange(context, event) {
    if (!context.selectedCalendarId) {
        return;
    }

    const googleCalendarIds = resolveArrayValue(event);
    context.isGoogleBusy = true;

    try {
        const result = await saveImportCalendarSelections({
            calendarId: context.selectedCalendarId,
            googleCalendarIds
        });

        context.googleImportStatus = result?.success ? 'Configured' : 'Error';
        context.googleImportMessage = result?.message || '';

        context.showToast(
            'Google Import Calendars',
            context.googleImportMessage || 'Google import calendar selection saved.',
            result?.success ? 'success' : 'error'
        );
    } catch (error) {
        const message = context.extractErrorMessage(error);
        context.googleImportStatus = 'Error';
        context.googleImportMessage = message;
        context.showToast('Google Import Calendar Error', message, 'error');
    } finally {
        context.isGoogleBusy = false;
        await context.loadGoogleConnectionState();
    }
}

export async function handleGoogleConnectionRefresh(context) {
    resetGoogleSyncFeedback(context);
    await context.loadGoogleConnectionState();
}

export function handleGoogleImportModalClose(context) {
    context.showGoogleImportModal = false;
    syncGoogleImportModalCalendarId(context);
}

export function handleGoogleExportModalClose(context) {
    context.showGoogleExportModal = false;
    syncGoogleExportModalCalendarId(context);
}

export function handleGoogleImportModalCalendarChange(context, event) {
    context.googleImportModalCalendarId = resolveSingleValue(event);
}

export function handleGoogleExportModalCalendarChange(context, event) {
    context.googleExportModalCalendarId = resolveSingleValue(event);
}

export async function handleGoogleImportModalLaunch(context) {
    await startGoogleConnect(context);
}

export async function handleGoogleExportModalLaunch(context) {
    await startGoogleConnect(context);
}

export async function handleGoogleImportModalRefresh(context) {
    await handleGoogleConnectionRefresh(context);

    if (context.googleConnection.connected) {
        context.showToast('Google Connect', 'Google connection is ready.', 'success');
    }
}

export async function handleGoogleExportModalRefresh(context) {
    await handleGoogleConnectionRefresh(context);

    if (context.googleConnection.connected) {
        context.showToast('Google Connect', 'Google connection is ready.', 'success');
    }
}

export async function handleGoogleImportModalContinue(context) {
    const googleSyncViewState = context.googleSyncViewState;

    if (!googleSyncViewState.isImportModalCalendarSelected) {
        context.showToast(
            'Salesforce Calendar',
            'Choose which Salesforce Team Calendar should receive imported Google events.',
            'warning'
        );
        return;
    }

    if (!googleSyncViewState.isImportModalUsingCurrentCalendar) {
        await switchGoogleCalendarContext(context, googleSyncViewState.resolvedImportModalCalendarId);
        return;
    }

    if (!context.googleConnection.configured) {
        context.showToast(
            'Google Setup',
            'Google connection settings are unavailable right now.',
            'warning'
        );
        return;
    }

    if (!context.googleConnection.connected) {
        context.showToast(
            'Google Connect',
            'Complete the Google connection step first.',
            'warning'
        );
        return;
    }

    if (!googleSyncViewState.selectedImportCalendarIds.length) {
        context.showToast(
            'Google Import',
            'Choose at least one Google calendar before importing into Salesforce.',
            'warning'
        );
        return;
    }

    context.showGoogleImportModal = false;
    await runGoogleImportSync(context);
}

export async function handleGoogleExportModalContinue(context) {
    const googleSyncViewState = context.googleSyncViewState;

    if (!googleSyncViewState.isExportModalCalendarSelected) {
        context.showToast(
            'Salesforce Calendar',
            'Choose which Salesforce Team Calendar should sync out to Google.',
            'warning'
        );
        return;
    }

    if (!googleSyncViewState.isExportModalUsingCurrentCalendar) {
        await switchGoogleCalendarContext(context, googleSyncViewState.resolvedExportModalCalendarId);
        return;
    }

    if (!context.googleConnection.connected) {
        context.showToast(
            'Google Connect',
            'Complete the Google connection step first.',
            'warning'
        );
        return;
    }

    if (!context.googleConnection.googleCalendarId) {
        context.showToast(
            'Google Calendar',
            'Choose which Google calendar should receive Salesforce events.',
            'warning'
        );
        return;
    }

    context.showGoogleExportModal = false;
    await runGoogleSync(context);
}

export function handleGoogleConnectRequest(context) {
    if (!context.selectedCalendarId) {
        context.showToast('Google', 'Select a calendar first.', 'error');
        return;
    }

    if (context.isCalendarViewBackedSelection) {
        context.showToast(
            'Calendar View',
            'Google Sync only applies to Team Calendar event calendars, not Salesforce CalendarView list views.',
            'info'
        );
        return;
    }

    if (!context.googleConnection.configured) {
        context.showToast(
            'Google Setup',
            'Google connection settings are unavailable right now.',
            'warning'
        );
        return;
    }

    context.showGoogleConnectModal = true;
}

export function handleGoogleConnectModalClose(context) {
    context.showGoogleConnectModal = false;
}

export async function handleGoogleConnectModalLaunch(context) {
    await startGoogleConnect(context);
}

export async function handleGoogleConnectModalRefresh(context) {
    await handleGoogleConnectionRefresh(context);

    if (context.googleConnection.connected) {
        context.showGoogleConnectModal = false;
        context.showToast('Google Connect', 'Google connection is ready.', 'success');
    }
}

export async function loadGoogleConnectionState(context) {
    if (!context.selectedCalendarId || context.isCalendarViewBackedSelection) {
        context.googleConnection = createDefaultGoogleConnection();
        resetGoogleCalendarOptions(context);
        return;
    }

    try {
        const state = await getConnectionState({ calendarId: context.selectedCalendarId });
        context.googleConnection = createDefaultGoogleConnection(state || {});
        await loadGoogleCalendarOptions(context);
    } catch (error) {
        context.googleConnection = createDefaultGoogleConnection({
            status: 'Error',
            message: context.extractErrorMessage(error)
        });
        resetGoogleCalendarOptions(context);
    }
}

export async function loadGoogleCalendarOptions(context) {
    if (
        !context.selectedCalendarId ||
        context.isCalendarViewBackedSelection ||
        !context.googleConnection.configured ||
        !context.googleConnection.connected
    ) {
        resetGoogleCalendarOptions(context);
        return;
    }

    try {
        const rows = await listAvailableCalendars({ calendarId: context.selectedCalendarId });
        context.googleCalendarOptions = [
            ...buildEmptyGoogleCalendarOptions(),
            ...(Array.isArray(rows) ? rows : []).map((row) => ({
                label: row.primary ? `${row.label} (Primary)` : row.label,
                value: row.id
            }))
        ];
    } catch (error) {
        resetGoogleCalendarOptions(context);
        context.googleImportStatus = 'Error';
        context.googleImportMessage = context.extractErrorMessage(error);
    }
}

export function handleGoogleImportAction(context) {
    if (context.isCalendarViewBackedSelection) {
        context.googleImportModalCalendarId = '';
    } else {
        syncGoogleImportModalCalendarId(context);
    }

    context.showGoogleImportModal = true;
}

export function handleGoogleExportAction(context) {
    syncGoogleExportModalCalendarId(context);
    context.showGoogleExportModal = true;
}

export async function handleGoogleDisconnect(context) {
    if (!context.selectedCalendarId) {
        return;
    }

    context.isGoogleBusy = true;

    try {
        const result = await disconnectGoogle({ calendarId: context.selectedCalendarId });

        context.syncStatus = result?.success ? 'Disconnected' : 'Error';
        context.syncMessage = result?.message || '';
        context.googleImportStatus = context.syncStatus;
        context.googleImportMessage = context.syncMessage;

        context.showToast(
            'Google Disconnect',
            context.syncMessage || 'Google connection removed.',
            result?.success ? 'success' : 'error'
        );
    } catch (error) {
        const message = context.extractErrorMessage(error);
        context.syncStatus = 'Error';
        context.syncMessage = message;
        context.googleImportStatus = 'Error';
        context.googleImportMessage = message;
        context.showToast('Google Disconnect Error', message, 'error');
    } finally {
        context.isGoogleBusy = false;
        closeGoogleSyncModals(context);
        await context.loadGoogleConnectionState();
    }
}

export async function startGoogleConnect(context) {
    context.isGoogleBusy = true;

    try {
        const result = await getAuthenticationUrl({ calendarId: context.selectedCalendarId });
        const authUrl = result?.authUrl;

        if (!authUrl) {
            throw new Error(result?.message || 'Google authentication URL was not returned.');
        }

        context.syncStatus = 'Authentication Required';
        context.syncMessage = GOOGLE_CONNECT_MESSAGE;
        context.googleImportStatus = 'Authentication Required';
        context.googleImportMessage = GOOGLE_CONNECT_MESSAGE;

        const popup = window.open(authUrl, '_blank', 'noopener');

        if (!popup) {
            context.showToast(
                'Google Connect',
                'Popup blocked. Allow popups for Salesforce and try again.',
                'warning'
            );
        } else {
            context.showToast(
                'Google Connect',
                'Complete Google sign-in in the new tab, then return here and click I Finished Connecting.',
                'success'
            );
        }
    } catch (error) {
        const message = context.extractErrorMessage(error);
        context.syncStatus = 'Error';
        context.syncMessage = message;
        context.googleImportStatus = 'Error';
        context.googleImportMessage = message;
        context.showToast('Google Connect Error', message, 'error');
    } finally {
        context.isGoogleBusy = false;
    }
}

export async function runGoogleImportSync(context) {
    context.isGoogleBusy = true;

    try {
        const visibleRange = getVisibleRange(context.currentDate, context.currentView);
        const result = await importEventsFromGoogle({
            calendarId: context.selectedCalendarId,
            start: visibleRange?.startDate || null,
            endDate: visibleRange?.endDate || null
        });

        context.googleImportStatus = result?.success ? 'Imported' : 'Error';
        context.googleImportMessage = result?.message || '';

        context.showToast(
            'Google Import',
            context.googleImportMessage || 'Google events imported into Salesforce.',
            result?.success ? 'success' : 'warning'
        );

        context._invalidateCache();
        await context.loadEvents();
    } catch (error) {
        const message = context.extractErrorMessage(error);
        context.googleImportStatus = 'Error';
        context.googleImportMessage = message;
        context.showToast('Google Import Error', message, 'error');
    } finally {
        context.isGoogleBusy = false;
        await context.loadGoogleConnectionState();
    }
}

export async function runGoogleSync(context) {
    context.isGoogleBusy = true;

    try {
        const result = await pushEventsForCalendar({
            calendarId: context.selectedCalendarId,
            start: null,
            endDate: null
        });

        context.syncStatus = result?.success ? 'Queued' : 'Error';
        context.syncMessage = result?.message || '';

        context.showToast(
            'Google Sync',
            context.syncMessage || 'Google sync job queued.',
            result?.success ? 'success' : 'warning'
        );
    } catch (error) {
        const message = context.extractErrorMessage(error);
        context.syncStatus = 'Error';
        context.syncMessage = message;
        context.showToast('Google Sync Error', message, 'error');
    } finally {
        context.isGoogleBusy = false;
        await context.loadGoogleConnectionState();
    }
}