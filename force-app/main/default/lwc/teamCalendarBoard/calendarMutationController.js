import updateCalendarEvent from '@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent';
import deleteCalendarEvent from '@salesforce/apex/TeamCalendarRecordMutationService.deleteCalendarEvent';
import undeleteCalendarEvent from '@salesforce/apex/TeamCalendarUndoService.undeleteCalendarEvent';
import deleteTask from '@salesforce/apex/TeamCalendarRecordMutationService.deleteTask';
import undeleteTask from '@salesforce/apex/TeamCalendarUndoService.undeleteTask';

const MAX_MUTATION_HISTORY = 5;
const MUTATION_UNDO_WINDOW_MS = 10000;

function clearMutationEntryTimer(entry) {
    if (entry?.timeoutId) {
        clearTimeout(entry.timeoutId);
        entry.timeoutId = null;
    }
}

function expireMutationEntry(context, entryId) {
    context._mutationHistory = context._mutationHistory.filter((entry) => entry.id !== entryId);
    context._redoMutationHistory = context._redoMutationHistory.filter((entry) => entry.id !== entryId);
    if (context.activeMutationNotice?.id === entryId) {
        context.activeMutationNotice = null;
    }
}

function createMutationEntry(context, baseMutation) {
    const entry = {
        ...baseMutation,
        id: `mutation-${++context._mutationSequence}`,
        timeoutId: null
    };

    entry.timeoutId = setTimeout(() => {
        expireMutationEntry(context, entry.id);
    }, MUTATION_UNDO_WINDOW_MS);

    return entry;
}

function trimMutationStack(context, stack) {
    const nextStack = stack.slice(0, MAX_MUTATION_HISTORY);
    stack.slice(MAX_MUTATION_HISTORY).forEach((entry) => {
        clearMutationEntryTimer(entry);
    });
    return nextStack;
}

function toBaseMutation(entry) {
    const { id, timeoutId, ...baseMutation } = entry;
    return baseMutation;
}

function clearRedoHistory(context) {
    context._redoMutationHistory.forEach((entry) => clearMutationEntryTimer(entry));
    context._redoMutationHistory = [];
    if (context.activeMutationNotice?.mode === 'redo') {
        context.activeMutationNotice = null;
    }
}

function showMutationNotice(context, entry, mode) {
    context.activeMutationNotice = {
        id: entry.id,
        mode,
        message: mode === 'redo' ? entry.undoMessage : entry.message,
        actionLabel: mode === 'redo' ? 'Redo' : 'Undo'
    };
}

async function executeMutationAction(entry, direction) {
    if (entry.mutationType === 'calendar-update') {
        const payload = direction === 'undo' ? entry.previousPayload : entry.nextPayload;
        await updateCalendarEvent({ requestJson: JSON.stringify(payload) });
        return;
    }

    if (entry.mutationType === 'delete-calendar-event') {
        if (direction === 'undo') {
            await undeleteCalendarEvent({ recordId: entry.recordId });
        } else {
            await deleteCalendarEvent({ recordId: entry.recordId });
        }
        return;
    }

    if (entry.mutationType === 'delete-task') {
        if (direction === 'undo') {
            await undeleteTask({
                recordId: entry.recordId,
                calendarViewId: entry.recordContextId
            });
        } else {
            await deleteTask({
                recordId: entry.recordId,
                calendarViewId: entry.recordContextId
            });
        }
    }
}

export function buildDeleteMutation({ recordId, recordName, isTaskRecord, recordContextId, supportsUndo }) {
    if (supportsUndo !== true) {
        return null;
    }

    const resolvedName = recordName || (isTaskRecord ? 'Task' : 'Event');
    return {
        mutationType: isTaskRecord ? 'delete-task' : 'delete-calendar-event',
        recordId,
        recordName: resolvedName,
        recordContextId: recordContextId || null,
        message: `${resolvedName} was deleted.`,
        undoMessage: `Restored ${resolvedName}.`,
        redoMessage: `Deleted ${resolvedName} again.`
    };
}

export function clearMutationTimers(context) {
    [...context._mutationHistory, ...context._redoMutationHistory].forEach((entry) => {
        clearMutationEntryTimer(entry);
    });
    context._mutationHistory = [];
    context._redoMutationHistory = [];
    context.activeMutationNotice = null;
}

export function registerMutation(context, baseMutation) {
    clearRedoHistory(context);
    const entry = createMutationEntry(context, baseMutation);
    context._mutationHistory = trimMutationStack(context, [entry, ...context._mutationHistory]);
    showMutationNotice(context, entry, 'undo');
}

export async function handleMutationNoticeAction(context) {
    const notice = context.activeMutationNotice;
    if (!notice) {
        return;
    }

    const sourceStack = notice.mode === 'redo' ? context._redoMutationHistory : context._mutationHistory;
    const entry = sourceStack.find((item) => item.id === notice.id);
    if (!entry) {
        context.activeMutationNotice = null;
        return;
    }

    clearMutationEntryTimer(entry);
    context.activeMutationNotice = null;

    try {
        await executeMutationAction(entry, notice.mode === 'redo' ? 'redo' : 'undo');
        context._invalidateCache();
        await context.loadEvents();

        if (notice.mode === 'redo') {
            context._redoMutationHistory = context._redoMutationHistory.filter((item) => item.id !== entry.id);
            const undoEntry = createMutationEntry(context, toBaseMutation(entry));
            context._mutationHistory = trimMutationStack(context, [undoEntry, ...context._mutationHistory]);
            showMutationNotice(context, undoEntry, 'undo');
            context._announce(entry.redoMessage || `${entry.recordName || 'Event'} was updated.`);
            return;
        }

        context._mutationHistory = context._mutationHistory.filter((item) => item.id !== entry.id);
        const redoEntry = createMutationEntry(context, toBaseMutation(entry));
        context._redoMutationHistory = trimMutationStack(context, [redoEntry, ...context._redoMutationHistory]);
        showMutationNotice(context, redoEntry, 'redo');
        context._announce(entry.undoMessage || `Undid ${entry.recordName || 'the change'}.`);
    } catch (error) {
        context.showToast(
            notice.mode === 'redo' ? 'Redo Failed' : 'Undo Failed',
            context.extractErrorMessage(error),
            'error'
        );
    }
}

export function dismissMutationNotice(context) {
    const notice = context.activeMutationNotice;
    if (!notice) {
        return;
    }

    const stack = notice.mode === 'redo' ? context._redoMutationHistory : context._mutationHistory;
    const entry = stack.find((item) => item.id === notice.id);
    if (entry) {
        clearMutationEntryTimer(entry);
    }

    if (notice.mode === 'redo') {
        context._redoMutationHistory = context._redoMutationHistory.filter((item) => item.id !== notice.id);
    } else {
        context._mutationHistory = context._mutationHistory.filter((item) => item.id !== notice.id);
    }
    context.activeMutationNotice = null;
}