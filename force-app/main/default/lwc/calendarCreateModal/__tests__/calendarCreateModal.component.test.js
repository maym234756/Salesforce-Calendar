const { createElement } = require('lwc');

jest.mock(
    '@salesforce/apex/TeamCalendarEventPlannerController.getPlanningContext',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/TeamCalendarEventPlannerController.resolveCalendarIdForAssignedUser',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/TeamCalendarRecordMutationService.createCalendarEventSeries',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/TeamCalendarEventTemplateService.getActiveEventTemplates',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const getPlanningContext = require('@salesforce/apex/TeamCalendarEventPlannerController.getPlanningContext').default;
const resolveCalendarIdForAssignedUser = require('@salesforce/apex/TeamCalendarEventPlannerController.resolveCalendarIdForAssignedUser').default;
const createCalendarEventSeries = require('@salesforce/apex/TeamCalendarRecordMutationService.createCalendarEventSeries').default;
const getActiveEventTemplates = require('@salesforce/apex/TeamCalendarEventTemplateService.getActiveEventTemplates').default;
const CalendarCreateModal = require('c/calendarCreateModal').default;

const ACTIVE_USERS = [
    { id: '005CURRENT', label: 'Miles May' },
    { id: '005OTHER', label: 'Afton Everett' }
];

const TEMPLATE_ROWS = [
    {
        id: 'tpl-1',
        name: 'Discovery Call',
        durationMinutes: 45,
        calendarId: 'a01TEMPLATE',
        calendarName: 'Revenue Team',
        defaultStatus: 'Confirmed',
        notes: 'Bring the deck.',
        isActive: true
    }
];

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

async function flushRender(cycles = 3) {
    for (let index = 0; index < cycles; index += 1) {
        await flushPromises();
    }
}

function buildPlanningContext(overrides = {}) {
    return {
        availability: {
            allowed: true,
            hasConflicts: false,
            conflictCount: 0,
            summary: 'No conflicts detected.',
            tone: 'success',
            conflicts: []
        },
        customerContext: {
            contactId: null,
            contactName: '',
            resolvedAccountId: null,
            resolvedAccountName: '',
            suggestedName: ''
        },
        ...overrides
    };
}

function localIso(year, monthIndex, day, hour = 0, minute = 0) {
    return new Date(year, monthIndex, day, hour, minute, 0, 0).toISOString();
}

function buildElement(props = {}) {
    const element = createElement('c-calendar-create-modal', { is: CalendarCreateModal });
    element.defaultCalendarId = props.defaultCalendarId;
    element.defaultStart = props.defaultStart || '2026-04-21';
    element.defaultEnd = props.defaultEnd;
    element.activeUserOptions = props.activeUserOptions || ACTIVE_USERS;
    element.currentUserId = props.currentUserId || '005CURRENT';
    document.body.appendChild(element);
    return element;
}

function findButtonByLabel(element, label) {
    return Array.from(element.shadowRoot.querySelectorAll('lightning-button')).find(
        (button) => button.label === label
    );
}

function findComboboxByLabel(element, label) {
    return Array.from(element.shadowRoot.querySelectorAll('lightning-combobox')).find(
        (combobox) => combobox.label === label
    );
}

function findInputByLabel(element, label) {
    return Array.from(element.shadowRoot.querySelectorAll('lightning-input')).find(
        (input) => input.label === label
    );
}

function findRecordPickerByLabel(element, label) {
    return Array.from(element.shadowRoot.querySelectorAll('lightning-record-picker')).find(
        (picker) => picker.label === label
    );
}

function forceValidForm(element) {
    Array.from(
        element.shadowRoot.querySelectorAll(
            'lightning-input-field, lightning-combobox, lightning-input, lightning-record-picker'
        )
    ).forEach((control) => {
        control.checkValidity = jest.fn(() => true);
        control.reportValidity = jest.fn(() => true);
    });
}

describe('c-calendar-create-modal', () => {
    beforeEach(() => {
        getPlanningContext.mockResolvedValue(buildPlanningContext());
        resolveCalendarIdForAssignedUser.mockResolvedValue('a01RESOLVED');
        createCalendarEventSeries.mockResolvedValue({
            recordId: 'a1B000000000001AAA',
            followUpRequestedCount: 2,
            followUpCreatedCount: 2,
            followUpFailedCount: 0
        });
        getActiveEventTemplates.mockResolvedValue(TEMPLATE_ROWS);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('initializes defaults, loads templates, resolves the calendar, and applies planner suggestions', async () => {
        getPlanningContext.mockResolvedValue(
            buildPlanningContext({
                customerContext: {
                    contactId: '003000000000001AAA',
                    contactName: 'Avery Stone',
                    resolvedAccountId: '001000000000001AAA',
                    resolvedAccountName: 'Revenue Team',
                    suggestedName: 'Avery Stone Follow-Up'
                }
            })
        );

        const element = buildElement();
        await flushRender(4);

        expect(getActiveEventTemplates).toHaveBeenCalledTimes(1);
        expect(resolveCalendarIdForAssignedUser).toHaveBeenCalledWith({
            assignedUserId: '005CURRENT',
            currentCalendarId: null
        });
        expect(getPlanningContext).toHaveBeenCalledWith(
            expect.objectContaining({
                assignedUserId: '005CURRENT',
                appointmentType: 'Personal',
                customerAccountId: null,
                customerContactId: null,
                templateName: null
            })
        );

        expect(
            element.shadowRoot.querySelector('lightning-input[data-field="Calendar__c"]').value
        ).toBe('a01RESOLVED');
        expect(
            element.shadowRoot.querySelector('lightning-input[data-field="Name"]').value
        ).toBe('Avery Stone Follow-Up');
        expect(findComboboxByLabel(element, 'Event Template').options.map((option) => option.value)).toEqual([
            'custom',
            'tpl-1'
        ]);
    });

    it('applies template presets and toggles between timed and all-day scheduling', async () => {
        const element = buildElement();
        await flushRender(4);

        const templateCombobox = findComboboxByLabel(element, 'Event Template');
        templateCombobox.value = 'tpl-1';
        templateCombobox.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: 'tpl-1' },
                bubbles: true,
                composed: true
            })
        );
        await flushRender(2);

        expect(
            element.shadowRoot.querySelector('lightning-input[data-field="Name"]').value
        ).toBe('Discovery Call');
        expect(
            element.shadowRoot.querySelector('lightning-combobox[data-field="Status__c"]').value
        ).toBe('Confirmed');
        expect(
            element.shadowRoot.querySelector('lightning-textarea[data-field="Notes__c"]').value
        ).toBe('Bring the deck.');
        expect(
            element.shadowRoot.querySelector('lightning-input[data-field="Calendar__c"]').value
        ).toBe('a01TEMPLATE');

        const allDayToggle = element.shadowRoot.querySelector(
            'lightning-input[data-field="All_Day__c"]'
        );
        allDayToggle.checked = true;
        allDayToggle.dispatchEvent(
            new CustomEvent('change', {
                detail: { checked: true },
                bubbles: true,
                composed: true
            })
        );
        await flushRender(2);

        const startInput = element.shadowRoot.querySelector('lightning-input[data-field="Start__c"]');
        const endInput = element.shadowRoot.querySelector('lightning-input[data-field="End__c"]');
        expect(startInput.type).toBe('date');
        expect(endInput.type).toBe('date');
        expect(startInput.value).toBe('2026-04-21');
        expect(endInput.value).toBe('2026-04-21');

        allDayToggle.checked = false;
        allDayToggle.dispatchEvent(
            new CustomEvent('change', {
                detail: { checked: false },
                bubbles: true,
                composed: true
            })
        );
        await flushRender(2);

        expect(startInput.type).toBe('datetime-local');
        expect(endInput.type).toBe('datetime-local');
        expect(startInput.value).toContain('T09:00');
        expect(endInput.value).toContain('T09:45');
    });

    it('rejects follow-up counts when no follow-up frequency is selected', async () => {
        const element = buildElement();
        await flushRender(4);

        const nameInput = element.shadowRoot.querySelector('lightning-input[data-field="Name"]');
        nameInput.value = 'Quarterly Review';
        nameInput.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: 'Quarterly Review' },
                bubbles: true,
                composed: true
            })
        );
        const followUpCountInput = findInputByLabel(element, 'Additional Follow-Ups');
        followUpCountInput.value = '2';
        followUpCountInput.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: '2' },
                bubbles: true,
                composed: true
            })
        );
        await flushRender(2);
        forceValidForm(element);

        findButtonByLabel(element, 'Save Event').click();
        await flushRender(2);

        expect(createCalendarEventSeries).not.toHaveBeenCalled();
        expect(element.shadowRoot.textContent).toContain(
            'Choose a follow-up frequency or set the follow-up count back to 0.'
        );
    });

    it('saves customer appointments with recurrence and follow-up rows', async () => {
        const element = buildElement();
        const successHandler = jest.fn();
        element.addEventListener('success', successHandler);
        await flushRender(4);

        const nameInput = element.shadowRoot.querySelector('lightning-input[data-field="Name"]');
        nameInput.value = 'Customer Check-In';
        nameInput.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: 'Customer Check-In' },
                bubbles: true,
                composed: true
            })
        );
        const appointmentTypeCombobox = findComboboxByLabel(element, 'Appointment Type');
        appointmentTypeCombobox.value = 'Customer';
        appointmentTypeCombobox.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: 'Customer' },
                bubbles: true,
                composed: true
            })
        );
        await flushRender(2);

        findRecordPickerByLabel(element, 'Customer Contact').dispatchEvent(
            new CustomEvent('change', {
                detail: { recordId: '003000000000001AAA' },
                bubbles: true,
                composed: true
            })
        );
        const followUpFrequencyCombobox = findComboboxByLabel(element, 'Follow-Up Frequency');
        followUpFrequencyCombobox.value = 'weekly';
        followUpFrequencyCombobox.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: 'weekly' },
                bubbles: true,
                composed: true
            })
        );
        const followUpCountInput = findInputByLabel(element, 'Additional Follow-Ups');
        followUpCountInput.value = '2';
        followUpCountInput.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: '2' },
                bubbles: true,
                composed: true
            })
        );
        element.shadowRoot.querySelector('c-calendar-recurrence-editor').dispatchEvent(
            new CustomEvent('rrulechange', {
                detail: { rrule: 'FREQ=WEEKLY;COUNT=3' },
                bubbles: true,
                composed: true
            })
        );
        await flushRender(2);
        forceValidForm(element);

        findButtonByLabel(element, 'Save Event').click();
        await flushRender(3);

        expect(createCalendarEventSeries).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(createCalendarEventSeries.mock.calls[0][0].requestJson);

        expect(payload.primaryEvent).toMatchObject({
            appointmentType: 'Customer',
            calendarId: 'a01RESOLVED',
            customerContactId: '003000000000001AAA',
            name: 'Customer Check-In',
            ownerId: '005CURRENT',
            privateToOwner: false,
            recurrenceRule: 'FREQ=WEEKLY;COUNT=3',
            status: 'Planned'
        });
        expect(payload.followUpEvents).toHaveLength(2);
        expect(payload.followUpEvents[0]).toMatchObject({
            appointmentType: 'Follow-Up',
            customerContactId: '003000000000001AAA',
            name: 'Customer Check-In (Follow-up 1)',
            ownerId: '005CURRENT'
        });
        expect(payload.followUpEvents[1].name).toBe('Customer Check-In (Follow-up 2)');

        expect(successHandler).toHaveBeenCalledTimes(1);
        expect(successHandler.mock.calls[0][0].detail).toEqual({
            id: 'a1B000000000001AAA',
            followUpRequestedCount: 2,
            followUpCreatedCount: 2,
            followUpFailedCount: 0
        });
    });

    it('loads templates, resets missing selections, and clears template rows on failure', async () => {
        const context = {
            selectedTemplateKey: 'missing-template',
            eventTemplates: []
        };

        getActiveEventTemplates.mockResolvedValueOnce(TEMPLATE_ROWS);
        await CalendarCreateModal.prototype.loadEventTemplates.call(context);

        expect(context.eventTemplates).toHaveLength(1);
        expect(context.eventTemplates[0].id).toBe('tpl-1');
        expect(context.selectedTemplateKey).toBe('custom');

        getActiveEventTemplates.mockRejectedValueOnce(new Error('template load failed'));
        await CalendarCreateModal.prototype.loadEventTemplates.call(context);

        expect(context.eventTemplates).toEqual([]);
    });

    it('updates schedule fields and form state through the prototype handlers', () => {
        const context = {
            appointmentTypeValue: 'Personal',
            selectedAssignedUserId: '005CURRENT',
            reminderOffsetValue: 'None',
            followUpFrequency: 'none',
            followUpCount: 0,
            customerAccountId: null,
            customerContactId: null,
            formError: 'Previous error',
            allDayValue: false,
            selectedDurationMinutes: 60,
            startValue: localIso(2026, 3, 21, 9),
            endValue: localIso(2026, 3, 21, 10),
            resolvedDefaultStart: localIso(2026, 3, 21, 9),
            customerContext: { suggestedName: 'Avery Stone Follow-Up' },
            selectedTemplatePreset: {
                name: 'Discovery Call',
                calendarId: 'a01TEMPLATE',
                defaultStatus: 'Confirmed',
                notes: 'Bring the deck.',
                durationMinutes: 45
            },
            refreshPlanningContext: jest.fn(),
            syncCalendarWithAssignedUser: jest.fn(),
            applySuggestedNameIfAppropriate: jest.fn()
        };

        CalendarCreateModal.prototype.handleTemplateChange.call(context, {
            detail: { value: 'tpl-1' }
        });
        expect(context.selectedTemplateKey).toBe('tpl-1');
        expect(context.nameValue).toBe('Discovery Call');
        expect(context.calendarValue).toBe('a01TEMPLATE');
        expect(context.statusValue).toBe('Confirmed');
        expect(context.notesValue).toBe('Bring the deck.');
        expect(new Date(context.endValue).getTime() - new Date(context.startValue).getTime()).toBe(
            45 * 60 * 1000
        );
        expect(context.applySuggestedNameIfAppropriate).toHaveBeenCalledWith(
            'Avery Stone Follow-Up'
        );

        CalendarCreateModal.prototype.handleAppointmentTypeChange.call(context, {
            detail: { value: 'Customer' }
        });
        expect(context.appointmentTypeValue).toBe('Customer');
        expect(context.formError).toBe('');

        CalendarCreateModal.prototype.handleAssignedUserChange.call(context, {
            detail: { value: '005OTHER' }
        });
        expect(context.selectedAssignedUserId).toBe('005OTHER');
        expect(context.syncCalendarWithAssignedUser).toHaveBeenCalledTimes(1);

        CalendarCreateModal.prototype.handleReminderChange.call(context, {
            detail: { value: '1 Hour' }
        });
        CalendarCreateModal.prototype.handleFollowUpFrequencyChange.call(context, {
            detail: { value: 'weekly' }
        });
        CalendarCreateModal.prototype.handleFollowUpCountChange.call(context, {
            detail: { value: '3' }
        });
        CalendarCreateModal.prototype.handleCustomerAccountChange.call(context, {
            detail: { recordId: '001000000000001AAA' }
        });
        CalendarCreateModal.prototype.handleCustomerContactChange.call(context, {
            detail: { recordId: '003000000000001AAA' }
        });

        expect(context.reminderOffsetValue).toBe('1 Hour');
        expect(context.followUpFrequency).toBe('weekly');
        expect(context.followUpCount).toBe(3);
        expect(context.customerAccountId).toBe('001000000000001AAA');
        expect(context.customerContactId).toBe('003000000000001AAA');

        CalendarCreateModal.prototype.handleStartChange.call(context, {
            detail: { value: '2026-04-21T11:00' }
        });
        expect(new Date(context.endValue).getTime() - new Date(context.startValue).getTime()).toBe(
            45 * 60 * 1000
        );

        CalendarCreateModal.prototype.handleEndChange.call(context, {
            detail: { value: '2026-04-21T13:30' }
        });
        expect(new Date(context.endValue).getTime()).toBeGreaterThan(
            new Date(context.startValue).getTime()
        );

        CalendarCreateModal.prototype.handleAllDayChange.call(context, {
            detail: { checked: true },
            target: { checked: true }
        });
        expect(context.allDayValue).toBe(true);
        expect(new Date(context.startValue).getHours()).toBe(0);

        const refreshCallsBeforeAllDayDuration = context.refreshPlanningContext.mock.calls.length;
        CalendarCreateModal.prototype.handleDurationClick.call(context, {
            currentTarget: { dataset: { minutes: '90' } }
        });
        expect(context.selectedDurationMinutes).toBe(90);
        expect(context.refreshPlanningContext).toHaveBeenCalledTimes(refreshCallsBeforeAllDayDuration);

        context.allDayValue = false;
        context.startValue = null;
        CalendarCreateModal.prototype.handleDurationClick.call(context, {
            currentTarget: { dataset: { minutes: '30' } }
        });
        expect(context.startValue).toBe(context.resolvedDefaultStart);
        expect(new Date(context.endValue).getTime() - new Date(context.startValue).getTime()).toBe(
            30 * 60 * 1000
        );
    });

    it('validates the custom form and returns targeted messages for each failed branch', () => {
        const invalidControl = {
            reportValidity: jest.fn(),
            checkValidity: jest.fn(() => false)
        };
        const validControl = {
            reportValidity: jest.fn(),
            checkValidity: jest.fn(() => true)
        };
        const context = {
            template: {
                querySelectorAll: jest.fn(() => [invalidControl])
            },
            isSelectedAssignedUserAllowed: true,
            showCustomerConnection: false,
            followUpCountValue: 0,
            followUpFrequency: 'none'
        };
        const baseFields = {
            OwnerId: '005CURRENT',
            Start__c: localIso(2026, 3, 21, 9),
            End__c: localIso(2026, 3, 21, 10),
            Customer_Account__c: null,
            Customer_Contact__c: null
        };

        expect(CalendarCreateModal.prototype.validateCustomForm.call(context, baseFields)).toBe(false);
        expect(context.formError).toBe('Complete the required event details before saving.');

        context.template.querySelectorAll.mockReturnValue([validControl]);
        expect(
            CalendarCreateModal.prototype.validateCustomForm.call(context, {
                ...baseFields,
                OwnerId: null
            })
        ).toBe(false);
        expect(context.formError).toBe('Choose the Salesforce employee who owns this appointment.');

        context.isSelectedAssignedUserAllowed = false;
        expect(CalendarCreateModal.prototype.validateCustomForm.call(context, baseFields)).toBe(false);
        expect(context.formError).toContain('Assign To only allows active users');

        context.isSelectedAssignedUserAllowed = true;
        expect(
            CalendarCreateModal.prototype.validateCustomForm.call(context, {
                ...baseFields,
                Start__c: null
            })
        ).toBe(false);
        expect(context.formError).toBe('A start date and time is required.');

        expect(
            CalendarCreateModal.prototype.validateCustomForm.call(context, {
                ...baseFields,
                End__c: null
            })
        ).toBe(false);
        expect(context.formError).toBe('An end date and time is required.');

        context.showCustomerConnection = true;
        expect(CalendarCreateModal.prototype.validateCustomForm.call(context, baseFields)).toBe(false);
        expect(context.formError).toBe(
            'Select a customer account or contact for customer appointments and follow-ups.'
        );

        context.showCustomerConnection = false;
        context.followUpCountValue = 2;
        expect(CalendarCreateModal.prototype.validateCustomForm.call(context, baseFields)).toBe(false);
        expect(context.formError).toBe(
            'Choose a follow-up frequency or set the follow-up count back to 0.'
        );

        context.followUpCountValue = 0;
        expect(CalendarCreateModal.prototype.validateCustomForm.call(context, baseFields)).toBe(true);
    });

    it('resolves assigned-user calendars and refreshes planning context across success, stale, and error paths', async () => {
        let resolveCalendarFirst;
        let resolveCalendarSecond;
        resolveCalendarIdForAssignedUser
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveCalendarFirst = resolve;
                    })
            )
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveCalendarSecond = resolve;
                    })
            )
            .mockRejectedValueOnce(new Error('calendar resolution failed'));

        const calendarContext = {
            selectedAssignedUserId: '005CURRENT',
            calendarResolutionSequence: 0,
            calendarValue: null,
            defaultCalendarId: 'a01DEFAULT'
        };

        const firstCalendarRefresh = CalendarCreateModal.prototype.syncCalendarWithAssignedUser.call(
            calendarContext
        );
        const secondCalendarRefresh = CalendarCreateModal.prototype.syncCalendarWithAssignedUser.call(
            calendarContext
        );

        resolveCalendarFirst('a01STALE');
        await flushPromises();
        expect(calendarContext.calendarValue).toBeNull();

        resolveCalendarSecond('a01RESOLVED');
        await Promise.all([firstCalendarRefresh, secondCalendarRefresh]);
        expect(calendarContext.calendarValue).toBe('a01RESOLVED');

        await CalendarCreateModal.prototype.syncCalendarWithAssignedUser.call(calendarContext);
        expect(calendarContext.calendarValue).toBe('a01RESOLVED');

        const emptyPlanningContext = {
            planningContextSequence: 0,
            selectedAssignedUserId: null,
            startValue: null,
            endValue: null,
            showCustomerConnection: false
        };

        await CalendarCreateModal.prototype.refreshPlanningContext.call(emptyPlanningContext);
        expect(emptyPlanningContext.availabilityInsight.summary).toBe(
            'Choose Assign To, Start, and End to check availability.'
        );
        expect(emptyPlanningContext.customerContext).toEqual({
            contactId: null,
            contactName: '',
            resolvedAccountId: null,
            resolvedAccountName: '',
            suggestedName: ''
        });

        let resolvePlanningFirst;
        let resolvePlanningSecond;
        getPlanningContext
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolvePlanningFirst = resolve;
                    })
            )
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolvePlanningSecond = resolve;
                    })
            )
            .mockRejectedValueOnce(new Error('planning context failed'));

        const planningContext = {
            planningContextSequence: 0,
            selectedAssignedUserId: '005CURRENT',
            startValue: localIso(2026, 3, 21, 9),
            endValue: localIso(2026, 3, 21, 10),
            showCustomerConnection: true,
            customerContactId: '003000000000001AAA',
            customerAccountId: null,
            lastAutoResolvedAccountId: null,
            appointmentTypeValue: 'Customer',
            selectedTemplateName: 'Discovery Call',
            applySuggestedNameIfAppropriate: jest.fn(),
            isLoadingPlanningContext: false
        };

        const firstPlanningRefresh = CalendarCreateModal.prototype.refreshPlanningContext.call(
            planningContext
        );
        const secondPlanningRefresh = CalendarCreateModal.prototype.refreshPlanningContext.call(
            planningContext
        );

        resolvePlanningFirst(
            buildPlanningContext({
                availability: {
                    allowed: false,
                    hasConflicts: true,
                    conflictCount: 1,
                    summary: 'Stale conflict',
                    tone: 'warning',
                    conflicts: []
                },
                customerContext: {
                    contactId: '003000000000001AAA',
                    contactName: 'Avery Stone',
                    resolvedAccountId: '001STALE',
                    resolvedAccountName: 'Old Revenue',
                    suggestedName: 'Stale Suggestion'
                }
            })
        );
        await flushPromises();
        expect(planningContext.customerAccountId).toBeNull();

        resolvePlanningSecond(
            buildPlanningContext({
                availability: {
                    allowed: true,
                    hasConflicts: false,
                    conflictCount: 0,
                    summary: 'Open slot.',
                    tone: 'success',
                    conflicts: []
                },
                customerContext: {
                    contactId: '003000000000001AAA',
                    contactName: 'Avery Stone',
                    resolvedAccountId: '001NEW',
                    resolvedAccountName: 'Revenue Team',
                    suggestedName: 'Fresh Suggestion'
                }
            })
        );
        await Promise.all([firstPlanningRefresh, secondPlanningRefresh]);

        expect(planningContext.availabilityInsight.summary).toBe('Open slot.');
        expect(planningContext.customerAccountId).toBe('001NEW');
        expect(planningContext.lastAutoResolvedAccountId).toBe('001NEW');
        expect(planningContext.applySuggestedNameIfAppropriate).toHaveBeenCalledWith(
            'Fresh Suggestion'
        );
        expect(planningContext.isLoadingPlanningContext).toBe(false);

        const errorPlanningContext = {
            planningContextSequence: 0,
            selectedAssignedUserId: '005CURRENT',
            startValue: localIso(2026, 3, 22, 9),
            endValue: localIso(2026, 3, 22, 10),
            showCustomerConnection: false,
            customerContactId: null,
            customerAccountId: null,
            appointmentTypeValue: 'Personal',
            selectedTemplateName: null,
            applySuggestedNameIfAppropriate: jest.fn(),
            isLoadingPlanningContext: false
        };

        await CalendarCreateModal.prototype.refreshPlanningContext.call(errorPlanningContext);
        expect(errorPlanningContext.availabilityInsight.summary).toBe(
            'Availability preview is temporarily unavailable.'
        );
        expect(errorPlanningContext.availabilityInsight.tone).toBe('warning');
        expect(errorPlanningContext.isLoadingPlanningContext).toBe(false);
    });

    it('applies suggested names only when the current title is empty or previously suggested', () => {
        const context = {
            nameValue: '',
            lastSuggestedName: ''
        };

        CalendarCreateModal.prototype.applySuggestedNameIfAppropriate.call(context, 'Discovery Call');
        expect(context.nameValue).toBe('Discovery Call');
        expect(context.lastSuggestedName).toBe('Discovery Call');

        CalendarCreateModal.prototype.applySuggestedNameIfAppropriate.call(context, 'Customer Check-In');
        expect(context.nameValue).toBe('Customer Check-In');
        expect(context.lastSuggestedName).toBe('Customer Check-In');

        context.nameValue = 'Manual Override';
        CalendarCreateModal.prototype.applySuggestedNameIfAppropriate.call(context, 'Ignored Suggestion');
        expect(context.nameValue).toBe('Manual Override');
        expect(context.lastSuggestedName).toBe('Customer Check-In');
    });
});