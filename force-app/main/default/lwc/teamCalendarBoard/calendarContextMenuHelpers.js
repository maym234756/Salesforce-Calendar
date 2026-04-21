/**
 * Pure helper functions for context menus and hover previews
 * used by teamCalendarBoard.
 */
import { createContextLink, dedupeContextLinks } from './calendarBoardHelpers';
import { getDefinitionObjectApiName } from './calendarViewMapper';

// ── Positioning ──────────────────────────────────────────────────────

export function buildEventContextMenuStyle(clientX, clientY, itemCount = 1) {
    const menuWidth = 216;
    const menuHeight = 64 + Math.max(itemCount, 1) * 48;
    const margin = 12;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
    const nextLeft = Math.min(
        Math.max(Number(clientX) || margin, margin),
        Math.max(viewportWidth - menuWidth - margin, margin)
    );
    const nextTop = Math.min(
        Math.max(Number(clientY) || margin, margin),
        Math.max(viewportHeight - menuHeight - margin, margin)
    );

    return `left:${nextLeft}px; top:${nextTop}px;`;
}

export function buildHoverPreviewStyle(clientX, clientY) {
    const previewWidth = 260;
    const previewHeight = 148;
    const margin = 12;
    const horizontalOffset = 14;
    const verticalOffset = 18;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
    const requestedLeft = (Number(clientX) || margin) + horizontalOffset;
    const requestedTop = (Number(clientY) || margin) + verticalOffset;
    const nextLeft = Math.min(
        Math.max(requestedLeft, margin),
        Math.max(viewportWidth - previewWidth - margin, margin)
    );
    const nextTop = Math.min(
        Math.max(requestedTop, margin),
        Math.max(viewportHeight - previewHeight - margin, margin)
    );

    return `left:${nextLeft}px; top:${nextTop}px;`;
}

// ── Move helpers ─────────────────────────────────────────────────────

export function buildMovedCalendarEventRequest(eventRecord, targetDateKey) {
    const originalStart = new Date(eventRecord.start);
    const originalEnd = new Date(eventRecord.endDateTime || eventRecord.start);

    if (Number.isNaN(originalStart.getTime()) || Number.isNaN(originalEnd.getTime())) {
        return null;
    }

    const durationMs = Math.max(
        originalEnd.getTime() - originalStart.getTime(),
        eventRecord.allDay ? (23 * 60 + 59) * 60 * 1000 : 60 * 60 * 1000
    );

    const nextStart = new Date(`${targetDateKey}T00:00:00`);
    if (Number.isNaN(nextStart.getTime())) {
        return null;
    }

    if (eventRecord.allDay) {
        nextStart.setHours(0, 0, 0, 0);
    } else {
        nextStart.setHours(
            originalStart.getHours(),
            originalStart.getMinutes(),
            originalStart.getSeconds(),
            originalStart.getMilliseconds()
        );
    }

    const nextEnd = new Date(nextStart.getTime() + durationMs);

    return {
        recordId: eventRecord.id,
        calendarId: eventRecord.calendarId,
        name: eventRecord.name,
        startValue: nextStart.toISOString(),
        endValue: nextEnd.toISOString(),
        allDay: eventRecord.allDay === true,
        status: eventRecord.status,
        notes: eventRecord.notes
    };
}

export function formatMoveTargetLabel(targetDateKey) {
    const targetDate = new Date(`${targetDateKey}T12:00:00`);
    if (Number.isNaN(targetDate.getTime())) {
        return targetDateKey;
    }

    return targetDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// ── Context menu source ──────────────────────────────────────────────

export function resolveNativeContextMenuSource(event, resolveObjectApiName) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const sourceNode = path.find(
        (node) =>
            node &&
            node.dataset &&
            node.dataset.id &&
            node.dataset.canContextMenu === 'true'
    );

    if (!sourceNode) {
        return null;
    }

    return {
        recordId: sourceNode.dataset.id,
        recordName: sourceNode.dataset.name || '',
        recordObjectApiName:
            sourceNode.dataset.recordObjectApiName ||
            resolveObjectApiName(sourceNode.dataset.recordContextId || null),
        recordContextId: sourceNode.dataset.recordContextId || null,
        canDelete: sourceNode.dataset.canDelete === 'true',
        canContextMenu: sourceNode.dataset.canContextMenu === 'true'
    };
}

