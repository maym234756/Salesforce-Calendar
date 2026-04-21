const { createElement } = require('lwc');
const CalendarToolbar = require('c/calendarToolbar').default;

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('c-calendar-toolbar', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    function buildElement(props = {}) {
        const el = createElement('c-calendar-toolbar', { is: CalendarToolbar });
        el.rangeLabel = props.rangeLabel || 'April 2026';
        el.currentView = props.currentView || 'month';
        el.viewOptions = props.viewOptions || [
            { label: 'Month', value: 'month' },
            { label: 'Week', value: 'week' },
            { label: 'Day', value: 'day' },
            { label: 'Agenda', value: 'agenda' }
        ];
        el.calendarOptions = props.calendarOptions || [{ label: 'All Calendars', value: '' }];
        el.statusOptions = props.statusOptions || [{ label: 'All', value: '' }];
        el.eventCount = props.eventCount || 0;
        el.activeUserOptions = props.activeUserOptions !== undefined ? props.activeUserOptions : [];
        el.userOptions = props.userOptions !== undefined ? props.userOptions : [];
        el.selectedUserIds = props.selectedUserIds !== undefined ? props.selectedUserIds : [];
        el.selectedUsers = props.selectedUsers !== undefined ? props.selectedUsers : [];
        el.selectedUsersDetailed = props.selectedUsersDetailed !== undefined ? props.selectedUsersDetailed : [];
        el.selectedUserDetails = props.selectedUserDetails !== undefined ? props.selectedUserDetails : [];
        el.selectedUserCount = props.selectedUserCount;
        el.maxSelectedUsers = props.maxSelectedUsers !== undefined ? props.maxSelectedUsers : 20;
        el.maxUsers = props.maxUsers !== undefined ? props.maxUsers : 20;
        el.activeUserCalendarMenu =
            props.activeUserCalendarMenu !== undefined ? props.activeUserCalendarMenu : null;
        el.activeUserMenu = props.activeUserMenu !== undefined ? props.activeUserMenu : null;
        el.googleImportActionLabel = props.googleImportActionLabel || '';
        el.googleImportActionDisabled = props.googleImportActionDisabled || false;
        el.googleExportActionLabel = props.googleExportActionLabel || '';
        el.googleExportActionDisabled = props.googleExportActionDisabled || false;

        if (props.userLayoutPreference) {
            el.userLayoutPreference = props.userLayoutPreference;
        }

        document.body.appendChild(el);
        return el;
    }

    function findButtonByLabel(element, label) {
        return Array.from(element.shadowRoot.querySelectorAll('lightning-button')).find(
            (button) => button.label === label
        );
    }

    function findIconButton(element, altText) {
        return Array.from(element.shadowRoot.querySelectorAll('lightning-button-icon')).find(
            (button) =>
                button.alternativeText === altText || button.getAttribute('alternative-text') === altText
        );
    }

    function findInputByLabel(element, label) {
        return Array.from(element.shadowRoot.querySelectorAll('lightning-input')).find(
            (input) => input.label === label
        );
    }

    it('mounts without throwing', async () => {
        const el = buildElement();
        await flushPromises();
        expect(el).not.toBeNull();
    });

    it('fires "prev" event when previous button is clicked', async () => {
        const el = buildElement();
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('prev', handler);

        // lightning-button-icon stubs are queried by icon-name attribute
        const btns = el.shadowRoot.querySelectorAll('lightning-button-icon');
        const prevBtn = Array.from(btns).find((b) => b.alternativeText === 'Previous' || b.getAttribute('alternative-text') === 'Previous');
        // Dispatch click on the first icon button (prev comes before next)
        expect(btns.length).toBeGreaterThanOrEqual(1);
        btns[0].click();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires "next" event when next button is clicked', async () => {
        const el = buildElement();
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('next', handler);

        const btns = el.shadowRoot.querySelectorAll('lightning-button-icon');
        // next button is the second icon button (after prev)
        expect(btns.length).toBeGreaterThanOrEqual(2);
        btns[1].click();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires "today" event when Today button is clicked', async () => {
        const el = buildElement();
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('today', handler);

        const todayBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button'))
            .find((b) => b.label === 'Today');
        expect(todayBtn).not.toBeNull();
        todayBtn.click();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires "new" event when New Event button is clicked', async () => {
        const el = buildElement();
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('new', handler);

        const newBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button'))
            .find((b) => b.label === 'New Event');
        expect(newBtn).not.toBeNull();
        newBtn.click();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires "exportcsv" event when Export CSV is clicked', async () => {
        const el = buildElement();
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('exportcsv', handler);

        const exportCsvBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find(
            (button) => button.label === 'Export CSV'
        );
        expect(exportCsvBtn).not.toBeNull();
        exportCsvBtn.click();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires "exportical" event when Export iCal is clicked', async () => {
        const el = buildElement();
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('exportical', handler);

        const exportIcalBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find(
            (button) => button.label === 'Export iCal'
        );
        expect(exportIcalBtn).not.toBeNull();
        exportIcalBtn.click();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires "viewchange" event with the selected view value', async () => {
        const el = buildElement();
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('viewchange', handler);

        // view toggle is a lightning-radio-group
        const radioGroup = el.shadowRoot.querySelector('lightning-radio-group');
        expect(radioGroup).not.toBeNull();
        radioGroup.dispatchEvent(
            new CustomEvent('change', { detail: { value: 'week' }, bubbles: true, composed: true })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toBe('week');
    });

    it('fires "calendarchange" event with the selected calendar id', async () => {
        const el = buildElement({
            calendarOptions: [
                { label: 'All Calendars', value: '' },
                { label: 'Sales Events', value: 'a01AAA' }
            ]
        });
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('calendarchange', handler);

        // Calendar dropdown is the first lightning-combobox (label="Calendar")
        const combobox = el.shadowRoot.querySelector('lightning-combobox');
        expect(combobox).not.toBeNull();
        combobox.dispatchEvent(
            new CustomEvent('change', { detail: { value: 'a01AAA' }, bubbles: true, composed: true })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toBe('a01AAA');
    });

    it('displays the provided rangeLabel', async () => {
        const el = buildElement({ rangeLabel: 'April 2026' });
        await flushPromises();

        expect(el.shadowRoot.textContent).toContain('April 2026');
    });

    it('toggles the mobile toolbar state and dispatches search changes', async () => {
        const el = buildElement();
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('searchchange', handler);

        el.shadowRoot.querySelector('.toolbar__mobile-toggle').click();
        await flushPromises();

        expect(el.shadowRoot.querySelector('.toolbar').className).toContain('toolbar--mobile-expanded');

        const searchInput = findInputByLabel(el, 'Search events');
        searchInput.value = 'Quarterly';
        searchInput.dispatchEvent(new CustomEvent('input', { bubbles: true, composed: true }));

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toBe('Quarterly');
    });

    it('fires refresh, pdf, and Google sync button actions', async () => {
        const el = buildElement({
            googleImportActionLabel: 'Pull Google',
            googleExportActionLabel: 'Push Google'
        });
        await flushPromises();

        const refreshHandler = jest.fn();
        const pdfHandler = jest.fn();
        const importHandler = jest.fn();
        const exportHandler = jest.fn();
        el.addEventListener('refresh', refreshHandler);
        el.addEventListener('generatepdf', pdfHandler);
        el.addEventListener('googleimportaction', importHandler);
        el.addEventListener('googleexportaction', exportHandler);

        findIconButton(el, 'Refresh').click();
        findButtonByLabel(el, 'Generate PDF').click();
        findButtonByLabel(el, 'Pull Google').click();
        findButtonByLabel(el, 'Push Google').click();

        expect(refreshHandler).toHaveBeenCalledTimes(1);
        expect(pdfHandler).toHaveBeenCalledTimes(1);
        expect(importHandler).toHaveBeenCalledTimes(1);
        expect(exportHandler).toHaveBeenCalledTimes(1);
    });

    it('updates layout settings from the filter menu and resets them to the user preference', async () => {
        const el = buildElement({
            userLayoutPreference: {
                showSelectUsersBox: true,
                showFilterControls: true
            }
        });
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('layoutchange', handler);

        findIconButton(el, 'Filters').click();
        await flushPromises();

        const selectedUsersToggle = findInputByLabel(el, 'Show Selected Users box');
        selectedUsersToggle.checked = false;
        selectedUsersToggle.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                composed: true
            })
        );
        await flushPromises();

        const sidebarToggle = findInputByLabel(el, 'Show View / Calendar / Status');
        sidebarToggle.checked = false;
        sidebarToggle.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                composed: true
            })
        );
        await flushPromises();

        findButtonByLabel(el, 'Reset').click();
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(3);
        expect(handler.mock.calls[0][0].detail.settings.showSelectUsersBox).toBe(false);
        expect(handler.mock.calls[1][0].detail.settings.showFilterControls).toBe(false);
        expect(handler.mock.calls[2][0].detail.settings.showSelectUsersBox).toBe(true);
        expect(handler.mock.calls[2][0].detail.settings.showFilterControls).toBe(true);
    });

    it('dispatches selected-user changes from the user menu and enforces the selection limit', async () => {
        const el = buildElement({
            activeUserOptions: [
                { id: 'u1', label: 'Alex' },
                { id: 'u2', label: 'Jamie' }
            ],
            selectedUserIds: ['u1'],
            maxSelectedUsers: 2
        });
        await flushPromises();

        const handler = jest.fn();
        el.addEventListener('userselectionchange', handler);

        findButtonByLabel(el, 'Edit Users (1)').click();
        await flushPromises();

        const jamieCheckbox = findInputByLabel(el, 'Jamie');
        jamieCheckbox.checked = true;
        jamieCheckbox.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                composed: true
            })
        );
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.selectedUserIds).toEqual(['u1', 'u2']);

        const limitedEl = buildElement({
            activeUserOptions: [
                { id: 'u1', label: 'Alex' },
                { id: 'u2', label: 'Jamie' }
            ],
            selectedUserIds: ['u1'],
            maxSelectedUsers: 1
        });
        await flushPromises();
        findButtonByLabel(limitedEl, 'Edit Users (1)').click();
        await flushPromises();

        expect(findInputByLabel(limitedEl, 'Jamie').disabled).toBe(true);
    });

    it('dispatches selected-user open and remove actions from the chip panel', async () => {
        const el = buildElement({
            selectedUserIds: ['u1', 'u2'],
            selectedUsersDetailed: [
                {
                    id: 'u1',
                    label: 'Alex',
                    chipClass: 'user-chip',
                    selectedCalendarSummary: '1 calendar'
                },
                {
                    id: 'u2',
                    label: 'Jamie',
                    chipClass: 'user-chip',
                    selectedCalendarSummary: '2 calendars'
                }
            ]
        });
        await flushPromises();

        const openHandler = jest.fn();
        const removeHandler = jest.fn();
        el.addEventListener('usercalendaropen', openHandler);
        el.addEventListener('userselectionchange', removeHandler);

        el.shadowRoot.querySelector('.user-chip__name').click();
        el.shadowRoot.querySelector('.user-chip__remove').click();

        expect(openHandler).toHaveBeenCalledTimes(1);
        expect(openHandler.mock.calls[0][0].detail.userId).toBe('u1');
        expect(removeHandler).toHaveBeenCalledTimes(1);
        expect(removeHandler.mock.calls[0][0].detail.selectedUserIds).toEqual(['u2']);
    });

    it('dispatches user calendar menu selection changes and close events', async () => {
        const el = buildElement({
            activeUserCalendarMenu: {
                id: 'u1',
                label: 'Alex',
                selectedCalendarSummary: '1 calendar',
                selectedCalendarIds: ['c1'],
                hasCalendarOptions: true,
                calendarOptions: [
                    { id: 'c1', label: 'Revenue', checked: true },
                    { id: 'c2', label: 'Field', checked: false }
                ]
            }
        });
        await flushPromises();

        const selectionHandler = jest.fn();
        const closeHandler = jest.fn();
        el.addEventListener('usercalendarselectionchange', selectionHandler);
        el.addEventListener('usercalendarmenuclose', closeHandler);

        const calendarToggle = findInputByLabel(el, 'Field');
        calendarToggle.checked = true;
        calendarToggle.dispatchEvent(
            new CustomEvent('change', {
                bubbles: true,
                composed: true
            })
        );
        await flushPromises();

        el.shadowRoot.querySelector('.user-calendar-panel .user-menu__done').click();

        expect(selectionHandler).toHaveBeenCalledTimes(1);
        expect(selectionHandler.mock.calls[0][0].detail).toEqual({
            userId: 'u1',
            selectedCalendarIds: ['c1', 'c2']
        });
        expect(closeHandler).toHaveBeenCalledTimes(1);
    });

    it('uses fallback alias props for users, counts, and the active calendar menu', async () => {
        const el = buildElement({
            activeUserOptions: [],
            userOptions: [{ value: 'u9', label: 'Taylor' }],
            selectedUserIds: null,
            selectedUsers: ['u9'],
            selectedUsersDetailed: [],
            selectedUserDetails: [
                {
                    id: 'u9',
                    label: 'Taylor',
                    chipClass: 'user-chip',
                    selectedCalendarSummary: 'Revenue Team'
                }
            ],
            selectedUserCount: undefined,
            maxSelectedUsers: 0,
            maxUsers: 3,
            activeUserCalendarMenu: null,
            activeUserMenu: {
                id: 'u9',
                label: 'Taylor',
                selectedCalendarSummary: 'Revenue Team',
                hasCalendarOptions: false,
                calendarHelperText: 'No user calendars available.'
            }
        });
        await flushPromises();

        expect(findButtonByLabel(el, 'Edit Users (1)')).not.toBeNull();
        expect(el.shadowRoot.textContent).toContain('1 / 3 selected');

        findButtonByLabel(el, 'Edit Users (1)').click();
        await flushPromises();

        expect(findInputByLabel(el, 'Taylor')).not.toBeNull();
        expect(el.shadowRoot.textContent).toContain('Taylor Calendars');
        expect(el.shadowRoot.textContent).toContain('No user calendars available.');
    });
});
