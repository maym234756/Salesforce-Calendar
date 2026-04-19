/**
 * Pure functions for mapping Salesforce CalendarView (UI API) list records
 * into the normalized event format used by teamCalendarBoard.
 */
import { createContextLink, isInContractStage } from './calendarBoardHelpers';

// ── Field accessors ──────────────────────────────────────────────────

export function getUiFieldValue(record, fieldApiName) {
    return record?.fields?.[fieldApiName]?.value ?? null;
}

export function getUiFieldDisplayValue(record, fieldApiName) {
    return record?.fields?.[fieldApiName]?.displayValue ?? null;
}

// ── Date helpers ─────────────────────────────────────────────────────

export function toUiDateTimeValue(rawValue) {
    if (!rawValue) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawValue))) {
        return new Date(`${rawValue}T00:00:00`);
    }

    return new Date(rawValue);
}

export function formatUiDateForBoard(rawValue) {
    if (!rawValue) {
        return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawValue))) {
        return `${rawValue}T00:00:00`;
    }

    return rawValue;
}

export function toTime(value) {
    return new Date(value).getTime();
}

// ── Definition helpers ───────────────────────────────────────────────

export function getDefinitionObjectApiName(definition) {
    return definition?.listViewObjectApiName || definition?.sobjectType || null;
}

export function buildCalendarViewOptionalFields(definition) {
    const objectApiName = definition?.listViewObjectApiName || definition?.sobjectType;

    if (!objectApiName) {
        return [];
    }

    const fieldNames = [
        definition.startField,
        definition.endField,
        definition.displayField,
        'OwnerId',
        'Name'
    ].filter(Boolean);

    const extraFieldsByObject = {
        Marine__Boat__c: ['Appraisal__c', 'Deal__c', 'In_Contract__c', 'Unit_Deal_Stage__c', 'Stage__c', 'Marine__Stock_Number__c'],
        Appraisal__c: ['Boat__c', 'Deal__c', 'Deal_Stage__c', 'Stage__c'],
        Marine__Deal__c: ['Marine__Boat__c', 'Marine__Stage__c', 'Marine__Boat__r.Appraisal__c']
    };

    fieldNames.push(...(extraFieldsByObject[objectApiName] || []));

    return [...new Set(fieldNames.map((fieldName) => `${objectApiName}.${fieldName}`))];
}

// ── Payload extraction ───────────────────────────────────────────────

export function extractListRecords(payload) {
    if (Array.isArray(payload?.records)) {
        return payload.records;
    }

    if (Array.isArray(payload?.records?.records)) {
        return payload.records.records;
    }

    if (Array.isArray(payload?.items)) {
        return payload.items;
    }

    if (Array.isArray(payload?.records?.items)) {
        return payload.records.items;
    }

    return [];
}

// ── Record mapping ───────────────────────────────────────────────────

