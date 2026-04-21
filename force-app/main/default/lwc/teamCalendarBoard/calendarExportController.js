const CSV_MIME_TYPE = 'text/csv;charset=utf-8';
const ICAL_MIME_TYPE = 'text/calendar;charset=utf-8';
const CSV_HEADERS = [
    'Subject',
    'Start Date',
    'Start Time (UTC)',
    'End Date',
    'End Time (UTC)',
    'All Day Event',
    'Status',
    'Calendar',
    'Owner',
    'Record Type',
    'Record Id',
    'Notes'
];

function normalizeRecords(records) {
    return Array.isArray(records) ? records.filter(Boolean) : [];
}

function toDate(value) {
    if (!value) {
        return null;
    }

    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatUtcDate(value) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function formatUtcTime(value) {
    return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

function formatIcsDate(value) {
    return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}`;
}

function formatIcsDateTime(value) {
    return `${formatIcsDate(value)}T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())}Z`;
}

function escapeCsvValue(value) {
    const normalized = value == null ? '' : String(value);
    if (!/[",\r\n]/.test(normalized)) {
        return normalized;
    }

    return `"${normalized.replace(/"/g, '""')}"`;
}

function escapeIcsText(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/\r\n|\r|\n/g, '\\n')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,');
}

function resolveRecordTitle(record) {
    return record?.name || record?.recordName || 'Untitled Event';
}

function resolveRecordEnd(record, startValue) {
    const resolvedStart = startValue || toDate(record?.start);
    const candidateEnd = toDate(record?.endDateTime || record?.end);

    if (!resolvedStart) {
        return candidateEnd;
    }

    if (!candidateEnd || candidateEnd.getTime() <= resolvedStart.getTime()) {
        const fallbackEnd = new Date(resolvedStart.getTime());
        fallbackEnd.setUTCMinutes(fallbackEnd.getUTCMinutes() + 30);
        return fallbackEnd;
    }

    return candidateEnd;
}

function resolveAllDayExclusiveEnd(record, startValue) {
    const resolvedStart = startValue || toDate(record?.start);
    if (!resolvedStart) {
        return null;
    }

    const inclusiveEnd = toDate(record?.endDateTime || record?.end) || resolvedStart;
    const exclusiveEnd = new Date(
        Date.UTC(
            inclusiveEnd.getUTCFullYear(),
            inclusiveEnd.getUTCMonth(),
            inclusiveEnd.getUTCDate() + 1
        )
    );
    return exclusiveEnd;
}

function mapIcsStatus(statusValue) {
    const normalized = String(statusValue || '').trim().toLowerCase();
    if (normalized === 'tentative') {
        return 'TENTATIVE';
    }
    if (normalized === 'cancelled' || normalized === 'canceled') {
        return 'CANCELLED';
    }
    if (normalized === 'confirmed') {
        return 'CONFIRMED';
    }
    return '';
}

function buildDescription(record) {
    const lines = [];

    if (record?.calendarName) {
        lines.push(`Calendar: ${record.calendarName}`);
    }
    if (record?.status) {
        lines.push(`Status: ${record.status}`);
    }
    if (record?.ownerName) {
        lines.push(`Owner: ${record.ownerName}`);
    }
    if (record?.recordObjectApiName) {
        lines.push(`Record Type: ${record.recordObjectApiName}`);
    }
    if (record?.notes) {
        lines.push(`Notes: ${record.notes}`);
    }

    return lines.join('\n');
}

function sanitizeFileSegment(value, fallbackValue) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || fallbackValue;
}

function buildExportFileName(context, extension, options = {}) {
    const scope = options.scope === 'single' ? 'event' : 'visible';
    const labelSource =
        options.fileLabel ||
        (scope === 'event'
            ? context?.activeEventMenu?.recordName || context?.selectedRecordId || 'event'
            : context?.rangeLabel || context?.currentView || 'calendar');
    const viewSegment = sanitizeFileSegment(context?.currentView, 'calendar');
    const labelSegment = sanitizeFileSegment(labelSource, scope === 'event' ? 'event' : 'range');

    return scope === 'event'
        ? `team-calendar-event-${labelSegment}.${extension}`
        : `team-calendar-${viewSegment}-${labelSegment}.${extension}`;
}

