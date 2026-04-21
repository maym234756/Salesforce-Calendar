jest.mock(
    '@salesforce/apex/TeamCalendarBoardController.getPdfExportPageUrl',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const getPdfExportPageUrl = require('@salesforce/apex/TeamCalendarBoardController.getPdfExportPageUrl').default;

const {
    DEFAULT_PDF_EXPORT_PAGE_URL,
    loadPdfExportPageUrl,
    handleGeneratePdf,
    submitPdfExportForm,
    buildPdfExportFieldValues,
    formatPdfExportDate,
    resolveSelectedCalendarLabel,
    resolveSelectedStatusLabel,
    resolveSelectedUserLabelText
} = require('../calendarPdfExportController');

describe('teamCalendarBoard calendarPdfExportController', () => {
    let originalSubmitDescriptor;
    let submitMock;

    beforeEach(() => {
        originalSubmitDescriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'submit');
        submitMock = jest.fn();
        Object.defineProperty(HTMLFormElement.prototype, 'submit', {
            configurable: true,
            value: submitMock
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';

        if (originalSubmitDescriptor) {
            Object.defineProperty(HTMLFormElement.prototype, 'submit', originalSubmitDescriptor);
        } else {
            delete HTMLFormElement.prototype.submit;
        }
    });

    it('falls back to the default export page URL when the Apex lookup fails', async () => {
        getPdfExportPageUrl.mockRejectedValueOnce(new Error('nope'));
        const context = { pdfExportPageUrl: '' };

        await loadPdfExportPageUrl(context);

        expect(context.pdfExportPageUrl).toBe(DEFAULT_PDF_EXPORT_PAGE_URL);
    });

    it('builds export field values with resolved labels and formatted dates', () => {
        const fieldValues = buildPdfExportFieldValues({
            currentView: 'week',
            currentDate: new Date(2026, 3, 19),
            rangeLabel: 'Apr 13 - Apr 19',
            selectedCalendarId: 'a01AAA',
            selectedCalendarDefinition: { name: 'Sales Team' },
            selectedStatus: 'Confirmed',
            statusOptions: [{ label: 'Confirmed', value: 'Confirmed' }],
            selectedUsersDetailed: [{ label: 'Miles May' }, { label: 'Afton Averett' }],
            showWeekends: false
        });

        expect(fieldValues).toEqual({
            view: 'week',
            currentDate: '2026-04-19',
            documentTitle: 'Team Calendar - Apr 13 - Apr 19',
            rangeLabel: 'Apr 13 - Apr 19',
            calendarId: 'a01AAA',
            calendarLabel: 'Sales Team',
            statusFilter: 'Confirmed',
            statusLabel: 'Confirmed',
            selectedUserLabelText: 'Miles May, Afton Averett',
            showWeekends: 'false'
        });
    });

    it('submits a populated hidden export form to the configured PDF page', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);

        submitPdfExportForm({
            template: {
                querySelector: jest.fn(() => host)
            },
            ownerDocument: document,
            pdfExportPageUrl: '/apex/CustomExport',
            currentView: 'month',
            currentDate: new Date(2026, 3, 19),
            rangeLabel: 'April 2026',
            selectedCalendarId: 'a01AAA',
            selectedCalendarDefinition: { name: 'Sales Team' },
            selectedStatus: '',
            statusOptions: [],
            selectedUsersDetailed: [{ label: 'Miles May' }],
            showWeekends: true,
            events: [{ id: 'evt-1', name: 'Launch' }]
        });

        const exportForm = host.querySelector('form');
        expect(exportForm).not.toBeNull();
        expect(exportForm.action).toContain('/apex/CustomExport');
        expect(exportForm.querySelector('input[name="calendarLabel"]').value).toBe('Sales Team');
        expect(exportForm.querySelector('input[name="selectedUserLabelText"]').value).toBe('Miles May');
        expect(exportForm.querySelector('textarea[name="eventsJson"]').value).toBe(
            JSON.stringify([{ id: 'evt-1', name: 'Launch' }])
        );
        expect(submitMock).toHaveBeenCalledTimes(1);
    });

    it('shows a warning instead of exporting while the calendar is loading', () => {
        const showToast = jest.fn();

        handleGeneratePdf({
            isLoading: true,
            showToast,
            extractErrorMessage: jest.fn()
        });

        expect(showToast).toHaveBeenCalledWith(
            'Generate PDF',
            'Wait for the calendar to finish loading.',
            'warning'
        );
    });

    it('exports sensible defaults for the PDF helper label builders', () => {
        expect(formatPdfExportDate(new Date(2026, 0, 5))).toBe('2026-01-05');
        expect(resolveSelectedCalendarLabel('', null)).toBe('All Calendars');
        expect(resolveSelectedStatusLabel('', [])).toBe('All Statuses');
        expect(resolveSelectedUserLabelText([])).toBe('None');
    });
});