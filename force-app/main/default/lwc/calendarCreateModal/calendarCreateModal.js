import { LightningElement, api } from 'lwc';
import getPlanningContext from '@salesforce/apex/TeamCalendarEventPlannerController.getPlanningContext';
import resolveCalendarIdForAssignedUser from '@salesforce/apex/TeamCalendarEventPlannerController.resolveCalendarIdForAssignedUser';
import createCalendarEventSeries from '@salesforce/apex/TeamCalendarRecordMutationService.createCalendarEventSeries';
import {
    DEFAULT_START_HOUR,
    DEFAULT_DURATION_MINUTES,
    DEFAULT_APPOINTMENT_TYPE,
    DEFAULT_REMINDER_OFFSET,
    DEFAULT_FOLLOW_UP_FREQUENCY,
    DEFAULT_TEMPLATE_KEY,
    DEFAULT_EVENT_STATUS,
    createDefaultAvailabilityInsight,
    createDefaultCustomerContext,
    buildAssignableUserOptions,
    resolveDefaultAssignedUserId,
    buildEventTemplateOptions,
    buildTemplatePreset,
    buildResolvedCalendarLabel,
    normalizeFollowUpCount,
    buildFollowUpPreviewRows,
    buildFollowUpSeries,
    formatInputDateValue,
    parseInputDateValue,
    formatPreviewRange,
    resolveDateValue,
    resolveCheckboxValue,
    buildTimedStartValue,
    buildTimedEndValue,
    buildAllDayStartValue,
    buildAllDayEndValue,
    toCalendarEventMutationInput,
    extractErrorMessage,
    buildAppointmentTypeHelpText,
    buildFollowUpHelpText,
    buildDurationSummary,
    buildTimeHint,
    buildCustomerSummaryText,
    buildAvailabilityCardClass
} from './calendarCreateModalHelpers';

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
    recurrenceRule = '';

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
            label: formatPreviewRange(row.startValue, row.endValue)
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
        return buildCustomerSummaryText(this.customerContext);
    }

    get showAvailabilityHint() {
        return Boolean(this.availabilityInsight?.summary);
    }

    get hasAvailabilityConflicts() {
        return this.availabilityInsight?.hasConflicts === true;
    }

    get availabilityCardClass() {
        return buildAvailabilityCardClass(this.availabilityInsight?.tone);
    }

    get appointmentTypeHelpText() {
        return buildAppointmentTypeHelpText(this.appointmentTypeValue);
    }

    get followUpHelpText() {
        return buildFollowUpHelpText(this.followUpCountValue, this.followUpFrequency);
    }

    get durationSummary() {
        return buildDurationSummary(this.allDayValue, this.selectedDurationMinutes);
    }

    get timeHint() {
        return buildTimeHint(this.allDayValue);
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
        return formatInputDateValue(this.startValue, this.allDayValue);
    }

    get endInputValue() {
        return formatInputDateValue(this.endValue, this.allDayValue);
    }

    get resolvedCalendarLabel() {
        return buildResolvedCalendarLabel(this.calendarValue);
    }

    get resolvedDefaultStart() {
        if (!this.defaultStart) {
            return null;
        }

        return resolveDateValue(this.defaultStart, DEFAULT_START_HOUR);
    }

    get resolvedDefaultEnd() {
        if (this.defaultEnd) {
            return resolveDateValue(this.defaultEnd, DEFAULT_START_HOUR + 1);
        }

        if (!this.defaultStart) {
            return null;
        }

        const startValue = resolveDateValue(this.defaultStart, DEFAULT_START_HOUR);
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
            Customer_Contact__c: this.showCustomerConnection ? this.customerContactId || null : null,
            Recurrence_Rule__c: this.recurrenceRule || null
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
            Customer_Contact__c: fields.Customer_Contact__c,
            Recurrence_Rule__c: fields.Recurrence_Rule__c || null
        };

        this.isSaving = true;

        const followUpSeries = buildFollowUpSeries(
            this.pendingSubmissionSnapshot,
            this.followUpFrequency,
            this.followUpCountValue
        );

        createCalendarEventSeries({
            requestJson: JSON.stringify({
                primaryEvent: toCalendarEventMutationInput(this.pendingSubmissionSnapshot),
                followUpEvents: followUpSeries.map((row) => toCalendarEventMutationInput(row))
            })
        })
            .then((result) => {
                this.dispatchSaveSuccess(result);
            })
            .catch((error) => {
                this.handleError({
                    detail: {
                        message: extractErrorMessage(error)
                    }
                });
            });
    }

    handleStartChange(event) {
        const rawValue = event.detail?.value || event.target?.value || null;
        this.startValue = parseInputDateValue(rawValue, this.allDayValue, false);

        if (!this.startValue) {
            return;
        }

        if (this.allDayValue) {
            this.endValue = buildAllDayEndValue(this.startValue);
        } else {
            const currentEnd = this.endValue ? new Date(this.endValue) : null;
            const currentStart = new Date(this.startValue);

            if (!currentEnd || Number.isNaN(currentEnd.getTime()) || currentEnd <= currentStart) {
                this.endValue = buildTimedEndValue(this.startValue, this.selectedDurationMinutes);
            }
        }

        this.refreshPlanningContext();
    }

    handleEndChange(event) {
        const rawValue = event.detail?.value || event.target?.value || null;
        this.endValue = parseInputDateValue(rawValue, this.allDayValue, true);
        this.refreshPlanningContext();
    }

    handleRRuleChange(event) {
        this.recurrenceRule = event.detail?.rrule || '';
    }

    handleAllDayChange(event) {
        this.allDayValue = resolveCheckboxValue(event);

        if (!this.startValue) {
            this.startValue = this.resolvedDefaultStart;
        }

        if (!this.startValue) {
            return;
        }

        if (this.allDayValue) {
            this.startValue = buildAllDayStartValue(this.startValue);
            this.endValue = buildAllDayEndValue(this.startValue);
        } else {
            const timedStart = buildTimedStartValue(this.startValue);
            this.startValue = timedStart;
            this.endValue = buildTimedEndValue(timedStart, this.selectedDurationMinutes);
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

        this.endValue = buildTimedEndValue(this.startValue, minutes);
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
                this.endValue = buildTimedEndValue(this.startValue, preset.durationMinutes);
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

        if (!fields.Start__c) {
            this.formError = 'A start date and time is required.';
            return false;
        }

        if (!fields.End__c) {
            this.formError = 'An end date and time is required.';
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
}