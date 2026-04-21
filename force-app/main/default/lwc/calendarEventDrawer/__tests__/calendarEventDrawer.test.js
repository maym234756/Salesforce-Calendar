const { createElement } = require('lwc');
const CalendarEventDrawer = require('c/calendarEventDrawer').default;

jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.getCalendarEventEditorState',
    () => ({
        default: jest.fn()
    }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent',
    () => ({
        default: jest.fn(() => Promise.resolve())
    }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.updateRecurringCalendarEvent',
    () => ({
        default: jest.fn(() => Promise.resolve())
    }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.updateTask',
    () => ({
        default: jest.fn(() => Promise.resolve())
    }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.deleteCalendarEvent',
    () => ({
        default: jest.fn(() => Promise.resolve())
    }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.deleteRecurringCalendarEvent',
    () => ({
        default: jest.fn(() => Promise.resolve())
    }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.deleteTask',
    () => ({
        default: jest.fn(() => Promise.resolve())
    }),
    { virtual: true }
);

jest.mock(
    'lightning/navigation',
    () => {
        const NavigationMixin = (Base) => class extends Base {};
        NavigationMixin.Navigate = 'Navigate';
        return {
            NavigationMixin
        };
    },
    { virtual: true }
);

jest.mock(
    'lightning/platformShowToastEvent',
    () => {
        return {
            ShowToastEvent: class ShowToastEvent extends CustomEvent {
                constructor(detail) {
                    super('lightning__showtoast', {
                        detail,
                        bubbles: true,
                        composed: true
                    });
                }
            }
        };
    },
    { virtual: true }
);

const getCalendarEventEditorState = require('@salesforce/apex/TeamCalendarRecordMutationService.getCalendarEventEditorState').default;
const updateCalendarEvent = require('@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent').default;
const updateRecurringCalendarEvent = require('@salesforce/apex/TeamCalendarRecordMutationService.updateRecurringCalendarEvent').default;
const updateTask = require('@salesforce/apex/TeamCalendarRecordMutationService.updateTask').default;
const deleteCalendarEvent = require('@salesforce/apex/TeamCalendarRecordMutationService.deleteCalendarEvent').default;
const deleteRecurringCalendarEvent = require('@salesforce/apex/TeamCalendarRecordMutationService.deleteRecurringCalendarEvent').default;
const deleteTask = require('@salesforce/apex/TeamCalendarRecordMutationService.deleteTask').default;

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function buildElement(props = {}) {
    const el = createElement('c-calendar-event-drawer', { is: CalendarEventDrawer });
    el.recordId = props.recordId || 'a1B000000000001AAA';
    el.objectApiName = props.objectApiName || 'Calendar_Event__c';
    el.canEdit = props.canEdit !== undefined ? props.canEdit : true;
    el.canDelete = props.canDelete !== undefined ? props.canDelete : true;
    el.recordContextId = props.recordContextId || 'a1x000000000001AAA';
    el.isRecurring = props.isRecurring || false;
    el.occurrenceDate = props.occurrenceDate || '2026-04-18';
    document.body.appendChild(el);
    return el;
}

describe('c-calendar-event-drawer', () => {
    beforeEach(() => {
        getCalendarEventEditorState.mockResolvedValue({
            name: 'Quarterly Planning',
            calendarId: 'a1x000000000001AAA',
            status: 'Planned',
            startValue: '2026-04-18T09:00:00.000Z',
            endValue: '2026-04-18T10:00:00.000Z',
            allDay: false,
            notes: 'Agenda review'
        });
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('loads and renders event state in view mode', async () => {
        const el = buildElement();
        await flushPromises();

        expect(getCalendarEventEditorState).toHaveBeenCalledWith({ recordId: 'a1B000000000001AAA' });
        expect(el.shadowRoot.textContent).toContain('Quarterly Planning');
        expect(el.shadowRoot.textContent).toContain('Agenda review');
    });

    it('shows Edit and Delete buttons when allowed', async () => {
        const el = buildElement({ canEdit: true, canDelete: true });
        await flushPromises();

        const labels = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).map((button) => button.label);
        expect(labels).toEqual(expect.arrayContaining(['Edit', 'Delete Event', 'Open Record']));
    });

    it('hides Edit and Delete buttons when access is denied', async () => {
        const el = buildElement({ canEdit: false, canDelete: false });
        await flushPromises();

        const labels = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).map((button) => button.label);
        expect(labels).not.toContain('Edit');
        expect(labels).not.toContain('Delete Event');
    });

    it('dispatches close when the Close button is clicked', async () => {
        const el = buildElement();
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('close', handler);

        const closeBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find((button) => button.label === 'Close');
        closeBtn.click();
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('enters edit mode when Edit is clicked', async () => {
        const el = buildElement();
        await flushPromises();

        const editBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find((button) => button.label === 'Edit');
        editBtn.click();
        await flushPromises();
        await flushPromises();

        expect(el.shadowRoot.querySelector('lightning-input[data-field="name"]')).not.toBeNull();
        const labels = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).map((button) => button.label);
        expect(labels).toEqual(expect.arrayContaining(['Cancel Edit', 'Save Changes']));
    });

    it('opens delete confirmation when Delete Event is clicked', async () => {
        const el = buildElement({ canDelete: true });
        await flushPromises();

        const deleteBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find((button) => button.label === 'Delete Event');
        deleteBtn.click();
        await flushPromises();

        expect(el.shadowRoot.textContent).toContain('Delete this event?');
    });

    it('validates required event name before saving', async () => {
        const el = buildElement();
        await flushPromises();

        const editBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find((button) => button.label === 'Edit');
        editBtn.click();
        await flushPromises();

        const nameInput = el.shadowRoot.querySelector('lightning-input[data-field="name"]');
        expect(nameInput).not.toBeNull();
        nameInput.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: '' },
                bubbles: true,
                composed: true
            })
        );
        await flushPromises();

        const saveBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find((button) => button.label === 'Save Changes');
        expect(saveBtn).not.toBeNull();
        saveBtn.click();
        await flushPromises();

        expect(updateCalendarEvent).not.toHaveBeenCalled();
        expect(el.shadowRoot.querySelector('lightning-input[data-field="name"]')).not.toBeNull();
    });

    it('dispatches a reversible mutation event after a non-recurring event save', async () => {
        const el = buildElement({ isRecurring: false });
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('mutation', handler);

        const editBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find((button) => button.label === 'Edit');
        editBtn.click();
        await flushPromises();
        await flushPromises();

        const nameInput = el.shadowRoot.querySelector('lightning-input[data-field="name"]');
        nameInput.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: 'Quarterly Planning Updated' },
                bubbles: true,
                composed: true
            })
        );
        await flushPromises();

        const saveBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find((button) => button.label === 'Save Changes');
        saveBtn.click();
        await flushPromises();

        expect(updateCalendarEvent).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.mutationType).toBe('calendar-update');
        expect(handler.mock.calls[0][0].detail.previousPayload.name).toBe('Quarterly Planning');
        expect(handler.mock.calls[0][0].detail.nextPayload.name).toBe('Quarterly Planning Updated');
    });

    it('initializes task drafts from the wired task record shape', () => {
        const context = {
            wiredTaskRecordResult: {
                data: {
                    fields: {
                        Subject: { value: 'Call customer back' },
                        OwnerId: { value: '005AAA' },
                        ActivityDate: { value: '2026-04-20' },
                        Status: { value: 'In Progress' },
                        Priority: { value: 'High' },
                        WhatId: { value: '001AAA' },
                        WhoId: { value: '003AAA' },
                        Description: { value: 'Confirm next steps' }
                    }
                }
            },
            getTaskFieldValue: CalendarEventDrawer.prototype.getTaskFieldValue
        };

        CalendarEventDrawer.prototype.initializeTaskDraft.call(context);

        expect(context.taskDraft).toEqual({
            subject: 'Call customer back',
            ownerId: '005AAA',
            activityDate: '2026-04-20',
            status: 'In Progress',
            priority: 'High',
            whatId: '001AAA',
            whoId: '003AAA',
            description: 'Confirm next steps'
        });
    });

    it('validates task drafts before sending an update request', () => {
        const context = {
            recordId: '00T000000000001AAA',
            isTaskRecord: true,
            taskDraft: { subject: '' },
            handleError: jest.fn()
        };

        CalendarEventDrawer.prototype.handleTaskSave.call(context);

        expect(updateTask).not.toHaveBeenCalled();
        expect(context.handleError).toHaveBeenCalledWith({
            detail: {
                message: 'Task subject is required.'
            }
        });
    });

    it('saves task drafts through the task mutation endpoint', async () => {
        const context = {
            recordId: '00T000000000001AAA',
            isTaskRecord: true,
            recordContextId: 'a1x000000000001AAA',
            taskDraft: {
                subject: 'Call customer back',
                ownerId: '005AAA',
                activityDate: '2026-04-20',
                status: 'In Progress',
                priority: 'High',
                whatId: '001AAA',
                whoId: '003AAA',
                description: 'Confirm next steps'
            },
            handleSuccess: jest.fn(),
            handleError: jest.fn()
        };

        CalendarEventDrawer.prototype.handleTaskSave.call(context);
        await flushPromises();

        expect(updateTask).toHaveBeenCalledTimes(1);
        expect(JSON.parse(updateTask.mock.calls[0][0].requestJson)).toMatchObject({
            recordId: '00T000000000001AAA',
            calendarViewId: 'a1x000000000001AAA',
            subject: 'Call customer back',
            ownerId: '005AAA',
            activityDate: '2026-04-20',
            status: 'In Progress',
            priority: 'High',
            whatId: '001AAA',
            whoId: '003AAA',
            description: 'Confirm next steps'
        });
        expect(context.handleSuccess).toHaveBeenCalledTimes(1);
    });

    it('opens the recurrence scope modal before saving recurring events', () => {
        const context = {
            recordId: 'a1B000000000001AAA',
            isCalendarEventRecord: true,
            isRecurringEvent: true,
            eventDraft: {
                name: 'Recurring Planning',
                startValue: '2026-04-18T09:00:00.000Z',
                endValue: '2026-04-18T10:00:00.000Z'
            }
        };

        CalendarEventDrawer.prototype.handleEventSave.call(context);

        expect(context.recurrenceScopeAction).toBe('edit');
        expect(context.selectedRecurringScope).toBe('this');
        expect(context.showRecurrenceScopeModal).toBe(true);
        expect(updateCalendarEvent).not.toHaveBeenCalled();
    });

    it('saves recurring events through the recurring mutation endpoint', async () => {
        const context = {
            recordId: 'a1B000000000001AAA',
            occurrenceDate: '2026-04-18',
            eventDraft: {
                calendarId: 'a1x000000000001AAA',
                name: 'Recurring Planning',
                startValue: '2026-04-18T09:00:00.000Z',
                endValue: '2026-04-18T10:00:00.000Z',
                allDay: false,
                status: 'Confirmed',
                notes: 'Series notes'
            },
            handleSuccess: jest.fn(),
            handleError: jest.fn(),
            extractErrorMessage: jest.fn((error) => error?.message || 'Unknown error')
        };

        CalendarEventDrawer.prototype._commitEventSave.call(context, 'all');
        await flushPromises();

        expect(updateRecurringCalendarEvent).toHaveBeenCalledTimes(1);
        expect(JSON.parse(updateRecurringCalendarEvent.mock.calls[0][0].requestJson)).toMatchObject({
            recordId: 'a1B000000000001AAA',
            scope: 'all',
            occurrenceDate: '2026-04-18',
            eventData: {
                calendarId: 'a1x000000000001AAA',
                name: 'Recurring Planning',
                startValue: '2026-04-18T09:00:00.000Z',
                endValue: '2026-04-18T10:00:00.000Z',
                allDay: false,
                status: 'Confirmed',
                notes: 'Series notes'
            }
        });
        expect(context.handleSuccess).toHaveBeenCalledTimes(1);
    });

    it('dispatches a reversible delete mutation for non-recurring events', async () => {
        const dispatchEvent = jest.fn();
        const context = {
            recordId: 'a1B000000000001AAA',
            isTaskRecord: false,
            isCalendarEventRecord: true,
            isRecurringEvent: false,
            eventState: {
                name: 'Quarterly Planning'
            },
            dispatchEvent
        };

        CalendarEventDrawer.prototype._commitEventDelete.call(context, 'none');
        await flushPromises();

        expect(deleteCalendarEvent).toHaveBeenCalledWith({
            recordId: 'a1B000000000001AAA'
        });
        expect(dispatchEvent).toHaveBeenCalledTimes(2);
        expect(dispatchEvent.mock.calls[0][0].type).toBe('mutation');
        expect(dispatchEvent.mock.calls[0][0].detail.mutationType).toBe('delete-calendar-event');
        expect(dispatchEvent.mock.calls[1][0].type).toBe('close');
    });

    it('routes recurring deletes through the recurring delete endpoint', async () => {
        const dispatchEvent = jest.fn();
        const context = {
            recordId: 'a1B000000000001AAA',
            occurrenceDate: '2026-04-18',
            isTaskRecord: false,
            isCalendarEventRecord: true,
            isRecurringEvent: true,
            dispatchEvent
        };

        CalendarEventDrawer.prototype._commitEventDelete.call(context, 'thisAndFollowing');
        await flushPromises();

        expect(deleteRecurringCalendarEvent).toHaveBeenCalledWith({
            recordId: 'a1B000000000001AAA',
            scope: 'thisAndFollowing',
            occurrenceDate: '2026-04-18'
        });
        expect(dispatchEvent.mock.calls[0][0].type).toBe('lightning__showtoast');
        expect(dispatchEvent.mock.calls[1][0].type).toBe('close');
    });

    it('adjusts end times when the edited event start moves forward', () => {
        const context = {
            eventDraft: {
                startValue: '2026-04-18T08:00:00.000Z',
                endValue: '2026-04-18T08:30:00.000Z',
                allDay: false
            },
            eventAllDayValue: false,
            parseInputDateValue: CalendarEventDrawer.prototype.parseInputDateValue,
            formatInputDateValue: CalendarEventDrawer.prototype.formatInputDateValue,
            buildAdjustedEventEndValue: CalendarEventDrawer.prototype.buildAdjustedEventEndValue
        };

        CalendarEventDrawer.prototype.handleEventFieldChange.call(context, {
            target: {
                dataset: { field: 'startValue' },
                value: '2026-04-18T10:00'
            },
            detail: {
                value: '2026-04-18T10:00'
            }
        });

        expect(new Date(context.eventDraft.endValue).getTime()).toBeGreaterThan(
            new Date(context.eventDraft.startValue).getTime()
        );
    });

    it('wires task records into the draft only while editing task records', () => {
        const context = {
            isEditMode: true,
            isTaskRecord: true,
            initializeTaskDraft: jest.fn()
        };

        CalendarEventDrawer.prototype.wiredTaskRecord.call(context, {
            data: { fields: {} }
        });

        expect(context.wiredTaskRecordResult).toEqual({ data: { fields: {} } });
        expect(context.initializeTaskDraft).toHaveBeenCalledTimes(1);

        const eventContext = {
            isEditMode: false,
            isTaskRecord: false,
            initializeTaskDraft: jest.fn()
        };

        CalendarEventDrawer.prototype.wiredEventRecord.call(eventContext, {
            data: { fields: { Name: { value: 'Quarterly Planning' } } }
        });

        expect(eventContext.wiredEventRecordResult).toEqual({
            data: { fields: { Name: { value: 'Quarterly Planning' } } }
        });
        expect(eventContext.initializeTaskDraft).not.toHaveBeenCalled();
    });

    it('resets local state when the drawer closes or edit mode is cancelled', () => {
        const dispatchEvent = jest.fn();
        const context = {
            isEditMode: true,
            taskDraft: { subject: 'Call' },
            eventDraft: { name: 'Quarterly Planning' },
            eventState: { name: 'Quarterly Planning' },
            dispatchEvent
        };

        CalendarEventDrawer.prototype.handleClose.call(context);

        expect(context.isEditMode).toBe(false);
        expect(context.taskDraft).toBeNull();
        expect(context.eventDraft).toBeNull();
        expect(context.eventState).toBeNull();
        expect(dispatchEvent.mock.calls[0][0].type).toBe('close');

        context.isEditMode = true;
        context.taskDraft = { subject: 'Call' };
        context.eventDraft = { name: 'Quarterly Planning' };
        CalendarEventDrawer.prototype.handleCancelEdit.call(context);
        expect(context.isEditMode).toBe(false);
        expect(context.taskDraft).toBeNull();
        expect(context.eventDraft).toBeNull();
    });

    it('enters task or event edit mode through the proper draft loader', async () => {
        const blockedContext = {
            canEdit: false,
            isTaskRecord: false,
            initializeTaskDraft: jest.fn(),
            loadEventDraft: jest.fn(() => Promise.resolve())
        };
        await CalendarEventDrawer.prototype.handleEdit.call(blockedContext);
        expect(blockedContext.initializeTaskDraft).not.toHaveBeenCalled();
        expect(blockedContext.loadEventDraft).not.toHaveBeenCalled();

        const taskContext = {
            canEdit: true,
            isTaskRecord: true,
            initializeTaskDraft: jest.fn(),
            loadEventDraft: jest.fn(() => Promise.resolve())
        };
        await CalendarEventDrawer.prototype.handleEdit.call(taskContext);
        expect(taskContext.initializeTaskDraft).toHaveBeenCalledTimes(1);
        expect(taskContext.isEditMode).toBe(true);

        const eventContext = {
            canEdit: true,
            isTaskRecord: false,
            initializeTaskDraft: jest.fn(),
            loadEventDraft: jest.fn(() => Promise.resolve())
        };
        await CalendarEventDrawer.prototype.handleEdit.call(eventContext);
        expect(eventContext.loadEventDraft).toHaveBeenCalledTimes(1);
        expect(eventContext.isEditMode).toBe(true);
    });

    it('updates task and event draft fields, including all-day and end inputs', () => {
        const taskContext = {
            taskDraft: { subject: 'Old' }
        };
        CalendarEventDrawer.prototype.handleTaskFieldChange.call(taskContext, {
            target: {
                dataset: { field: 'subject' },
                value: 'Call customer back'
            },
            detail: { value: 'Call customer back' }
        });
        expect(taskContext.taskDraft.subject).toBe('Call customer back');

        const eventContext = {
            eventDraft: {
                startValue: '2026-04-18T09:00:00.000Z',
                endValue: '2026-04-18T10:00:00.000Z',
                allDay: false
            },
            eventAllDayValue: false,
            parseInputDateValue: CalendarEventDrawer.prototype.parseInputDateValue,
            formatInputDateValue: CalendarEventDrawer.prototype.formatInputDateValue,
            buildAdjustedEventEndValue: CalendarEventDrawer.prototype.buildAdjustedEventEndValue
        };

        CalendarEventDrawer.prototype.handleEventFieldChange.call(eventContext, {
            target: {
                dataset: { field: 'allDay' },
                checked: true
            },
            detail: {}
        });
        expect(eventContext.eventDraft.allDay).toBe(true);
        expect(
            CalendarEventDrawer.prototype.formatInputDateValue.call({}, eventContext.eventDraft.startValue, true)
        ).toBe('2026-04-18');
        expect(
            CalendarEventDrawer.prototype.formatInputDateValue.call({}, eventContext.eventDraft.endValue, true)
        ).toBe('2026-04-18');

        eventContext.eventAllDayValue = true;
        CalendarEventDrawer.prototype.handleEventFieldChange.call(eventContext, {
            target: {
                dataset: { field: 'endValue' },
                value: '2026-04-20'
            },
            detail: { value: '2026-04-20' }
        });
        expect(
            CalendarEventDrawer.prototype.formatInputDateValue.call({}, eventContext.eventDraft.endValue, true)
        ).toBe('2026-04-20');
    });

    it('opens and manages standard and recurring delete flows', () => {
        const recurringContext = {
            recordId: 'a1B000000000001AAA',
            canDelete: true,
            isDeleting: false,
            isRecurringEvent: true,
            isTaskRecord: false
        };
        CalendarEventDrawer.prototype.handleDelete.call(recurringContext);
        expect(recurringContext.recurrenceScopeAction).toBe('delete');
        expect(recurringContext.selectedRecurringScope).toBe('this');
        expect(recurringContext.showRecurrenceScopeModal).toBe(true);

        const standardContext = {
            recordId: '00T000000000001AAA',
            canDelete: true,
            isDeleting: false,
            isRecurringEvent: false,
            isTaskRecord: true
        };
        CalendarEventDrawer.prototype.handleDelete.call(standardContext);
        expect(standardContext.deleteConfirmMessage).toBe('Delete this task?');
        expect(standardContext.showDeleteConfirm).toBe(true);

        CalendarEventDrawer.prototype.handleCancelDelete.call(standardContext);
        expect(standardContext.showDeleteConfirm).toBe(false);
    });

    it('handles recurring-scope change, cancel, confirm-save, and confirm-delete flows', () => {
        const saveContext = {
            selectedRecurringScope: 'this',
            recurrenceScopeAction: 'edit',
            showRecurrenceScopeModal: true,
            _commitEventSave: jest.fn(),
            _commitEventDelete: jest.fn()
        };

        CalendarEventDrawer.prototype.handleRecurringScopeChange.call(saveContext, {
            detail: { value: 'all' }
        });
        expect(saveContext.selectedRecurringScope).toBe('all');

        CalendarEventDrawer.prototype.handleConfirmRecurringScope.call(saveContext);
        expect(saveContext.showRecurrenceScopeModal).toBe(false);
        expect(saveContext._commitEventSave).toHaveBeenCalledWith('all');

        const deleteContext = {
            selectedRecurringScope: 'thisAndFollowing',
            recurrenceScopeAction: 'delete',
            showRecurrenceScopeModal: true,
            _commitEventSave: jest.fn(),
            _commitEventDelete: jest.fn()
        };
        CalendarEventDrawer.prototype.handleConfirmRecurringScope.call(deleteContext);
        expect(deleteContext._commitEventDelete).toHaveBeenCalledWith('thisAndFollowing');

        const cancelContext = {
            showRecurrenceScopeModal: true,
            recurrenceScopeAction: 'delete',
            isSaving: true
        };
        CalendarEventDrawer.prototype.handleCancelRecurringScope.call(cancelContext);
        expect(cancelContext.showRecurrenceScopeModal).toBe(false);
        expect(cancelContext.recurrenceScopeAction).toBeNull();
        expect(cancelContext.isSaving).toBe(false);

        const confirmDeleteContext = {
            showDeleteConfirm: true,
            _commitEventDelete: jest.fn()
        };
        CalendarEventDrawer.prototype.handleConfirmDelete.call(confirmDeleteContext);
        expect(confirmDeleteContext.showDeleteConfirm).toBe(false);
        expect(confirmDeleteContext._commitEventDelete).toHaveBeenCalledWith('none');
    });

    it('dispatches success toasts for task and recurring event saves', () => {
        const dispatchEvent = jest.fn();
        const taskContext = {
            isEditMode: true,
            isSaving: true,
            isCalendarEventRecord: false,
            isTaskRecord: true,
            dispatchEvent
        };

        CalendarEventDrawer.prototype.handleSuccess.call(taskContext);

        expect(dispatchEvent.mock.calls[0][0].type).toBe('lightning__showtoast');
        expect(dispatchEvent.mock.calls[1][0].type).toBe('close');

        dispatchEvent.mockClear();

        const recurringContext = {
            isEditMode: true,
            isSaving: true,
            isCalendarEventRecord: true,
            isRecurringEvent: true,
            isTaskRecord: false,
            dispatchEvent
        };

        CalendarEventDrawer.prototype.handleSuccess.call(recurringContext);
        expect(dispatchEvent.mock.calls[0][0].type).toBe('lightning__showtoast');
        expect(dispatchEvent.mock.calls[1][0].type).toBe('close');
    });

    it('dispatches save errors, payload helpers, formatters, and open-record navigation correctly', () => {
        const dispatchEvent = jest.fn();
        const errorContext = {
            isSaving: true,
            dispatchEvent
        };
        CalendarEventDrawer.prototype.handleError.call(errorContext, {
            detail: { detail: 'Validation failed.' }
        });
        expect(errorContext.isSaving).toBe(false);
        expect(dispatchEvent.mock.calls[0][0].type).toBe('lightning__showtoast');

        expect(
            CalendarEventDrawer.prototype.buildCalendarEventMutationPayload.call(
                {},
                {
                    calendarId: 'a1x000000000001AAA',
                    name: 'Board Review',
                    startValue: '2026-04-18T09:00:00.000Z',
                    endValue: '2026-04-18T10:00:00.000Z',
                    allDay: false,
                    status: 'Confirmed',
                    notes: 'Review'
                }
            )
        ).toMatchObject({
            calendarId: 'a1x000000000001AAA',
            name: 'Board Review',
            status: 'Confirmed'
        });

        expect(
            CalendarEventDrawer.prototype.formatInputDateValue.call({}, '2026-04-18T09:00:00.000Z', false)
        ).toMatch(/^2026-04-18T\d{2}:\d{2}$/);
        expect(
            CalendarEventDrawer.prototype.formatInputDateValue.call({}, '2026-04-18T09:00:00.000Z', true)
        ).toBe('2026-04-18');
        expect(
            CalendarEventDrawer.prototype.formatDisplayDateValue.call({}, '2026-04-18T09:00:00.000Z', false)
        ).toContain('2026');
        expect(
            CalendarEventDrawer.prototype.parseInputDateValue.call({}, '2026-04-18', true, false)
        ).toMatch(/T\d{2}:\d{2}:00.000Z$/);
        expect(
            CalendarEventDrawer.prototype.buildAdjustedEventEndValue.call({}, '2026-04-18T09:00:00.000Z', true)
        ).toMatch(/T\d{2}:\d{2}:00.000Z$/);

        const openRecordContext = {
            recordId: 'a1B000000000001AAA',
            objectApiName: 'Calendar_Event__c',
            Navigate: jest.fn()
        };
        CalendarEventDrawer.prototype.handleOpenRecord.call(openRecordContext);
        expect(openRecordContext.Navigate).toHaveBeenCalledWith({
            type: 'standard__recordPage',
            attributes: {
                recordId: 'a1B000000000001AAA',
                objectApiName: 'Calendar_Event__c',
                actionName: 'view'
            }
        });
    });

    it('extracts drawer error messages from array, output, and fallback shapes', () => {
        expect(
            CalendarEventDrawer.prototype.extractErrorMessage.call({}, {
                body: [{ message: 'One' }, { message: 'Two' }]
            })
        ).toBe('One, Two');
        expect(
            CalendarEventDrawer.prototype.extractErrorMessage.call({}, {
                body: { output: { errors: [{ message: 'Output error' }] } }
            })
        ).toBe('Output error');
        expect(CalendarEventDrawer.prototype.extractErrorMessage.call({}, { message: 'Plain error' })).toBe(
            'Plain error'
        );
        expect(CalendarEventDrawer.prototype.extractErrorMessage.call({}, {})).toBe(
            'Unable to save this record.'
        );
    });

    it('routes non-recurring task deletes through the task delete endpoint', async () => {
        const dispatchEvent = jest.fn();
        const context = {
            recordId: '00T000000000001AAA',
            recordContextId: 'a1x000000000001AAA',
            isTaskRecord: true,
            isCalendarEventRecord: false,
            isRecurringEvent: false,
            dispatchEvent
        };

        CalendarEventDrawer.prototype._commitEventDelete.call(context, 'none');
        await flushPromises();

        expect(deleteTask).toHaveBeenCalledWith({
            recordId: '00T000000000001AAA',
            calendarViewId: 'a1x000000000001AAA'
        });
        expect(dispatchEvent.mock.calls[0][0].type).toBe('lightning__showtoast');
        expect(dispatchEvent.mock.calls[1][0].type).toBe('close');
    });
});
