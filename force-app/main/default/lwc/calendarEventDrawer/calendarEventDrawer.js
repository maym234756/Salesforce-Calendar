import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecord } from 'lightning/uiRecordApi';
import getCalendarEventEditorState from '@salesforce/apex/TeamCalendarRecordMutationService.getCalendarEventEditorState';
import updateCalendarEvent from '@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent';
import updateRecurringCalendarEvent from '@salesforce/apex/TeamCalendarRecordMutationService.updateRecurringCalendarEvent';
import updateTask from '@salesforce/apex/TeamCalendarRecordMutationService.updateTask';
import deleteCalendarEvent from '@salesforce/apex/TeamCalendarRecordMutationService.deleteCalendarEvent';
import deleteRecurringCalendarEvent from '@salesforce/apex/TeamCalendarRecordMutationService.deleteRecurringCalendarEvent';
import deleteTask from '@salesforce/apex/TeamCalendarRecordMutationService.deleteTask';

const TASK_FIELDS = [
    'Task.Subject',
    'Task.OwnerId',
    'Task.ActivityDate',
    'Task.Status',
    'Task.Priority',
    'Task.WhatId',
    'Task.WhoId',
    'Task.Description'
];

const EVENT_FIELDS = [
    'Calendar_Event__c.Name',
    'Calendar_Event__c.Calendar__c',
    'Calendar_Event__c.Status__c',
    'Calendar_Event__c.Start__c',
    'Calendar_Event__c.End__c',
    'Calendar_Event__c.All_Day__c',
    'Calendar_Event__c.Notes__c'
];

const TASK_STATUS_OPTIONS = [
    { label: 'Not Started', value: 'Not Started' },
    { label: 'In Progress', value: 'In Progress' },
    { label: 'Completed', value: 'Completed' },
    { label: 'Waiting on someone else', value: 'Waiting on someone else' },
    { label: 'Deferred', value: 'Deferred' }
];

const TASK_PRIORITY_OPTIONS = [
    { label: 'Low', value: 'Low' },
    { label: 'Normal', value: 'Normal' },
    { label: 'High', value: 'High' }
];

const EVENT_STATUS_OPTIONS = [
    { label: 'Planned', value: 'Planned' },
    { label: 'Confirmed', value: 'Confirmed' },
    { label: 'Cancelled', value: 'Cancelled' }
];

const RECURRING_SCOPE_OPTIONS = [
    { label: 'This event only', value: 'this' },
    { label: 'This and following events', value: 'thisAndFollowing' },
    { label: 'All events in the series', value: 'all' }
];

export default class CalendarEventDrawer extends NavigationMixin(LightningElement) {
    @api recordId;
    @api objectApiName = 'Calendar_Event__c';
    @api canEdit = false;
    @api canDelete = false;
    @api recordContextId;
    @api isRecurring = false;
    @api occurrenceDate = null;

    isEditMode = false;
    isSaving = false;
    isDeleting = false;
    showDeleteConfirm = false;
    showRecurrenceScopeModal = false;
    recurrenceScopeAction = null;
    selectedRecurringScope = 'this';
    isEventStateLoading = false;
    taskDraft = null;
    eventDraft = null;
    eventState = null;

    connectedCallback() {
        if (this.isCalendarEventRecord && this.recordId) {
            void this.loadEventState();
        }
    }

    get taskRecordId() {
        return this.isTaskRecord ? this.recordId : null;
    }

    get eventRecordId() {
        return this.isCalendarEventRecord ? this.recordId : null;
    }

    wiredTaskRecordResult;
    wiredEventRecordResult;

    @wire(getRecord, { recordId: '$taskRecordId', fields: TASK_FIELDS })
    wiredTaskRecord(result) {
        this.wiredTaskRecordResult = result;

        if (result?.data && this.isEditMode && this.isTaskRecord) {
            this.initializeTaskDraft();
        }
    }

    @wire(getRecord, { recordId: '$eventRecordId', fields: EVENT_FIELDS })
    wiredEventRecord(result) {
        this.wiredEventRecordResult = result;
    }

    get hasRecordId() {
        return Boolean(this.recordId);
    }

    get isViewMode() {
        return this.hasRecordId && !this.isEditMode;
    }

    get isTaskRecord() {
        return this.objectApiName === 'Task';
    }

