import { buildDefaultDateTime } from 'c/calendarUtils';

export const DEFAULT_START_HOUR = 9;
export const DEFAULT_DURATION_MINUTES = 60;
export const DEFAULT_APPOINTMENT_TYPE = 'Personal';
export const DEFAULT_REMINDER_OFFSET = 'None';
export const DEFAULT_FOLLOW_UP_FREQUENCY = 'none';
export const DEFAULT_TEMPLATE_KEY = 'custom';
export const MAX_FOLLOW_UP_COUNT = 12;
export const DEFAULT_EVENT_STATUS = 'Planned';

const MAX_FOLLOW_UP_PREVIEW_ROWS = 6;

function buildFollowUpName(name, occurrenceIndex) {
    const baseName = (name || 'Calendar Event').trim();
    return `${baseName} (Follow-up ${occurrenceIndex})`;
}

export function createDefaultAvailabilityInsight() {
    return {
        allowed: false,
        hasConflicts: false,
        conflictCount: 0,
        summary: 'Choose Assign To, Start, and End to check availability.',
        tone: 'neutral',
        conflicts: []
    };
}

export function createDefaultCustomerContext() {
    return {
        contactId: null,
        contactName: '',
        resolvedAccountId: null,
        resolvedAccountName: '',
        suggestedName: ''
    };
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

export function coerceDate(value) {
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

export function buildTimedStartValue(value) {
    const date = coerceDate(value);
    if (!date) {
        return null;
    }

    if (date.getHours() === 0 && date.getMinutes() === 0) {
        date.setHours(DEFAULT_START_HOUR, 0, 0, 0);
    }

    return date.toISOString();
}

export function buildTimedEndValue(startValue, minutes) {
    const startDate = coerceDate(startValue);
    if (!startDate) {
        return null;
    }

    startDate.setMinutes(startDate.getMinutes() + minutes);
    return startDate.toISOString();
}

export function buildAllDayStartValue(value) {
    const date = coerceDate(value);
    if (!date) {
        return null;
    }

    date.setHours(0, 0, 0, 0);
    return date.toISOString();
}

export function buildAllDayEndValue(value) {
    const date = coerceDate(value);
    if (!date) {
        return null;
    }

    date.setHours(23, 59, 0, 0);
    return date.toISOString();
}

export function resolveDateValue(value, fallbackHour) {
    if (!value) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return buildDefaultDateTime(value, fallbackHour);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function formatInputDateValue(rawValue, isAllDay) {
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

export function parseInputDateValue(rawValue, isAllDay, useEndOfDay) {
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

export function formatPreviewRange(startValue, endValue) {
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

export function resolveCheckboxValue(event) {
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

export function toCalendarEventMutationInput(fields) {
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
        customerContactId: fields.Customer_Contact__c || null,
        recurrenceRule: fields.Recurrence_Rule__c || null
    };
}

export function extractErrorMessage(error) {
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

export function buildAppointmentTypeHelpText(appointmentTypeValue) {
    switch (appointmentTypeValue) {
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

export function buildFollowUpHelpText(followUpCountValue, followUpFrequency) {
    if (followUpCountValue > 0 && followUpFrequency !== DEFAULT_FOLLOW_UP_FREQUENCY) {
        return `Saving will create the main event plus ${followUpCountValue} additional ${followUpFrequency} follow-up event${followUpCountValue === 1 ? '' : 's'}.`;
    }

    return 'Create the first event now and optionally generate a follow-up series from the same details.';
}

export function buildDurationSummary(allDayValue, selectedDurationMinutes) {
    if (allDayValue) {
        return 'All-day event';
    }

    const minutes = selectedDurationMinutes;
    if (minutes < 60) {
        return `${minutes} minutes`;
    }

    const hours = minutes / 60;
    return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? '' : 's'}` : `${minutes} minutes`;
}

export function buildTimeHint(allDayValue) {
    if (allDayValue) {
        return 'All-day keeps the same calendar date and syncs to Google as a full-day event.';
    }

    return 'Quick duration buttons update the end time from the selected start.';
}

export function buildCustomerSummaryText(customerContext) {
    const labels = [];

    if (customerContext?.contactName) {
        labels.push(`Contact: ${customerContext.contactName}`);
    }

    if (customerContext?.resolvedAccountName) {
        labels.push(`Account: ${customerContext.resolvedAccountName}`);
    }

    return labels.join(' | ');
}

export function buildAvailabilityCardClass(tone) {
    return `planner-card planner-card--${tone || 'neutral'}`;
}
