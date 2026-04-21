jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent',
    () => ({ default: jest.fn(() => Promise.resolve('a1B000000000001AAA')) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.deleteCalendarEvent',
    () => ({ default: jest.fn(() => Promise.resolve()) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/TeamCalendarUndoService.undeleteCalendarEvent',
    () => ({ default: jest.fn(() => Promise.resolve()) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.deleteTask',
    () => ({ default: jest.fn(() => Promise.resolve()) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/TeamCalendarUndoService.undeleteTask',
    () => ({ default: jest.fn(() => Promise.resolve()) }),
    { virtual: true }
);

const updateCalendarEvent = require('@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent').default;
const undeleteCalendarEvent = require('@salesforce/apex/TeamCalendarUndoService.undeleteCalendarEvent').default;

const {
    buildDeleteMutation,
    clearMutationTimers,
    registerMutation,
    handleMutationNoticeAction,
    dismissMutationNotice
} = require('../calendarMutationController');

function createContext(overrides = {}) {
    return {
        _mutationHistory: [],
        _redoMutationHistory: [],
        _mutationSequence: 0,
        activeMutationNotice: null,
        _invalidateCache: jest.fn(),
        loadEvents: jest.fn(() => Promise.resolve()),
        _announce: jest.fn(),
        showToast: jest.fn(),
        extractErrorMessage: jest.fn((error) => error?.message || 'Unknown error'),
        ...overrides
    };
}

describe('teamCalendarBoard calendarMutationController', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    it('builds delete mutations only when undo is supported', () => {
        expect(
            buildDeleteMutation({
                recordId: 'a1B',
                recordName: 'Test Event',
                isTaskRecord: false,
                recordContextId: null,
                supportsUndo: true
            })
        ).toEqual({
            mutationType: 'delete-calendar-event',
            recordId: 'a1B',
            recordName: 'Test Event',
            recordContextId: null,
            message: 'Test Event was deleted.',
            undoMessage: 'Restored Test Event.',
            redoMessage: 'Deleted Test Event again.'
        });

        expect(
            buildDeleteMutation({
                recordId: '00T',
                recordName: 'Task Row',
                isTaskRecord: true,
                recordContextId: '00U',
                supportsUndo: false
            })
        ).toBeNull();
    });

    it('registers an undo notice and clears redo history', () => {
        const staleRedoTimer = setTimeout(() => {}, 1000);
        const context = createContext({
            _redoMutationHistory: [{ id: 'redo-1', timeoutId: staleRedoTimer }],
            activeMutationNotice: { id: 'redo-1', mode: 'redo' }
        });

        registerMutation(context, {
            mutationType: 'delete-calendar-event',
            recordId: 'a1B',
            recordName: 'Test Event',
            message: 'Test Event was deleted.',
            undoMessage: 'Restored Test Event.',
            redoMessage: 'Deleted Test Event again.'
        });

        expect(context._redoMutationHistory).toEqual([]);
        expect(context._mutationHistory).toHaveLength(1);
        expect(context.activeMutationNotice).toMatchObject({
            mode: 'undo',
            actionLabel: 'Undo',
            message: 'Test Event was deleted.'
        });

        clearMutationTimers(context);
    });

    it('clears both mutation stacks and the active notice', () => {
        const context = createContext();

        registerMutation(context, {
            mutationType: 'delete-calendar-event',
            recordId: 'a1B',
            recordName: 'Test Event',
            message: 'Test Event was deleted.',
            undoMessage: 'Restored Test Event.',
            redoMessage: 'Deleted Test Event again.'
        });

        clearMutationTimers(context);

        expect(context._mutationHistory).toEqual([]);
        expect(context._redoMutationHistory).toEqual([]);
        expect(context.activeMutationNotice).toBeNull();
    });

    it('undoes a calendar-update mutation and exposes a redo notice', async () => {
        const context = createContext({
            _mutationSequence: 1,
            activeMutationNotice: { id: 'mutation-1', mode: 'undo' },
            _mutationHistory: [
                {
                    id: 'mutation-1',
                    timeoutId: setTimeout(() => {}, 1000),
                    mutationType: 'calendar-update',
                    recordId: 'a1B',
                    recordName: 'Test Event',
                    previousPayload: { recordId: 'a1B', startValue: '2026-03-02T09:00:00.000Z' },
                    nextPayload: { recordId: 'a1B', startValue: '2026-03-05T09:00:00.000Z' },
                    message: 'Test Event was moved.',
                    undoMessage: 'Undid move for Test Event.',
                    redoMessage: 'Moved Test Event back.'
                }
            ]
        });

        await handleMutationNoticeAction(context);

        expect(updateCalendarEvent).toHaveBeenCalledWith({
            requestJson: JSON.stringify({ recordId: 'a1B', startValue: '2026-03-02T09:00:00.000Z' })
        });
        expect(context._invalidateCache).toHaveBeenCalledTimes(1);
        expect(context.loadEvents).toHaveBeenCalledTimes(1);
        expect(context._mutationHistory).toEqual([]);
        expect(context._redoMutationHistory).toHaveLength(1);
        expect(context.activeMutationNotice).toMatchObject({
            mode: 'redo',
            actionLabel: 'Redo'
        });
        expect(context._announce).toHaveBeenCalledWith('Undid move for Test Event.');

        clearMutationTimers(context);
    });

    it('dismisses the active notice and removes its stack entry', () => {
        const context = createContext();

        registerMutation(context, {
            mutationType: 'delete-calendar-event',
            recordId: 'a1B',
            recordName: 'Test Event',
            message: 'Test Event was deleted.',
            undoMessage: 'Restored Test Event.',
            redoMessage: 'Deleted Test Event again.'
        });

        dismissMutationNotice(context);

        expect(context.activeMutationNotice).toBeNull();
        expect(context._mutationHistory).toEqual([]);
        expect(undeleteCalendarEvent).not.toHaveBeenCalled();
    });
});