    get isCalendarEventRecord() {
        return !this.isTaskRecord;
    }

    get drawerTitle() {
        if (this.isEditMode) {
            return this.isTaskRecord ? 'Edit Task' : 'Edit Event';
        }

        return this.isTaskRecord ? 'Task Details' : 'Event Details';
    }

    get showEditButton() {
        return this.canEdit === true;
    }

    get showDeleteButton() {
        return this.canDelete === true;
    }

    get deleteButtonLabel() {
        return this.isTaskRecord ? 'Delete Task' : 'Delete Event';
    }

    get isRecurringEvent() {
        return this.isCalendarEventRecord && this.isRecurring === true;
    }

    get recurringBadgeLabel() {
        return 'Recurring Event';
    }

    get recurringScopeOptions() {
        return RECURRING_SCOPE_OPTIONS;
    }

    get recurrenceScopeModalTitle() {
        return this.recurrenceScopeAction === 'delete' ? 'Delete Recurring Event' : 'Edit Recurring Event';
    }

    get recurrenceScopeConfirmLabel() {
        return this.recurrenceScopeAction === 'delete' ? 'Delete' : 'Save';
    }

    get taskStatusOptions() {
        return TASK_STATUS_OPTIONS;
    }

    get taskPriorityOptions() {
        return TASK_PRIORITY_OPTIONS;
    }

    get taskSubjectValue() {
        return this.taskDraft?.subject || '';
    }

    get taskActivityDateValue() {
        return this.taskDraft?.activityDate || '';
    }

    get taskStatusValue() {
        return this.taskDraft?.status || 'Not Started';
    }

    get taskPriorityValue() {
        return this.taskDraft?.priority || 'Normal';
    }

    get taskDescriptionValue() {
        return this.taskDraft?.description || '';
    }

    get eventStatusOptions() {
        return EVENT_STATUS_OPTIONS;
    }

    get eventNameValue() {
        return this.eventDraft?.name || '';
    }

    get eventCalendarValue() {
        return this.eventDraft?.calendarId || '';
    }

    get eventStatusValue() {
        return this.eventDraft?.status || 'Planned';
    }

    get hasEventState() {
        return Boolean(this.eventState);
    }

    get eventViewName() {
        return this.eventState?.name || '';
    }

    get eventViewCalendarValue() {
        return this.eventState?.calendarId || '';
    }

    get eventViewStatus() {
        return this.eventState?.status || 'Planned';
    }

    get eventViewAllDayLabel() {
        return this.eventState?.allDay === true ? 'Yes' : 'No';
    }

    get eventViewStartValue() {
        return this.formatDisplayDateValue(this.eventState?.startValue, this.eventState?.allDay === true);
    }

    get eventViewEndValue() {
        return this.formatDisplayDateValue(this.eventState?.endValue, this.eventState?.allDay === true);
    }

    get eventViewNotesValue() {
        return this.eventState?.notes || '';
    }

    get eventNotesValue() {
        return this.eventDraft?.notes || '';
    }

    get eventAllDayValue() {
        return this.eventDraft?.allDay === true;
    }

    get eventScheduleInputType() {
        return this.eventAllDayValue ? 'date' : 'datetime-local';
    }

    get eventStartInputValue() {
        return this.formatInputDateValue(this.eventDraft?.startValue, this.eventAllDayValue);
    }

    get eventEndInputValue() {
        return this.formatInputDateValue(this.eventDraft?.endValue, this.eventAllDayValue);
    }

    handleClose() {
        this.isEditMode = false;
        this.taskDraft = null;
        this.eventDraft = null;
        this.eventState = null;
        this.dispatchEvent(new CustomEvent('close'));
    }

    async handleEdit() {
        if (this.canEdit !== true) {
            return;
        }

        if (this.isTaskRecord) {
            this.initializeTaskDraft();
        } else {
            await this.loadEventDraft();
        }

        this.isEditMode = true;
    }

    handleCancelEdit() {
        this.isEditMode = false;
        this.taskDraft = null;
        this.eventDraft = null;
    }

