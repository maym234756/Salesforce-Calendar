import { LightningElement, api } from 'lwc';
import getPlanningContext from '@salesforce/apex/TeamCalendarEventPlannerController.getPlanningContext';
import resolveCalendarIdForAssignedUser from '@salesforce/apex/TeamCalendarEventPlannerController.resolveCalendarIdForAssignedUser';
import createCalendarEventSeries from '@salesforce/apex/TeamCalendarRecordMutationService.createCalendarEventSeries';
import { buildDefaultDateTime } from 'c/calendarUtils';

const DEFAULT_START_HOUR = 9;
const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_APPOINTMENT_TYPE = 'Personal';
const DEFAULT_REMINDER_OFFSET = 'None';
const DEFAULT_FOLLOW_UP_FREQUENCY = 'none';
const DEFAULT_TEMPLATE_KEY = 'custom';
const MAX_FOLLOW_UP_COUNT = 12;
const MAX_FOLLOW_UP_PREVIEW_ROWS = 6;
const DEFAULT_EVENT_STATUS = 'Planned';

function createDefaultAvailabilityInsight() {
    return {
        allowed: false,
        hasConflicts: false,
        conflictCount: 0,
        summary: 'Choose Assign To, Start, and End to check availability.',
        tone: 'neutral',
        conflicts: []
    };
}

function createDefaultCustomerContext() {
    return {
        contactId: null,
        contactName: '',
        resolvedAccountId: null,
        resolvedAccountName: '',
        suggestedName: ''
    };
}

function buildFollowUpName(name, occurrenceIndex) {
    const baseName = (name || 'Calendar Event').trim();
    return `${baseName} (Follow-up ${occurrenceIndex})`;
}

export function buildAssignableUserOptions(activeUserOptions) {
    return Array.isArray(activeUserOptions)
        ? activeUserOptions
              .filter((option) => option && option.id)
              .map((option) => ({
                  label: option.label || option.name || option.id,
                  value: option.id
              }))
        : [];
}

export function resolveDefaultAssignedUserId(currentUserId, assignableOptions) {
    if (
        currentUserId &&
        Array.isArray(assignableOptions) &&
        assignableOptions.some((option) => option.value === currentUserId)
    ) {
        return currentUserId;
    }

    return Array.isArray(assignableOptions) && assignableOptions.length
        ? assignableOptions[0].value
        : null;
}

export function buildEventTemplateOptions() {
    return [
        { label: 'Custom', value: DEFAULT_TEMPLATE_KEY },
        { label: 'Sales Call', value: 'salesCall' },
        { label: 'Service Follow-Up', value: 'serviceFollowUp' },
        { label: 'Internal Review', value: 'internalReview' }
    ];
}

export function buildTemplatePreset(templateKey) {
    switch (templateKey) {
        case 'salesCall':
            return {
                appointmentType: 'Customer',
                reminderOffset: '30 Minutes',
                durationMinutes: 60,
                followUpFrequency: 'none',
                followUpCount: 0,
                description: 'Use this for customer outreach and discovery calls.'
            };
        case 'serviceFollowUp':
            return {
                appointmentType: 'Follow-Up',
                reminderOffset: '1 Day',
                durationMinutes: 30,
                followUpFrequency: 'weekly',
                followUpCount: 3,
                description: 'Use this for post-visit check-ins and service callbacks.'
            };
        case 'internalReview':
            return {
                appointmentType: 'Internal',
                reminderOffset: '15 Minutes',
                durationMinutes: 60,
                followUpFrequency: 'none',
                followUpCount: 0,
                description: 'Use this for internal planning, prep, and review sessions.'
            };
        default:
            return {
                appointmentType: null,
                reminderOffset: null,
                durationMinutes: null,
                followUpFrequency: null,
                followUpCount: null,
                description: 'Build your own event without a preset.'
            };
    }
}

export function buildResolvedCalendarLabel(calendarValue) {
    return calendarValue || 'Will resolve or be created on save';
}

