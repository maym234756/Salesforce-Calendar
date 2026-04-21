import getPdfExportPageUrl from '@salesforce/apex/TeamCalendarBoardController.getPdfExportPageUrl';

export const DEFAULT_PDF_EXPORT_PAGE_URL = '/apex/TeamCalendarPdfExport';

export async function loadPdfExportPageUrl(context) {
    try {
        const resolvedUrl = await getPdfExportPageUrl();
        context.pdfExportPageUrl = resolvedUrl || DEFAULT_PDF_EXPORT_PAGE_URL;
    } catch (error) {
        context.pdfExportPageUrl = DEFAULT_PDF_EXPORT_PAGE_URL;
    }
}

export function handleGeneratePdf(context) {
    if (context.isLoading) {
        context.showToast('Generate PDF', 'Wait for the calendar to finish loading.', 'warning');
        return;
    }

    try {
        submitPdfExportForm(context);
    } catch (error) {
        context.showToast('Generate PDF', context.extractErrorMessage(error), 'error');
    }
}

export function submitPdfExportForm(context) {
    const host = context.template.querySelector('[data-export-form-host]');
    if (!host) {
        throw new Error('PDF export form host is unavailable.');
    }

    while (host.firstChild) {
        host.removeChild(host.firstChild);
    }

    const exportForm = context.ownerDocument.createElement('form');
    exportForm.action = context.pdfExportPageUrl || DEFAULT_PDF_EXPORT_PAGE_URL;
    exportForm.method = 'post';
    exportForm.target = '_blank';
    exportForm.style.display = 'none';

    const fieldValues = buildPdfExportFieldValues({
        currentView: context.currentView,
        currentDate: context.currentDate,
        rangeLabel: context.rangeLabel,
        selectedCalendarId: context.selectedCalendarId,
        selectedCalendarDefinition: context.selectedCalendarDefinition,
        selectedStatus: context.selectedStatus,
        statusOptions: context.statusOptions,
        selectedUsersDetailed: context.selectedUsersDetailed,
        showWeekends: context.showWeekends
    });

    Object.entries(fieldValues).forEach(([name, value]) => {
        const input = context.ownerDocument.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value ?? '';
        exportForm.appendChild(input);
    });

    const eventsField = context.ownerDocument.createElement('textarea');
    eventsField.name = 'eventsJson';
    eventsField.value = JSON.stringify(context.events || []);
    exportForm.appendChild(eventsField);

    host.appendChild(exportForm);
    exportForm.submit();
}

export function buildPdfExportFieldValues({
    currentView,
    currentDate,
    rangeLabel,
    selectedCalendarId,
    selectedCalendarDefinition,
    selectedStatus,
    statusOptions,
    selectedUsersDetailed,
    showWeekends
}) {
    return {
        view: currentView,
        currentDate: formatPdfExportDate(currentDate),
        documentTitle: `Team Calendar - ${rangeLabel}`,
        rangeLabel,
        calendarId: selectedCalendarId || '',
        calendarLabel: resolveSelectedCalendarLabel(selectedCalendarId, selectedCalendarDefinition),
        statusFilter: selectedStatus || '',
        statusLabel: resolveSelectedStatusLabel(selectedStatus, statusOptions),
        selectedUserLabelText: resolveSelectedUserLabelText(selectedUsersDetailed),
        showWeekends: String(showWeekends)
    };
}

export function formatPdfExportDate(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
        return '';
    }

    const yearValue = dateValue.getFullYear();
    const monthValue = String(dateValue.getMonth() + 1).padStart(2, '0');
    const dayValue = String(dateValue.getDate()).padStart(2, '0');

    return `${yearValue}-${monthValue}-${dayValue}`;
}

export function resolveSelectedCalendarLabel(selectedCalendarId, selectedCalendarDefinition) {
    if (!selectedCalendarId) {
        return 'All Calendars';
    }

    return selectedCalendarDefinition?.name || 'Selected Calendar';
}

export function resolveSelectedStatusLabel(selectedStatus, statusOptions = []) {
    if (!selectedStatus) {
        return 'All Statuses';
    }

    const matched = statusOptions.find((option) => option.value === selectedStatus);
    return matched?.label || selectedStatus;
}

export function resolveSelectedUserLabelText(selectedUsersDetailed = []) {
    const labels = selectedUsersDetailed.map((user) => user.label).filter(Boolean);
    return labels.length ? labels.join(', ') : 'None';
}