    initializeTaskDraft() {
        const record = this.wiredTaskRecordResult?.data;

        this.taskDraft = {
            subject: this.getTaskFieldValue(record, 'Subject') || '',
            ownerId: this.getTaskFieldValue(record, 'OwnerId') || null,
            activityDate: this.getTaskFieldValue(record, 'ActivityDate') || null,
            status: this.getTaskFieldValue(record, 'Status') || 'Not Started',
            priority: this.getTaskFieldValue(record, 'Priority') || 'Normal',
            whatId: this.getTaskFieldValue(record, 'WhatId') || null,
            whoId: this.getTaskFieldValue(record, 'WhoId') || null,
            description: this.getTaskFieldValue(record, 'Description') || ''
        };
    }

    getTaskFieldValue(record, fieldName) {
        return record?.fields?.[fieldName]?.value ?? null;
    }

    getEventFieldValue(record, fieldName) {
        return record?.fields?.[fieldName]?.value ?? null;
    }

    initializeEventDraft() {
        this.eventDraft = this.cloneEventStateAsDraft(this.eventState);
    }

    cloneEventStateAsDraft(source) {
        if (!source) {
            return null;
        }

        return {
            name: source.name || '',
            calendarId: source.calendarId || null,
            status: source.status || 'Planned',
            startValue: source.startValue || null,
            endValue: source.endValue || null,
            allDay: source.allDay === true,
            notes: source.notes || ''
        };
    }

    async loadEventState() {
        if (!this.recordId) {
            this.eventState = null;
            this.eventDraft = null;
            return;
        }

        this.isEventStateLoading = true;

        try {
            const result = await getCalendarEventEditorState({
                recordId: this.recordId
            });

            this.eventState = {
                name: result?.name || '',
                calendarId: result?.calendarId || null,
                status: result?.status || 'Planned',
                startValue: result?.startValue || null,
                endValue: result?.endValue || null,
                allDay: result?.allDay === true,
                notes: result?.notes || ''
            };

            if (this.isEditMode) {
                this.eventDraft = this.cloneEventStateAsDraft(this.eventState);
            }
        } catch (error) {
            this.handleError({
                detail: {
                    message: this.extractErrorMessage(error)
                }
            });
        } finally {
            this.isEventStateLoading = false;
        }
    }

    async loadEventDraft() {
        await this.loadEventState();
        this.eventDraft = this.cloneEventStateAsDraft(this.eventState);
    }

    handleTaskFieldChange(event) {
        const fieldName = event.target.dataset.field;
        if (!fieldName) {
            return;
        }

        this.taskDraft = {
            ...(this.taskDraft || {}),
            [fieldName]: event.detail?.value ?? event.target.value
        };
    }

    handleEventFieldChange(event) {
        const fieldName = event.target.dataset.field;
        if (!fieldName) {
            return;
        }

        const rawValue = event.detail?.value ?? event.target.value;
        let nextValue = rawValue;

        if (fieldName === 'allDay') {
            nextValue = event.target.checked === true;
        }

        this.eventDraft = {
            ...(this.eventDraft || {}),
            [fieldName]: nextValue
        };

        if (fieldName === 'allDay') {
            const startValue = this.eventDraft?.startValue;
            if (startValue) {
                this.eventDraft = {
                    ...this.eventDraft,
                    startValue: this.parseInputDateValue(
                        this.formatInputDateValue(startValue, nextValue),
                        nextValue,
                        false
                    ),
                    endValue: this.parseInputDateValue(
                        this.formatInputDateValue(this.eventDraft?.endValue, nextValue),
                        nextValue,
                        true
                    )
                };
            }
            return;
        }

        if (fieldName === 'startValue') {
            const parsedStart = this.parseInputDateValue(rawValue, this.eventAllDayValue, false);
            const parsedEnd = this.eventDraft?.endValue
                ? this.parseInputDateValue(
                    this.formatInputDateValue(this.eventDraft.endValue, this.eventAllDayValue),
                    this.eventAllDayValue,
                    true
                )
                : null;
            this.eventDraft = {
                ...this.eventDraft,
                startValue: parsedStart,
                endValue: parsedEnd && parsedEnd > parsedStart
                    ? parsedEnd
                    : this.buildAdjustedEventEndValue(parsedStart, this.eventAllDayValue)
            };
            return;
        }

        if (fieldName === 'endValue') {
            this.eventDraft = {
                ...this.eventDraft,
                endValue: this.parseInputDateValue(rawValue, this.eventAllDayValue, true)
            };
        }
    }