export function buildContextMenuSourceFromDetail(detail, resolveObjectApiName) {
    const recordId = detail?.recordId || null;
    if (!recordId) {
        return null;
    }

    return {
        recordId,
        recordName: detail?.recordName || '',
        recordObjectApiName:
            detail?.recordObjectApiName || resolveObjectApiName(detail?.recordContextId),
        recordContextId: detail?.recordContextId || null,
        canDelete: detail?.canDelete === true,
        canContextMenu: detail?.canContextMenu !== false
    };
}

// ── Context menu items ───────────────────────────────────────────────

export function resolveContextLinksForRecord(source, eventRecord) {
    const links = Array.isArray(eventRecord?.contextLinks) ? [...eventRecord.contextLinks] : [];

    if (!links.length && source?.recordObjectApiName === 'Marine__Boat__c') {
        links.push(createContextLink('unit', 'Unit', source.recordId, 'Marine__Boat__c', source.recordName));
    }

    return dedupeContextLinks(links);
}

export function buildEventContextMenuItems(source, eventRecord) {
    const items = [];
    const contextLinks = resolveContextLinksForRecord(source, eventRecord);

    contextLinks.forEach((link) => {
        items.push({
            key: `open-${link.key}`,
            actionType: 'open-record',
            label: link.label,
            description: link.recordName || '',
            recordId: link.recordId,
            objectApiName: link.objectApiName,
            className: 'event-context-menu__item'
        });
    });

    if (eventRecord) {
        items.push({
            key: 'export-record-csv',
            actionType: 'export-csv',
            label: 'Export CSV',
            description: 'Download this record as CSV',
            recordId: source.recordId,
            objectApiName: source.recordObjectApiName,
            className: 'event-context-menu__item'
        });

        if (eventRecord.start) {
            items.push({
                key: 'export-record-ical',
                actionType: 'export-ical',
                label: 'Export iCal',
                description: 'Download this record as iCal',
                recordId: source.recordId,
                objectApiName: source.recordObjectApiName,
                className: 'event-context-menu__item'
            });
        }
    }

    if (
        source.canDelete === true &&
        (source.recordObjectApiName === 'Task' || source.recordObjectApiName === 'Calendar_Event__c')
    ) {
        items.push({
            key: 'delete-record',
            actionType: 'delete',
            label: source.recordObjectApiName === 'Task' ? 'Delete Task' : 'Delete Event',
            description: '',
            recordId: source.recordId,
            objectApiName: source.recordObjectApiName,
            className: 'event-context-menu__item event-context-menu__item--destructive'
        });
    }

    return items;
}

// ── Hover preview ────────────────────────────────────────────────────

export function buildHoverTimeLabel(eventRecord) {
    if (!eventRecord?.start) {
        return '';
    }

    const start = new Date(eventRecord.start);
    const end = eventRecord.endDateTime ? new Date(eventRecord.endDateTime) : null;
    if (Number.isNaN(start.getTime())) {
        return '';
    }

    const dateLabel = start.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    if (eventRecord.allDay) {
        return `${dateLabel} • All Day`;
    }

    const startLabel = start.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
    });

    if (!end || Number.isNaN(end.getTime())) {
        return `${dateLabel} • ${startLabel}`;
    }

    const endLabel = end.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
    });

    return `${dateLabel} • ${startLabel} - ${endLabel}`;
}

export function buildHoveredEventPreview(source, eventRecord, clientX, clientY) {
    const title = source?.recordName || eventRecord?.name || '';
    if (!title) {
        return null;
    }

    const lines = [];
    const timeLabel = buildHoverTimeLabel(eventRecord);

    if (eventRecord?.calendarName) {
        lines.push(eventRecord.calendarName);
    }

    if (timeLabel) {
        lines.push(timeLabel);
    }

    if (eventRecord?.status && eventRecord.status !== 'Calendar View') {
        lines.push(`Status: ${eventRecord.status}`);
    }

    (Array.isArray(eventRecord?.hoverDetails) ? eventRecord.hoverDetails : []).forEach((line) => {
        if (line && !lines.includes(line)) {
            lines.push(line);
        }
    });

    return {
        title,
        lines: lines.map((text, idx) => ({ key: `line-${idx}`, text })),
        style: buildHoverPreviewStyle(clientX, clientY)
    };
}

// ── Record object API name resolution ────────────────────────────────

export function resolveRecordObjectApiName(recordContextId, calendarDefinitions) {
    if (!recordContextId) {
        return 'Calendar_Event__c';
    }

    const definition = (calendarDefinitions || []).find((row) => row.id === recordContextId);
    return getDefinitionObjectApiName(definition) || 'Calendar_Event__c';
}