export function mapCalendarViewRecord(record, calendarDefinition, startBoundary, endBoundaryExclusive) {
    const startRaw = getUiFieldValue(record, calendarDefinition.startField);
    if (!startRaw) {
        return null;
    }

    const startValue = toUiDateTimeValue(startRaw);
    if (!startValue || Number.isNaN(startValue.getTime())) {
        return null;
    }

    const endRaw = calendarDefinition.endField
        ? getUiFieldValue(record, calendarDefinition.endField)
        : null;
    const endValue = endRaw ? toUiDateTimeValue(endRaw) : null;

    if (startValue >= endBoundaryExclusive) {
        return null;
    }

    if (endValue && endValue < startBoundary) {
        return null;
    }

    if (!endValue && startValue < startBoundary) {
        return null;
    }

    const titleField = calendarDefinition.displayField || 'Name';

    const preferredDisplayValue = getUiFieldDisplayValue(record, titleField);
    const preferredRawValue = getUiFieldValue(record, titleField);

    const fallbackNameDisplay = getUiFieldDisplayValue(record, 'Name');
    const fallbackNameValue = getUiFieldValue(record, 'Name');

    const titleValue =
        preferredDisplayValue ||
        (
            preferredRawValue &&
            !/^[a-zA-Z0-9]{15,18}$/.test(String(preferredRawValue))
                ? preferredRawValue
                : null
        ) ||
        fallbackNameDisplay ||
        fallbackNameValue ||
        'Untitled';

    const isDateOnlyStart = /^\d{4}-\d{2}-\d{2}$/.test(String(startRaw));
    const recordObjectApiName = getDefinitionObjectApiName(calendarDefinition);

    return {
        id: record.id,
        name: String(titleValue),
        ownerId: getUiFieldValue(record, 'OwnerId'),
        ownerName: getUiFieldDisplayValue(record, 'OwnerId'),
        start: formatUiDateForBoard(startRaw),
        endDateTime: endRaw ? formatUiDateForBoard(endRaw) : null,
        allDay: Boolean(isDateOnlyStart && !calendarDefinition.endField),
        status: 'Calendar View',
        notes: `${calendarDefinition.name} • ${calendarDefinition.sobjectType}`,
        calendarId: calendarDefinition.id,
        calendarName: calendarDefinition.name,
        calendarColor: calendarDefinition.color || '#0176d3',
        externalEventId: null,
        syncStatus: null,
        syncError: null,
        lastSyncedAt: null,
        recordObjectApiName,
        recordContextId: calendarDefinition.id,
        canEdit: calendarDefinition?.canEdit === true,
        canDelete: false,
        contextLinks: buildCalendarViewContextLinks(record, recordObjectApiName),
        hoverDetails: buildCalendarViewHoverDetails(record, calendarDefinition, recordObjectApiName)
    };
}

// ── Context links ────────────────────────────────────────────────────

export function buildCalendarViewContextLinks(record, objectApiName) {
    switch (objectApiName) {
    case 'Marine__Boat__c':
        return buildBoatContextLinks(record);
    case 'Appraisal__c':
        return buildAppraisalContextLinks(record);
    case 'Marine__Deal__c':
        return buildDealContextLinks(record);
    default:
        return [];
    }
}

function buildBoatContextLinks(record) {
    const links = [
        createContextLink('unit', 'Unit', record.id, 'Marine__Boat__c', getUiFieldDisplayValue(record, 'Name') || getUiFieldValue(record, 'Name') || 'Unit')
    ];

    const appraisalId = getUiFieldValue(record, 'Appraisal__c');
    if (appraisalId) {
        links.push(
            createContextLink(
                'appraisal',
                'Appraisal',
                appraisalId,
                'Appraisal__c',
                getUiFieldDisplayValue(record, 'Appraisal__c') || 'Appraisal'
            )
        );
    }

    const dealStage = getUiFieldDisplayValue(record, 'Unit_Deal_Stage__c') || getUiFieldValue(record, 'Unit_Deal_Stage__c');
    const hasInContractDeal = getUiFieldValue(record, 'In_Contract__c') === true || isInContractStage(dealStage);
    const dealId = getUiFieldValue(record, 'Deal__c');
    if (dealId && hasInContractDeal) {
        links.push(
            createContextLink(
                'sales-deal',
                'Sales Deal',
                dealId,
                'Marine__Deal__c',
                getUiFieldDisplayValue(record, 'Deal__c') || 'Sales Deal'
            )
        );
    }

    return links;
}

function buildAppraisalContextLinks(record) {
    const links = [];

    const boatId = getUiFieldValue(record, 'Boat__c');
    if (boatId) {
        links.push(
            createContextLink(
                'unit',
                'Unit',
                boatId,
                'Marine__Boat__c',
                getUiFieldDisplayValue(record, 'Boat__c') || 'Unit'
            )
        );
    }

    links.push(
        createContextLink(
            'appraisal',
            'Appraisal',
            record.id,
            'Appraisal__c',
            getUiFieldDisplayValue(record, 'Name') || getUiFieldValue(record, 'Name') || 'Appraisal'
        )
    );

    const dealId = getUiFieldValue(record, 'Deal__c');
    const dealStage = getUiFieldDisplayValue(record, 'Deal_Stage__c') || getUiFieldValue(record, 'Deal_Stage__c');
    if (dealId && isInContractStage(dealStage)) {
        links.push(
            createContextLink(
                'sales-deal',
                'Sales Deal',
                dealId,
                'Marine__Deal__c',
                getUiFieldDisplayValue(record, 'Deal__c') || 'Sales Deal'
            )
        );
    }

    return links;
}