    handleTaskSave() {
        if (!this.recordId || !this.isTaskRecord) {
            return;
        }

        if (!this.taskDraft?.subject) {
            this.handleError({
                detail: {
                    message: 'Task subject is required.'
                }
            });
            return;
        }

        this.isSaving = true;

        updateTask({
            requestJson: JSON.stringify({
                recordId: this.recordId,
                calendarViewId: this.recordContextId || null,
                subject: this.taskDraft.subject,
                ownerId: this.taskDraft.ownerId,
                activityDate: this.taskDraft.activityDate,
                status: this.taskDraft.status,
                priority: this.taskDraft.priority,
                whatId: this.taskDraft.whatId,
                whoId: this.taskDraft.whoId,
                description: this.taskDraft.description
            })
        })
            .then(() => {
                this.handleSuccess();
            })
            .catch((error) => {
                this.handleError({
                    detail: {
                        message: this.extractErrorMessage(error)
                    }
                });
            });
    }

    handleEventSave() {
        if (!this.recordId || !this.isCalendarEventRecord) {
            return;
        }

        if (!this.eventDraft?.name) {
            this.handleError({
                detail: {
                    message: 'Event name is required.'
                }
            });
            return;
        }

        if (!this.eventDraft?.startValue || !this.eventDraft?.endValue) {
            this.handleError({
                detail: {
                    message: 'Start and end are required.'
                }
            });
            return;
        }

        if (this.isRecurringEvent) {
            this.recurrenceScopeAction = 'edit';
            this.selectedRecurringScope = 'this';
            this.showRecurrenceScopeModal = true;
            return;
        }

        this._commitEventSave('none');
    }

    _commitEventSave(scope) {
        this.isSaving = true;

        if (scope === 'none') {
            updateCalendarEvent({
                requestJson: JSON.stringify({
                    recordId: this.recordId,
                    calendarId: this.eventDraft.calendarId,
                    name: this.eventDraft.name,
                    startValue: this.eventDraft.startValue,
                    endValue: this.eventDraft.endValue,
                    allDay: this.eventDraft.allDay === true,
                    status: this.eventDraft.status,
                    notes: this.eventDraft.notes
                })
            })
                .then(() => { this.handleSuccess(); })
                .catch((error) => {
                    this.handleError({ detail: { message: this.extractErrorMessage(error) } });
                });
        } else {
            updateRecurringCalendarEvent({
                requestJson: JSON.stringify({
                    recordId: this.recordId,
                    scope,
                    occurrenceDate: this.occurrenceDate,
                    eventData: {
                        calendarId: this.eventDraft.calendarId,
                        name: this.eventDraft.name,
                        startValue: this.eventDraft.startValue,
                        endValue: this.eventDraft.endValue,
                        allDay: this.eventDraft.allDay === true,
                        status: this.eventDraft.status,
                        notes: this.eventDraft.notes
                    }
                })
            })
                .then(() => { this.handleSuccess(); })
                .catch((error) => {
                    this.handleError({ detail: { message: this.extractErrorMessage(error) } });
                });
        }
    }

    handleDelete() {
        if (!this.recordId || this.canDelete !== true || this.isDeleting) {
            return;
        }

        if (this.isRecurringEvent) {
            this.recurrenceScopeAction = 'delete';
            this.selectedRecurringScope = 'this';
            this.showRecurrenceScopeModal = true;
            return;
        }

        this.deleteConfirmMessage = 'Delete this ' + (this.isTaskRecord ? 'task' : 'event') + '?';
        this.showDeleteConfirm = true;
    }

    handleCancelDelete() {
        this.showDeleteConfirm = false;
    }

    handleRecurringScopeChange(event) {
        this.selectedRecurringScope = event.detail?.value || 'this';
    }

    handleCancelRecurringScope() {
        this.showRecurrenceScopeModal = false;
        this.recurrenceScopeAction = null;
        this.isSaving = false;
    }

    handleConfirmRecurringScope() {
        this.showRecurrenceScopeModal = false;
        const scope = this.selectedRecurringScope || 'this';

        if (this.recurrenceScopeAction === 'delete') {
            this._commitEventDelete(scope);
        } else {
            this._commitEventSave(scope);
        }
    }