export function normalizeFollowUpCount(value) {
    const parsed = parseInt(value, 10);

    if (Number.isNaN(parsed) || parsed < 0) {
        return 0;
    }

    return Math.min(parsed, MAX_FOLLOW_UP_COUNT);
}

export function shiftDateTimeValue(value, frequency, occurrenceIndex) {
    if (!value || !frequency || frequency === DEFAULT_FOLLOW_UP_FREQUENCY || occurrenceIndex < 1) {
        return value || null;
    }

    const shiftedDate = new Date(value);
    if (Number.isNaN(shiftedDate.getTime())) {
        return null;
    }

    switch (frequency) {
        case 'daily':
            shiftedDate.setDate(shiftedDate.getDate() + occurrenceIndex);
            break;
        case 'weekly':
            shiftedDate.setDate(shiftedDate.getDate() + (7 * occurrenceIndex));
            break;
        case 'biweekly':
            shiftedDate.setDate(shiftedDate.getDate() + (14 * occurrenceIndex));
            break;
        case 'monthly':
            shiftedDate.setMonth(shiftedDate.getMonth() + occurrenceIndex);
            break;
        default:
            return value;
    }

    return shiftedDate.toISOString();
}

export function buildFollowUpPreviewRows(startValue, endValue, frequency, count) {
    const normalizedCount = normalizeFollowUpCount(count);
    if (!startValue || normalizedCount < 1 || !frequency || frequency === DEFAULT_FOLLOW_UP_FREQUENCY) {
        return [];
    }

    const previewRows = [];
    const previewCount = Math.min(normalizedCount, MAX_FOLLOW_UP_PREVIEW_ROWS);

    for (let occurrenceIndex = 1; occurrenceIndex <= previewCount; occurrenceIndex += 1) {
        previewRows.push({
            key: `${occurrenceIndex}`,
            occurrenceIndex,
            startValue: shiftDateTimeValue(startValue, frequency, occurrenceIndex),
            endValue: shiftDateTimeValue(endValue, frequency, occurrenceIndex)
        });
    }

    return previewRows;
}

export function resolveFollowUpAppointmentType(appointmentType) {
    if (appointmentType === 'Customer' || appointmentType === 'Follow-Up') {
        return 'Follow-Up';
    }

    return appointmentType || DEFAULT_APPOINTMENT_TYPE;
}

export function buildFollowUpSeries(snapshot, frequency, count) {
    const normalizedCount = normalizeFollowUpCount(count);
    if (!snapshot || !snapshot.Start__c || normalizedCount < 1 || !frequency || frequency === DEFAULT_FOLLOW_UP_FREQUENCY) {
        return [];
    }

    const followUpType = resolveFollowUpAppointmentType(snapshot.Appointment_Type__c);
    const rows = [];

    for (let occurrenceIndex = 1; occurrenceIndex <= normalizedCount; occurrenceIndex += 1) {
        rows.push({
            Name: buildFollowUpName(snapshot.Name, occurrenceIndex),
            Calendar__c: snapshot.Calendar__c || null,
            Start__c: shiftDateTimeValue(snapshot.Start__c, frequency, occurrenceIndex),
            End__c: shiftDateTimeValue(snapshot.End__c, frequency, occurrenceIndex),
            All_Day__c: snapshot.All_Day__c === true,
            Status__c: snapshot.Status__c,
            Notes__c: snapshot.Notes__c || null,
            OwnerId: snapshot.OwnerId || null,
            Appointment_Type__c: followUpType,
            Private_To_Owner__c: snapshot.Private_To_Owner__c === true,
            Reminder_Offset_Minutes__c: snapshot.Reminder_Offset_Minutes__c || DEFAULT_REMINDER_OFFSET,
            Customer_Account__c: snapshot.Customer_Account__c || null,
            Customer_Contact__c: snapshot.Customer_Contact__c || null
        });
    }

    return rows;
}

export default class CalendarCreateModal extends LightningElement {
    @api defaultCalendarId;
    @api defaultStart;
    @api defaultEnd;
    @api activeUserOptions = [];
    @api currentUserId;

