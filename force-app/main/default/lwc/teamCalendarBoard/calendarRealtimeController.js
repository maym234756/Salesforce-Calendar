import { isEmpEnabled, onError, subscribe, unsubscribe } from 'lightning/empApi';

export const CALENDAR_EVENT_CHANGE_CHANNEL = '/event/Calendar_Event_Change__e';
const REALTIME_REFRESH_DEBOUNCE_MS = 300;

let hasRegisteredEmpErrorHandler = false;

function clearRealtimeRefreshTimer(context) {
    if (context?._realtimeRefreshTimer) {
        clearTimeout(context._realtimeRefreshTimer);
        context._realtimeRefreshTimer = null;
    }
}

function registerEmpErrorHandler() {
    if (hasRegisteredEmpErrorHandler) {
        return;
    }

    onError((error) => {
        // eslint-disable-next-line no-console
        console.error('Team Calendar realtime subscription error', error);
    });

    hasRegisteredEmpErrorHandler = true;
}

export function queueRealtimeRefresh(context) {
    clearRealtimeRefreshTimer(context);

    context._realtimeRefreshTimer = setTimeout(() => {
        context._realtimeRefreshTimer = null;

        if (context?.isConnected === false) {
            return;
        }

        context?._invalidateCache?.();

        if (typeof context?._debouncedLoadEvents === 'function') {
            context._debouncedLoadEvents();
            return;
        }

        context?.loadEvents?.();
    }, REALTIME_REFRESH_DEBOUNCE_MS);
}

export async function initializeRealtimeUpdates(context) {
    if (!context || context.realtimeSubscription || context.isConnected === false) {
        return false;
    }

    registerEmpErrorHandler();

    try {
        const empEnabled = await isEmpEnabled();
        if (empEnabled !== true) {
            return false;
        }

        context.realtimeSubscription = await subscribe(
            CALENDAR_EVENT_CHANGE_CHANNEL,
            -1,
            () => queueRealtimeRefresh(context)
        );

        return true;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Unable to initialize Team Calendar realtime updates', error);
        context.realtimeSubscription = null;
        return false;
    }
}

export function disconnectRealtimeUpdates(context) {
    clearRealtimeRefreshTimer(context);

    if (!context?.realtimeSubscription) {
        return Promise.resolve(false);
    }

    const activeSubscription = context.realtimeSubscription;
    context.realtimeSubscription = null;

    return new Promise((resolve) => {
        unsubscribe(activeSubscription, () => resolve(true));
    });
}