function downloadTextFile({ content, fileName, mimeType, doc = document, urlApi = URL }) {
    const blob = new Blob([content], { type: mimeType });
    const href = urlApi.createObjectURL(blob);
    const anchor = doc.createElement('a');
    anchor.href = href;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    doc.body.appendChild(anchor);
    anchor.click();
    doc.body.removeChild(anchor);
    urlApi.revokeObjectURL(href);
}

export function buildCsvExportContent(records) {
    const rows = normalizeRecords(records).map((record) => {
        const startValue = toDate(record?.start);
        const endValue = resolveRecordEnd(record, startValue);
        const isAllDay = record?.allDay === true;

        return [
            resolveRecordTitle(record),
            startValue ? formatUtcDate(startValue) : '',
            startValue && !isAllDay ? formatUtcTime(startValue) : '',
            endValue ? formatUtcDate(endValue) : '',
            endValue && !isAllDay ? formatUtcTime(endValue) : '',
            isAllDay ? 'TRUE' : 'FALSE',
            record?.status || '',
            record?.calendarName || '',
            record?.ownerName || '',
            record?.recordObjectApiName || '',
            record?.id || '',
            record?.notes || ''
        ];
    });

    return [CSV_HEADERS, ...rows]
        .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
        .join('\r\n');
}

export function buildIcsExportContent(records, options = {}) {
    const generatedAt = toDate(options.generatedAt) || new Date();
    const exportableRecords = normalizeRecords(records).filter((record) => toDate(record?.start));
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'PRODID:-//Team Calendar//EN',
        'X-WR-CALNAME:Team Calendar'
    ];

    exportableRecords.forEach((record, index) => {
        const startValue = toDate(record?.start);
        const isAllDay = record?.allDay === true;
        const uidSeed = record?.id || `${sanitizeFileSegment(resolveRecordTitle(record), 'event')}-${index + 1}`;
        const description = buildDescription(record);
        const statusValue = mapIcsStatus(record?.status);

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${uidSeed}@team-calendar`);
        lines.push(`DTSTAMP:${formatIcsDateTime(generatedAt)}`);

        if (isAllDay) {
            const exclusiveEnd = resolveAllDayExclusiveEnd(record, startValue);
            lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(startValue)}`);
            lines.push(`DTEND;VALUE=DATE:${formatIcsDate(exclusiveEnd)}`);
        } else {
            const endValue = resolveRecordEnd(record, startValue);
            lines.push(`DTSTART:${formatIcsDateTime(startValue)}`);
            lines.push(`DTEND:${formatIcsDateTime(endValue)}`);
        }

        lines.push(`SUMMARY:${escapeIcsText(resolveRecordTitle(record))}`);
        if (description) {
            lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
        }
        if (record?.calendarName) {
            lines.push(`CATEGORIES:${escapeIcsText(record.calendarName)}`);
        }
        if (statusValue) {
            lines.push(`STATUS:${statusValue}`);
        }
        lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

export function handleExportCsv(context, records = context?.filteredEvents, options = {}) {
    const exportRecords = normalizeRecords(records);
    if (!exportRecords.length) {
        context?.showToast(
            'Nothing to export',
            'No visible events are available for CSV export.',
            'warning'
        );
        return false;
    }

    try {
        downloadTextFile({
            content: buildCsvExportContent(exportRecords),
            fileName: buildExportFileName(context, 'csv', options),
            mimeType: CSV_MIME_TYPE,
            doc: context?.ownerDocument || document
        });
        return true;
    } catch (error) {
        context?.showToast(
            'CSV export failed',
            error?.message || 'The CSV export could not be generated.',
            'error'
        );
        return false;
    }
}

export function handleExportIcal(context, records = context?.filteredEvents, options = {}) {
    const exportRecords = normalizeRecords(records).filter((record) => toDate(record?.start));
    if (!exportRecords.length) {
        context?.showToast(
            'Nothing to export',
            'No visible events with valid dates are available for iCal export.',
            'warning'
        );
        return false;
    }

    try {
        downloadTextFile({
            content: buildIcsExportContent(exportRecords),
            fileName: buildExportFileName(context, 'ics', options),
            mimeType: ICAL_MIME_TYPE,
            doc: context?.ownerDocument || document
        });
        return true;
    } catch (error) {
        context?.showToast(
            'iCal export failed',
            error?.message || 'The iCal export could not be generated.',
            'error'
        );
        return false;
    }
}