    formInitialized = false;
    startValue;
    endValue;
    allDayValue = false;
    selectedDurationMinutes = DEFAULT_DURATION_MINUTES;
    selectedAssignedUserId;
    appointmentTypeValue = DEFAULT_APPOINTMENT_TYPE;
    reminderOffsetValue = DEFAULT_REMINDER_OFFSET;
    followUpFrequency = DEFAULT_FOLLOW_UP_FREQUENCY;
    followUpCount = 0;
    formError = '';
    isSaving = false;
    pendingSubmissionSnapshot = null;
    selectedTemplateKey = DEFAULT_TEMPLATE_KEY;
    availabilityInsight = createDefaultAvailabilityInsight();
    customerContext = createDefaultCustomerContext();
    customerAccountId = null;
    customerContactId = null;
    lastAutoResolvedAccountId = null;
    nameValue = '';
    calendarValue = null;
    statusValue = DEFAULT_EVENT_STATUS;
    notesValue = '';
    lastSuggestedName = '';
    isLoadingPlanningContext = false;
    planningContextSequence = 0;
    calendarResolutionSequence = 0;

    renderedCallback() {
        if (this.formInitialized) {
            return;
        }

        this.formInitialized = true;
        this.startValue = this.resolvedDefaultStart;
        this.endValue = this.resolvedDefaultEnd;
        this.selectedAssignedUserId = resolveDefaultAssignedUserId(
            this.currentUserId,
            this.assignedUserOptions
        );
        this.calendarValue = this.defaultCalendarId || null;
        this.statusValue = DEFAULT_EVENT_STATUS;
        this.notesValue = '';
        this.nameValue = '';

        this.syncCalendarWithAssignedUser();
        this.refreshPlanningContext();
    }

    get presetButtons() {
        return [30, 60, 90, 120].map((minutes) => ({
            key: `${minutes}`,
            minutes,
            label: `${minutes}m`,
            className:
                minutes === this.selectedDurationMinutes
                    ? 'preset-btn preset-btn--active'
                    : 'preset-btn'
        }));
    }

    get isTimedEvent() {
        return !this.allDayValue;
    }

    get appointmentTypeOptions() {
        return [
            { label: 'Personal', value: 'Personal' },
            { label: 'Internal', value: 'Internal' },
            { label: 'Customer', value: 'Customer' },
            { label: 'Follow-Up', value: 'Follow-Up' }
        ];
    }

    get templateOptions() {
        return buildEventTemplateOptions();
    }

    get selectedTemplatePreset() {
        return buildTemplatePreset(this.selectedTemplateKey);
    }

    get templateDescription() {
        return this.selectedTemplatePreset.description;
    }

    get assignedUserOptions() {
        return buildAssignableUserOptions(this.activeUserOptions);
    }

    get isSelectedAssignedUserAllowed() {
        return this.assignedUserOptions.some((option) => option.value === this.selectedAssignedUserId);
    }

    get reminderOptions() {
        return [
            { label: 'No reminder', value: 'None' },
            { label: '15 minutes before', value: '15 Minutes' },
            { label: '30 minutes before', value: '30 Minutes' },
            { label: '1 hour before', value: '1 Hour' },
            { label: '1 day before', value: '1 Day' }
        ];
    }

    get followUpFrequencyOptions() {
        return [
            { label: 'No follow-up series', value: 'none' },
            { label: 'Daily', value: 'daily' },
            { label: 'Weekly', value: 'weekly' },
            { label: 'Every 2 weeks', value: 'biweekly' },
            { label: 'Monthly', value: 'monthly' }
        ];
    }

    get followUpCountValue() {
        return normalizeFollowUpCount(this.followUpCount);
    }

    get followUpPreviewRows() {
        return buildFollowUpPreviewRows(
            this.startValue,
            this.endValue,
            this.followUpFrequency,
            this.followUpCountValue
        ).map((row) => ({
            ...row,
            label: this.formatPreviewRange(row.startValue, row.endValue)
        }));
    }