function buildDealContextLinks(record) {
    const links = [];

    const boatId = getUiFieldValue(record, 'Marine__Boat__c');
    if (boatId) {
        links.push(
            createContextLink(
                'unit',
                'Unit',
                boatId,
                'Marine__Boat__c',
                getUiFieldDisplayValue(record, 'Marine__Boat__c') || 'Unit'
            )
        );
    }

    const appraisalId = getUiFieldValue(record, 'Marine__Boat__r.Appraisal__c');
    if (appraisalId) {
        links.push(
            createContextLink(
                'appraisal',
                'Appraisal',
                appraisalId,
                'Appraisal__c',
                getUiFieldDisplayValue(record, 'Marine__Boat__r.Appraisal__c') || 'Appraisal'
            )
        );
    }

    const dealStage = getUiFieldDisplayValue(record, 'Marine__Stage__c') || getUiFieldValue(record, 'Marine__Stage__c');
    if (isInContractStage(dealStage)) {
        links.push(
            createContextLink(
                'sales-deal',
                'Sales Deal',
                record.id,
                'Marine__Deal__c',
                getUiFieldDisplayValue(record, 'Name') || getUiFieldValue(record, 'Name') || 'Sales Deal'
            )
        );
    }

    return links;
}

// ── Hover details ────────────────────────────────────────────────────

export function buildCalendarViewHoverDetails(record, calendarDefinition, objectApiName) {
    const lines = [];

    if (calendarDefinition?.name) {
        lines.push(calendarDefinition.name);
    }

    if (objectApiName === 'Marine__Boat__c') {
        const stockNumber = getUiFieldDisplayValue(record, 'Marine__Stock_Number__c') || getUiFieldValue(record, 'Marine__Stock_Number__c');
        const stage = getUiFieldDisplayValue(record, 'Stage__c') || getUiFieldValue(record, 'Stage__c');

        if (stockNumber) {
            lines.push(`Stock #: ${stockNumber}`);
        }

        if (stage) {
            lines.push(`Stage: ${stage}`);
        }
    }

    if (objectApiName === 'Appraisal__c') {
        const boatLabel = getUiFieldDisplayValue(record, 'Boat__c');
        const stage = getUiFieldDisplayValue(record, 'Stage__c') || getUiFieldValue(record, 'Stage__c');

        if (boatLabel) {
            lines.push(`Unit: ${boatLabel}`);
        }

        if (stage) {
            lines.push(`Appraisal: ${stage}`);
        }
    }

    if (objectApiName === 'Marine__Deal__c') {
        const boatLabel = getUiFieldDisplayValue(record, 'Marine__Boat__c');
        const stage = getUiFieldDisplayValue(record, 'Marine__Stage__c') || getUiFieldValue(record, 'Marine__Stage__c');

        if (boatLabel) {
            lines.push(`Unit: ${boatLabel}`);
        }

        if (stage) {
            lines.push(`Deal: ${stage}`);
        }
    }

    return lines.filter(Boolean);
}

// ── Event deduplication ──────────────────────────────────────────────

export function dedupeNormalizedEvents(events) {
    const rowsByKey = new Map();

    (events || []).forEach((row) => {
        const key =
            `${row.calendarId || 'none'}::` +
            `${row.id || row.externalEventId || row.name || 'row'}`;

        if (!rowsByKey.has(key)) {
            rowsByKey.set(key, row);
        }
    });

    return Array.from(rowsByKey.values()).sort((left, right) => {
        const leftTime = toTime(left.start);
        const rightTime = toTime(right.start);

        if (leftTime !== rightTime) {
            return leftTime - rightTime;
        }

        return String(left.name || '').localeCompare(String(right.name || ''));
    });
}