    handleConfirmDelete() {
        this.showDeleteConfirm = false;
        this._commitEventDelete('none');
    }

    _commitEventDelete(scope) {
        this.isDeleting = true;

        if (scope === 'none') {
            const requestPromise = this.isTaskRecord
                ? deleteTask({
                    recordId: this.recordId,
                    calendarViewId: this.recordContextId || null
                })
                : deleteCalendarEvent({ recordId: this.recordId });

            requestPromise
                .then(() => {
                    this.isDeleting = false;
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: this.isTaskRecord ? 'Task Deleted' : 'Event Deleted',
                            message: this.isTaskRecord ? 'Task deleted successfully.' : 'Calendar event deleted successfully.',
                            variant: 'success'
                        })
                    );
                    this.dispatchEvent(new CustomEvent('close'));
                })
                .catch((error) => {
                    this.isDeleting = false;
                    this.handleError({
                        detail: { message: this.extractErrorMessage(error) }
                    });
                });
        } else {
            deleteRecurringCalendarEvent({
                recordId: this.recordId,
                scope,
                occurrenceDate: this.occurrenceDate || ''
            })
                .then(() => {
                    this.isDeleting = false;
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Event Deleted',
                            message: 'Recurring calendar event deleted successfully.',
                            variant: 'success'
                        })
                    );
                    this.dispatchEvent(new CustomEvent('close'));
                })
                .catch((error) => {
                    this.isDeleting = false;
                    this.handleError({
                        detail: { message: this.extractErrorMessage(error) }
                    });
                });
        }
    }

    handleSuccess() {
        this.isEditMode = false;
        this.isSaving = false;

        this.dispatchEvent(
            new ShowToastEvent({
                title: this.isTaskRecord ? 'Task Updated' : 'Event Updated',
                message: this.isTaskRecord
                    ? 'Task saved successfully.'
                    : 'Calendar event saved successfully.',
                variant: 'success'
            })
        );

        this.dispatchEvent(new CustomEvent('close'));
    }

    handleError(event) {
        this.isSaving = false;
        const detail = event?.detail;
        const message =
            detail?.message ||
            detail?.detail ||
            'Unable to save this calendar event.';

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Save Error',
                message,
                variant: 'error'
            })
        );
    }

    formatInputDateValue(rawValue, isAllDay) {
        if (!rawValue) {
            return '';
        }

        const date = new Date(rawValue);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        const year = String(date.getFullYear());
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        if (isAllDay) {
            return `${year}-${month}-${day}`;
        }

        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    formatDisplayDateValue(rawValue, isAllDay) {
        if (!rawValue) {
            return '';
        }

        const date = new Date(rawValue);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        if (isAllDay) {
            return date.toLocaleDateString();
        }

        return date.toLocaleString();
    }

    parseInputDateValue(rawValue, isAllDay, useEndOfDay) {
        if (!rawValue) {
            return null;
        }

        if (isAllDay) {
            const date = new Date(`${rawValue}T00:00:00`);
            if (Number.isNaN(date.getTime())) {
                return null;
            }

            if (useEndOfDay) {
                date.setHours(23, 59, 0, 0);
            } else {
                date.setHours(0, 0, 0, 0);
            }

            return date.toISOString();
        }

        const date = new Date(rawValue);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    buildAdjustedEventEndValue(startValue, isAllDay) {
        if (!startValue) {
            return null;
        }

        const startDate = new Date(startValue);
        if (Number.isNaN(startDate.getTime())) {
            return null;
        }

        if (isAllDay) {
            startDate.setHours(23, 59, 0, 0);
            return startDate.toISOString();
        }

        startDate.setHours(startDate.getHours() + 1);
        return startDate.toISOString();
    }

    handleOpenRecord() {
        if (!this.recordId) {
            return;
        }

        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.recordId,
                objectApiName: this.objectApiName || 'Calendar_Event__c',
                actionName: 'view'
            }
        });
    }

    extractErrorMessage(error) {
        if (Array.isArray(error?.body)) {
            return error.body.map((row) => row.message).filter(Boolean).join(', ');
        }

        return (
            error?.body?.message ||
            error?.body?.output?.errors?.[0]?.message ||
            error?.message ||
            'Unable to save this record.'
        );
    }
}