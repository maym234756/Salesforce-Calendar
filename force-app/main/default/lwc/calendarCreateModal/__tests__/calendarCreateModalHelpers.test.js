const {
    createDefaultAvailabilityInsight,
    createDefaultCustomerContext,
    buildAssignableUserOptions,
    resolveDefaultAssignedUserId,
    normalizeEventTemplates,
    buildEventTemplateOptions,
    buildTemplatePreset,
    normalizeFollowUpCount,
    shiftDateTimeValue,
    buildFollowUpPreviewRows,
    resolveFollowUpAppointmentType,
    buildFollowUpSeries,
    buildTimedStartValue,
    buildTimedEndValue,
    buildAllDayStartValue,
    buildAllDayEndValue,
    resolveDateValue,
    formatInputDateValue,
    parseInputDateValue,
    resolveCheckboxValue,
    toCalendarEventMutationInput,
    extractErrorMessage,
    buildAppointmentTypeHelpText,
    buildFollowUpHelpText,
    buildDurationSummary,
    buildTimeHint,
    buildCustomerSummaryText,
    buildAvailabilityCardClass,
    DEFAULT_TEMPLATE_KEY,
    DEFAULT_EVENT_STATUS
} = require('../calendarCreateModalHelpers');

describe('calendarCreateModalHelpers', () => {
    it('builds default availability and customer context objects', () => {
        expect(createDefaultAvailabilityInsight()).toEqual({
            allowed: false,
            hasConflicts: false,
            conflictCount: 0,
            summary: 'Choose Assign To, Start, and End to check availability.',
            tone: 'neutral',
            conflicts: []
        });

        expect(createDefaultCustomerContext()).toEqual({
            contactId: null,
            contactName: '',
            resolvedAccountId: null,
            resolvedAccountName: '',
            suggestedName: ''
        });
    });

    it('builds assignable user options and resolves a default assigned user', () => {
        const options = buildAssignableUserOptions([
            { id: '005A', label: 'Afton Everett' },
            { id: '005B', name: 'Miles May' },
            { label: 'Missing Id' }
        ]);

        expect(options).toEqual([
            { label: 'Afton Everett', value: '005A' },
            { label: 'Miles May', value: '005B' }
        ]);
        expect(resolveDefaultAssignedUserId('005B', options)).toBe('005B');
        expect(resolveDefaultAssignedUserId('005Z', options)).toBe('005A');
        expect(resolveDefaultAssignedUserId(null, [])).toBeNull();
    });

    it('normalizes event templates and builds template options and presets', () => {
        const rows = [
            {
                id: 'tpl-1',
                name: 'Discovery Call',
                durationMinutes: '45',
                calendarId: 'a01AAA',
                calendarName: 'Revenue Team',
                defaultStatus: 'Confirmed',
                notes: 'Bring the deck.',
                isActive: true
            },
            {
                id: 'tpl-2',
                name: 'Inactive Template',
                durationMinutes: '0',
                calendarId: 'a01BBB',
                isActive: false
            }
        ];

        expect(normalizeEventTemplates(rows)).toEqual([
            {
                id: 'tpl-1',
                name: 'Discovery Call',
                durationMinutes: 45,
                calendarId: 'a01AAA',
                calendarName: 'Revenue Team',
                defaultStatus: 'Confirmed',
                notes: 'Bring the deck.',
                isActive: true
            },
            {
                id: 'tpl-2',
                name: 'Inactive Template',
                durationMinutes: null,
                calendarId: 'a01BBB',
                calendarName: '',
                defaultStatus: DEFAULT_EVENT_STATUS,
                notes: '',
                isActive: false
            }
        ]);

        expect(buildEventTemplateOptions(rows)).toEqual([
            { label: 'Custom', value: DEFAULT_TEMPLATE_KEY },
            { label: 'Discovery Call', value: 'tpl-1' }
        ]);

        expect(buildTemplatePreset('tpl-1', rows)).toMatchObject({
            name: 'Discovery Call',
            durationMinutes: 45,
            calendarId: 'a01AAA',
            defaultStatus: 'Confirmed',
            notes: 'Bring the deck.'
        });
        expect(buildTemplatePreset('missing', rows)).toEqual({
            name: '',
            durationMinutes: null,
            calendarId: null,
            defaultStatus: null,
            notes: '',
            description: 'Build your own event without a preset.'
        });
    });

    it('normalizes follow-up counts and shifts datetimes by cadence', () => {
        expect(normalizeFollowUpCount(-5)).toBe(0);
        expect(normalizeFollowUpCount(99)).toBe(12);

        expect(shiftDateTimeValue('2026-05-10T09:00:00.000Z', 'daily', 2)).toBe(
            '2026-05-12T09:00:00.000Z'
        );
        expect(shiftDateTimeValue('2026-05-10T09:00:00.000Z', 'weekly', 1)).toBe(
            '2026-05-17T09:00:00.000Z'
        );
        expect(shiftDateTimeValue('2026-05-10T09:00:00.000Z', 'biweekly', 1)).toBe(
            '2026-05-24T09:00:00.000Z'
        );
        expect(shiftDateTimeValue('2026-05-10T09:00:00.000Z', 'monthly', 1)).toBe(
            '2026-06-10T09:00:00.000Z'
        );
        expect(shiftDateTimeValue('2026-05-10T09:00:00.000Z', 'none', 1)).toBe(
            '2026-05-10T09:00:00.000Z'
        );
    });

    it('builds follow-up preview rows and resolves follow-up appointment types', () => {
        const rows = buildFollowUpPreviewRows(
            '2026-05-10T09:00:00.000Z',
            '2026-05-10T10:00:00.000Z',
            'weekly',
            9
        );

        expect(rows).toHaveLength(6);
        expect(rows[0]).toMatchObject({
            key: '1',
            occurrenceIndex: 1,
            startValue: '2026-05-17T09:00:00.000Z',
            endValue: '2026-05-17T10:00:00.000Z'
        });
        expect(resolveFollowUpAppointmentType('Customer')).toBe('Follow-Up');
        expect(resolveFollowUpAppointmentType('Follow-Up')).toBe('Follow-Up');
        expect(resolveFollowUpAppointmentType('Personal')).toBe('Personal');
    });

    it('builds follow-up series rows from a saved event snapshot', () => {
        const rows = buildFollowUpSeries(
            {
                Name: 'Quarterly Review',
                Calendar__c: 'a01AAA',
                Start__c: '2026-05-10T09:00:00.000Z',
                End__c: '2026-05-10T10:00:00.000Z',
                All_Day__c: false,
                Status__c: 'Planned',
                Notes__c: 'Bring account scorecard.',
                OwnerId: '005AAA',
                Appointment_Type__c: 'Customer',
                Private_To_Owner__c: true,
                Reminder_Offset_Minutes__c: '15',
                Customer_Account__c: '001AAA',
                Customer_Contact__c: '003AAA'
            },
            'weekly',
            2
        );

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            Name: 'Quarterly Review (Follow-up 1)',
            Calendar__c: 'a01AAA',
            Start__c: '2026-05-17T09:00:00.000Z',
            End__c: '2026-05-17T10:00:00.000Z',
            Appointment_Type__c: 'Follow-Up',
            Private_To_Owner__c: true,
            Customer_Account__c: '001AAA',
            Customer_Contact__c: '003AAA'
        });
        expect(rows[1].Name).toBe('Quarterly Review (Follow-up 2)');
    });

    it('builds timed and all-day date values and resolves calendar input dates', () => {
        const timedStart = buildTimedStartValue('2026-05-10');
        const timedEnd = buildTimedEndValue(timedStart, 90);
        const allDayStart = buildAllDayStartValue('2026-05-10');
        const allDayEnd = buildAllDayEndValue('2026-05-10');

        expect(new Date(timedStart).getHours()).toBe(9);
        expect(new Date(timedEnd).getTime() - new Date(timedStart).getTime()).toBe(90 * 60 * 1000);
        expect(new Date(allDayStart).getHours()).toBe(0);
        expect(new Date(allDayEnd).getHours()).toBe(23);
        expect(new Date(allDayEnd).getMinutes()).toBe(59);
        expect(resolveDateValue('2026-05-10', 14)).not.toBeNull();
        expect(resolveDateValue('not-a-date', 9)).toBeNull();
    });

    it('formats and parses timed and all-day input values', () => {
        const timedIso = parseInputDateValue('2026-05-10T09:30', false, false);
        const allDayIso = parseInputDateValue('2026-05-10', true, true);

        expect(formatInputDateValue(timedIso, false)).toBe('2026-05-10T09:30');
        expect(formatInputDateValue(allDayIso, true)).toBe('2026-05-10');
        expect(parseInputDateValue('', true, false)).toBeNull();
        expect(parseInputDateValue('2026-05-10', true, false)).toContain('T');
    });

    it('resolves checkbox values, mutation inputs, and error messages', () => {
        expect(resolveCheckboxValue({ target: { checked: true } })).toBe(true);
        expect(resolveCheckboxValue({ detail: { checked: false } })).toBe(false);
        expect(resolveCheckboxValue({ detail: { value: true } })).toBe(true);
        expect(resolveCheckboxValue({ detail: { value: 'true' } })).toBe(true);
        expect(resolveCheckboxValue({ detail: {} })).toBe(false);

        expect(
            toCalendarEventMutationInput({
                Calendar__c: 'a01AAA',
                OwnerId: '005AAA',
                Name: 'Quarterly Review',
                Start__c: '2026-05-10T09:00:00.000Z',
                End__c: '2026-05-10T10:00:00.000Z',
                All_Day__c: false,
                Status__c: 'Planned',
                Notes__c: 'Bring the scorecard.',
                Appointment_Type__c: 'Customer',
                Private_To_Owner__c: true,
                Reminder_Offset_Minutes__c: '15',
                Customer_Account__c: '001AAA',
                Customer_Contact__c: '003AAA',
                Recurrence_Rule__c: 'FREQ=WEEKLY'
            })
        ).toEqual({
            calendarId: 'a01AAA',
            ownerId: '005AAA',
            name: 'Quarterly Review',
            startValue: '2026-05-10T09:00:00.000Z',
            endValue: '2026-05-10T10:00:00.000Z',
            allDay: false,
            status: 'Planned',
            notes: 'Bring the scorecard.',
            appointmentType: 'Customer',
            privateToOwner: true,
            reminderOffset: '15',
            customerAccountId: '001AAA',
            customerContactId: '003AAA',
            recurrenceRule: 'FREQ=WEEKLY'
        });

        expect(extractErrorMessage({ body: [{ message: 'One' }, { message: 'Two' }] })).toBe(
            'One, Two'
        );
        expect(extractErrorMessage({ body: { output: { errors: [{ message: 'Nested' }] } } })).toBe(
            'Nested'
        );
        expect(extractErrorMessage({ message: 'Fallback' })).toBe('Fallback');
    });

    it('builds help text and summary labels for modal guidance', () => {
        expect(buildAppointmentTypeHelpText('Internal')).toContain('active Salesforce employee');
        expect(buildFollowUpHelpText(2, 'weekly')).toContain(
            'Saving will create the main event plus 2 additional weekly follow-up events.'
        );
        expect(buildDurationSummary(true, 60)).toBe('All-day event');
        expect(buildDurationSummary(false, 120)).toBe('2 hours');
        expect(buildDurationSummary(false, 90)).toBe('90 minutes');
        expect(buildTimeHint(true)).toContain('All-day keeps the same calendar date');
        expect(buildTimeHint(false)).toContain('Quick duration buttons update the end time');
        expect(
            buildCustomerSummaryText({
                contactName: 'Avery Stone',
                resolvedAccountName: 'Revenue Team'
            })
        ).toBe('Contact: Avery Stone | Account: Revenue Team');
        expect(buildAvailabilityCardClass('warning')).toBe('planner-card planner-card--warning');
    });
});