    get showFollowUpPreview() {
        return this.followUpPreviewRows.length > 0;
    }

    get hiddenFollowUpCount() {
        return Math.max(this.followUpCountValue - this.followUpPreviewRows.length, 0);
    }

    get hiddenFollowUpPluralSuffix() {
        return this.hiddenFollowUpCount === 1 ? '' : 's';
    }

    get showCustomerConnection() {
        return this.appointmentTypeValue === 'Customer' || this.appointmentTypeValue === 'Follow-Up';
    }

    get showCustomerSummary() {
        return this.showCustomerConnection && (
            Boolean(this.customerContext?.contactName) ||
            Boolean(this.customerContext?.resolvedAccountName)
        );
    }

    get customerSummaryText() {
        const labels = [];

        if (this.customerContext?.contactName) {
            labels.push(`Contact: ${this.customerContext.contactName}`);
        }

        if (this.customerContext?.resolvedAccountName) {
            labels.push(`Account: ${this.customerContext.resolvedAccountName}`);
        }

        return labels.join(' | ');
    }

    get showAvailabilityHint() {
        return Boolean(this.availabilityInsight?.summary);
    }

    get hasAvailabilityConflicts() {
        return this.availabilityInsight?.hasConflicts === true;
    }

    get availabilityCardClass() {
        const tone = this.availabilityInsight?.tone || 'neutral';
        return `planner-card planner-card--${tone}`;
    }

    get appointmentTypeHelpText() {
        switch (this.appointmentTypeValue) {
            case 'Internal':
                return 'Assign the event to an active Salesforce employee while keeping it on the selected team calendar.';
            case 'Customer':
                return 'Use customer appointments when the meeting should stay tied to an account or contact.';
            case 'Follow-Up':
                return 'Use follow-up mode when this event starts a recurring customer touchpoint cadence.';
            default:
                return 'Personal appointments default to your own ownership and keep the workflow lightweight.';
        }
    }

    get followUpHelpText() {
        if (this.followUpCountValue > 0 && this.followUpFrequency !== DEFAULT_FOLLOW_UP_FREQUENCY) {
            return `Saving will create the main event plus ${this.followUpCountValue} additional ${this.followUpFrequency} follow-up event${this.followUpCountValue === 1 ? '' : 's'}.`;
        }

        return 'Create the first event now and optionally generate a follow-up series from the same details.';
    }

    get durationSummary() {
        if (this.allDayValue) {
            return 'All-day event';
        }

        const minutes = this.selectedDurationMinutes;
        if (minutes < 60) {
            return `${minutes} minutes`;
        }

        const hours = minutes / 60;
        return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? '' : 's'}` : `${minutes} minutes`;
    }

    get timeHint() {
        if (this.allDayValue) {
            return 'All-day keeps the same calendar date and syncs to Google as a full-day event.';
        }

        return 'Quick duration buttons update the end time from the selected start.';
    }

    get eventStatusOptions() {
        return [
            { label: 'Planned', value: 'Planned' },
            { label: 'Confirmed', value: 'Confirmed' },
            { label: 'Cancelled', value: 'Cancelled' }
        ];
    }

    get scheduleInputType() {
        return this.allDayValue ? 'date' : 'datetime-local';
    }

    get startInputValue() {
        return this.formatInputDateValue(this.startValue, this.allDayValue);
    }

    get endInputValue() {
        return this.formatInputDateValue(this.endValue, this.allDayValue);
    }

    get resolvedCalendarLabel() {
        return buildResolvedCalendarLabel(this.calendarValue);
    }

    get resolvedDefaultStart() {
        if (!this.defaultStart) {
            return null;
        }

        return this.resolveDateValue(this.defaultStart, DEFAULT_START_HOUR);
    }

    get resolvedDefaultEnd() {
        if (this.defaultEnd) {
            return this.resolveDateValue(this.defaultEnd, DEFAULT_START_HOUR + 1);
        }

        if (!this.defaultStart) {
            return null;
        }

        const startValue = this.resolveDateValue(this.defaultStart, DEFAULT_START_HOUR);
        if (!startValue) {
            return null;
        }

        const startDate = new Date(startValue);
        startDate.setMinutes(startDate.getMinutes() + DEFAULT_DURATION_MINUTES);
        return startDate.toISOString();
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    dispatchSaveSuccess(result) {
        this.isSaving = false;
        this.pendingSubmissionSnapshot = null;
        this.dispatchEvent(
            new CustomEvent('success', {
                detail: {
                    id: result?.recordId,
                    followUpRequestedCount: result?.followUpRequestedCount || 0,
                    followUpCreatedCount: result?.followUpCreatedCount || 0,
                    followUpFailedCount: result?.followUpFailedCount || 0
                }
            })
        );
    }

    handleError(event) {
        this.isSaving = false;
        this.pendingSubmissionSnapshot = null;
        this.dispatchEvent(
            new CustomEvent('error', {
                detail: event.detail
            })
        );
    }

    handleSave() {
        this.formError = '';

        const shouldStayOwnerOnly =
            this.appointmentTypeValue === 'Personal' &&
            this.selectedAssignedUserId === this.currentUserId;

        const fields = {
            Name: this.nameValue || null,
            Calendar__c: this.calendarValue || null,
            Status__c: this.statusValue || DEFAULT_EVENT_STATUS,
            Notes__c: this.notesValue || null,
            Start__c: this.startValue,
            End__c: this.endValue,
            All_Day__c: this.allDayValue === true,
            OwnerId: this.selectedAssignedUserId || null,
            Appointment_Type__c: this.appointmentTypeValue,
            Private_To_Owner__c: shouldStayOwnerOnly,
            Reminder_Offset_Minutes__c: this.reminderOffsetValue,
            Customer_Account__c: this.showCustomerConnection ? this.customerAccountId || null : null,
            Customer_Contact__c: this.showCustomerConnection ? this.customerContactId || null : null
        };

        if (!this.validateCustomForm(fields)) {
            return;
        }

        this.pendingSubmissionSnapshot = {
            Name: fields.Name,
            Calendar__c: fields.Calendar__c,
            Start__c: fields.Start__c,
            End__c: fields.End__c,
            All_Day__c: fields.All_Day__c === true,
            Status__c: fields.Status__c,
            Notes__c: fields.Notes__c,
            OwnerId: fields.OwnerId,
            Appointment_Type__c: fields.Appointment_Type__c,
            Private_To_Owner__c: fields.Private_To_Owner__c === true,
            Reminder_Offset_Minutes__c: fields.Reminder_Offset_Minutes__c,
            Customer_Account__c: fields.Customer_Account__c,
            Customer_Contact__c: fields.Customer_Contact__c
        };

        this.isSaving = true;

        const followUpSeries = buildFollowUpSeries(
            this.pendingSubmissionSnapshot,
            this.followUpFrequency,
            this.followUpCountValue
        );

        createCalendarEventSeries({
            requestJson: JSON.stringify({
                primaryEvent: this.toCalendarEventMutationInput(this.pendingSubmissionSnapshot),
                followUpEvents: followUpSeries.map((row) => this.toCalendarEventMutationInput(row))
            })
        })
            .then((result) => {
                this.dispatchSaveSuccess(result);
            })
            .catch((error) => {
                this.handleError({
                    detail: {
                        message: this.extractErrorMessage(error)
                    }
                });
            });
    }

    handleStartChange(event) {
        const rawValue = event.detail?.value || event.target?.value || null;
        this.startValue = this.parseInputDateValue(rawValue, this.allDayValue, false);

        if (!this.startValue) {
            return;
        }

        if (this.allDayValue) {
            this.endValue = this.buildAllDayEndValue(this.startValue);
        } else {
            const currentEnd = this.endValue ? new Date(this.endValue) : null;
            const currentStart = new Date(this.startValue);

            if (!currentEnd || Number.isNaN(currentEnd.getTime()) || currentEnd <= currentStart) {
                this.endValue = this.buildTimedEndValue(this.startValue, this.selectedDurationMinutes);
            }
        }

        this.refreshPlanningContext();
    }

    handleEndChange(event) {
        const rawValue = event.detail?.value || event.target?.value || null;
        this.endValue = this.parseInputDateValue(rawValue, this.allDayValue, true);
        this.refreshPlanningContext();
    }

    handleAllDayChange(event) {
        this.allDayValue = this.resolveCheckboxValue(event);

        if (!this.startValue) {
            this.startValue = this.resolvedDefaultStart;
        }

        if (!this.startValue) {
            return;
        }

        if (this.allDayValue) {
            this.startValue = this.buildAllDayStartValue(this.startValue);
            this.endValue = this.buildAllDayEndValue(this.startValue);
        } else {
            const timedStart = this.buildTimedStartValue(this.startValue);
            this.startValue = timedStart;
            this.endValue = this.buildTimedEndValue(timedStart, this.selectedDurationMinutes);
        }

        this.refreshPlanningContext();
    }

    handleDurationClick(event) {
        const minutes = parseInt(event.currentTarget.dataset.minutes, 10);
        if (Number.isNaN(minutes)) {
            return;
        }

        this.selectedDurationMinutes = minutes;

        if (this.allDayValue) {
            return;
        }

        if (!this.startValue) {
            this.startValue = this.resolvedDefaultStart;
        }

        if (!this.startValue) {
            return;
        }

        this.endValue = this.buildTimedEndValue(this.startValue, minutes);
        this.refreshPlanningContext();
    }

    handleTemplateChange(event) {
        this.selectedTemplateKey = event.detail?.value || DEFAULT_TEMPLATE_KEY;
        const preset = this.selectedTemplatePreset;

        if (preset.appointmentType) {
            this.appointmentTypeValue = preset.appointmentType;
        }

        if (preset.reminderOffset) {
            this.reminderOffsetValue = preset.reminderOffset;
        }

        if (typeof preset.followUpFrequency === 'string') {
            this.followUpFrequency = preset.followUpFrequency;
        }

        if (typeof preset.followUpCount === 'number') {
            this.followUpCount = preset.followUpCount;
        }

        if (typeof preset.durationMinutes === 'number') {
            this.selectedDurationMinutes = preset.durationMinutes;

            if (!this.allDayValue && this.startValue) {
                this.endValue = this.buildTimedEndValue(this.startValue, preset.durationMinutes);
            }
        }

        this.applySuggestedNameIfAppropriate(this.customerContext?.suggestedName);
        this.refreshPlanningContext();
    }

    handleNameChange(event) {
        this.nameValue = event.detail?.value || event.target?.value || '';
    }

    handleStatusChange(event) {
        this.statusValue = event.detail?.value || DEFAULT_EVENT_STATUS;
    }

    handleNotesChange(event) {
        this.notesValue = event.detail?.value || event.target?.value || '';
    }

    handleAppointmentTypeChange(event) {
        this.appointmentTypeValue = event.detail?.value || DEFAULT_APPOINTMENT_TYPE;
        this.formError = '';
        this.refreshPlanningContext();
    }

    handleAssignedUserChange(event) {
        this.selectedAssignedUserId = event.detail?.value || null;
        this.formError = '';
        this.syncCalendarWithAssignedUser();
        this.refreshPlanningContext();
    }

    handleReminderChange(event) {
        this.reminderOffsetValue = event.detail?.value || DEFAULT_REMINDER_OFFSET;
    }

    handleFollowUpFrequencyChange(event) {
        this.followUpFrequency = event.detail?.value || DEFAULT_FOLLOW_UP_FREQUENCY;
        this.formError = '';
    }

    handleFollowUpCountChange(event) {
        this.followUpCount = normalizeFollowUpCount(event.detail?.value || event.target?.value);
        this.formError = '';
    }

    handleCustomerAccountChange(event) {
        this.customerAccountId = event.detail?.recordId || null;
        this.refreshPlanningContext();
    }

    handleCustomerContactChange(event) {
        this.customerContactId = event.detail?.recordId || null;
        this.refreshPlanningContext();
    }

    async syncCalendarWithAssignedUser() {
        if (!this.selectedAssignedUserId) {
            return;
        }

        const requestSequence = this.calendarResolutionSequence + 1;
        this.calendarResolutionSequence = requestSequence;

        const currentCalendarId = this.calendarValue || this.defaultCalendarId || null;

        try {
            const resolvedCalendarId = await resolveCalendarIdForAssignedUser({
                assignedUserId: this.selectedAssignedUserId,
                currentCalendarId
            });

            if (requestSequence !== this.calendarResolutionSequence) {
                return;
            }

            if (resolvedCalendarId) {
                this.calendarValue = resolvedCalendarId;
            }
        } catch (error) {
            if (requestSequence !== this.calendarResolutionSequence) {
                return;
            }
        }
    }

    validateCustomForm(fields) {
        const controls = Array.from(
            this.template.querySelectorAll('lightning-input-field, lightning-combobox, lightning-input, lightning-record-picker')
        );

        const controlsAreValid = controls.every((control) => {
            if (typeof control.reportValidity === 'function') {
                control.reportValidity();
            }

            return typeof control.checkValidity === 'function' ? control.checkValidity() : true;
        });

        if (!controlsAreValid) {
            this.formError = 'Complete the required event details before saving.';
            return false;
        }

        if (!fields.OwnerId) {
            this.formError = 'Choose the Salesforce employee who owns this appointment.';
            return false;
        }

        if (!this.isSelectedAssignedUserAllowed) {
            this.formError = 'Assign To only allows active users available in your Calendar Security Manager access.';
            return false;
        }

        if (
            this.showCustomerConnection &&
            !fields.Customer_Account__c &&
            !fields.Customer_Contact__c
        ) {
            this.formError = 'Select a customer account or contact for customer appointments and follow-ups.';
            return false;
        }

        if (this.followUpCountValue > 0 && this.followUpFrequency === DEFAULT_FOLLOW_UP_FREQUENCY) {
            this.formError = 'Choose a follow-up frequency or set the follow-up count back to 0.';
            return false;
        }

        return true;
    }

    async refreshPlanningContext() {
        const requestSequence = this.planningContextSequence + 1;
        this.planningContextSequence = requestSequence;

        const hasAvailabilityInputs = Boolean(
            this.selectedAssignedUserId && this.startValue && this.endValue
        );
        const hasCustomerInputs = this.showCustomerConnection && Boolean(this.customerContactId || this.customerAccountId);

        if (!hasAvailabilityInputs && !hasCustomerInputs) {
            this.availabilityInsight = createDefaultAvailabilityInsight();
            this.customerContext = createDefaultCustomerContext();
            return;
        }

        this.isLoadingPlanningContext = true;

        try {
            const context = await getPlanningContext({
                assignedUserId: this.selectedAssignedUserId,
                startValue: this.startValue,
                endValue: this.endValue,
                customerContactId: hasCustomerInputs ? this.customerContactId : null,
                customerAccountId: hasCustomerInputs ? this.customerAccountId : null,
                appointmentType: this.appointmentTypeValue,
                templateKey: this.selectedTemplateKey
            });

            if (requestSequence !== this.planningContextSequence) {
                return;
            }

            this.availabilityInsight = context?.availability || createDefaultAvailabilityInsight();
            this.customerContext = context?.customerContext || createDefaultCustomerContext();

            const resolvedAccountId = this.customerContext?.resolvedAccountId || null;
            if (
                resolvedAccountId &&
                (!this.customerAccountId || this.customerAccountId === this.lastAutoResolvedAccountId)
            ) {
                this.customerAccountId = resolvedAccountId;
                this.lastAutoResolvedAccountId = resolvedAccountId;
            }

            this.applySuggestedNameIfAppropriate(this.customerContext?.suggestedName);
        } catch (error) {
            if (requestSequence !== this.planningContextSequence) {
                return;
            }

            this.availabilityInsight = {
                ...createDefaultAvailabilityInsight(),
                summary: 'Availability preview is temporarily unavailable.',
                tone: 'warning'
            };
        } finally {
            if (requestSequence === this.planningContextSequence) {
                this.isLoadingPlanningContext = false;
            }
        }
    }

    toCalendarEventMutationInput(fields) {
        return {
            calendarId: fields.Calendar__c || null,
            ownerId: fields.OwnerId || null,
            name: fields.Name || null,
            startValue: fields.Start__c || null,
            endValue: fields.End__c || null,
            allDay: fields.All_Day__c === true,
            status: fields.Status__c || null,
            notes: fields.Notes__c || null,
            appointmentType: fields.Appointment_Type__c || null,
            privateToOwner: fields.Private_To_Owner__c === true,
            reminderOffset: fields.Reminder_Offset_Minutes__c || null,
            customerAccountId: fields.Customer_Account__c || null,
            customerContactId: fields.Customer_Contact__c || null
        };
    }

    extractErrorMessage(error) {
        if (Array.isArray(error?.body)) {
            return error.body.map((row) => row.message).filter(Boolean).join(', ');
        }

        return (
            error?.body?.message ||
            error?.body?.output?.errors?.[0]?.message ||
            error?.message ||
            'Unable to save this calendar event.'
        );
    }

    applySuggestedNameIfAppropriate(suggestedName) {
        if (!suggestedName) {
            return;
        }

        const currentName = this.nameValue || '';
        const canReplace = !currentName || currentName === this.lastSuggestedName;

        if (!canReplace) {
            this.nameValue = currentName;
            return;
        }

        this.lastSuggestedName = suggestedName;
        this.nameValue = suggestedName;
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

    formatPreviewRange(startValue, endValue) {
        if (!startValue) {
            return 'Schedule preview unavailable';
        }

        const startDate = new Date(startValue);
        const endDate = endValue ? new Date(endValue) : null;

        if (Number.isNaN(startDate.getTime())) {
            return 'Schedule preview unavailable';
        }

        const startLabel = startDate.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        if (!endDate || Number.isNaN(endDate.getTime())) {
            return startLabel;
        }

        const endLabel = endDate.toLocaleString([], {
            hour: 'numeric',
            minute: '2-digit'
        });

        return `${startLabel} - ${endLabel}`;
    }

    resolveDateValue(value, fallbackHour) {
        if (!value) {
            return null;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return buildDefaultDateTime(value, fallbackHour);
        }

        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    resolveCheckboxValue(event) {
        if (typeof event.target?.checked === 'boolean') {
            return event.target.checked;
        }

        if (typeof event.detail?.checked === 'boolean') {
            return event.detail.checked;
        }

        if (typeof event.detail?.value === 'boolean') {
            return event.detail.value;
        }

        if (event.detail?.value === 'true') {
            return true;
        }

        return false;
    }

    buildTimedStartValue(value) {
        const date = this.coerceDate(value);
        if (!date) {
            return null;
        }

        if (date.getHours() === 0 && date.getMinutes() === 0) {
            date.setHours(DEFAULT_START_HOUR, 0, 0, 0);
        }

        return date.toISOString();
    }

    buildTimedEndValue(startValue, minutes) {
        const startDate = this.coerceDate(startValue);
        if (!startDate) {
            return null;
        }

        startDate.setMinutes(startDate.getMinutes() + minutes);
        return startDate.toISOString();
    }

    buildAllDayStartValue(value) {
        const date = this.coerceDate(value);
        if (!date) {
            return null;
        }

        date.setHours(0, 0, 0, 0);
        return date.toISOString();
    }

    buildAllDayEndValue(value) {
        const date = this.coerceDate(value);
        if (!date) {
            return null;
        }

        date.setHours(23, 59, 0, 0);
        return date.toISOString();
    }

    coerceDate(value) {
        if (!value) {
            return null;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [year, month, day] = value.split('-').map((item) => parseInt(item, 10));
            return new Date(year, month - 1, day, DEFAULT_START_HOUR, 0, 0, 0);
        }

        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
}