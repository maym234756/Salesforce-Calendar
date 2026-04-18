import { LightningElement, api } from 'lwc';

export default class CalendarGrid extends LightningElement {
    @api weeks = [];
    @api singleRow = false;

    @api showWeekends = false;
    @api autoExpandDayHeight = false;
    @api wrapEventTitles = false;
    @api compactEventDensity = false;
    hasNativeQuickActionListeners = false;
    hoveredRecordId = null;
    draggedRecordId = null;

    renderedCallback() {
        if (this.hasNativeQuickActionListeners) {
            return;
        }

        this.template.addEventListener('mouseover', this.handleNativeHoverOver.bind(this), true);
        this.template.addEventListener('mouseout', this.handleNativeHoverOut.bind(this), true);
        this.template.addEventListener('mousedown', this.handleNativeQuickActionMouseDown.bind(this), true);
        this.template.addEventListener('contextmenu', this.handleNativeQuickActionContextMenu.bind(this), true);
        this.hasNativeQuickActionListeners = true;
    }

    get hasWeeks() {
        return Array.isArray(this.weeks) && this.weeks.length > 0;
    }

    get rowCount() {
        if (this.singleRow) {
            return 1;
        }
        return this.hasWeeks ? this.weeks.length : 6;
    }

    get shellClass() {
        return this.singleRow ? 'calendar-shell calendar-shell--single-row' : 'calendar-shell';
    }

    get gridClass() {
        return this.singleRow ? 'calendar-grid calendar-grid--single-row' : 'calendar-grid';
    }

    get gridStyle() {
        const rowDefinition = this.autoExpandDayHeight
            ? 'repeat(' + this.rowCount + ', minmax(0, 1fr))'
            : 'repeat(' + this.rowCount + ', minmax(0, 1fr))';

        return `grid-template-rows: ${rowDefinition};`;
    }

    handleDayClick(event) {
        this.dispatchEvent(
            new CustomEvent('dayselect', {
                detail: {
                    dateKey: event.currentTarget.dataset.date,
                    isCurrentMonth: event.currentTarget.dataset.currentMonth === 'true'
                }
            })
        );
    }

    handleDayAdd(event) {
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('dayselect', {
                detail: {
                    dateKey: event.currentTarget.dataset.date,
                    isCurrentMonth: true
                }
            })
        );
    }

    handleEventOpen(event) {
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('eventopen', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    canEdit: event.currentTarget.dataset.canEdit !== 'false',
                    canDelete: event.currentTarget.dataset.canDelete === 'true'
                }
            })
        );
    }

    handleEventDragStart(event) {
        if (event.currentTarget.dataset.canDrag !== 'true') {
            event.preventDefault();
            return;
        }

        this.draggedRecordId = event.currentTarget.dataset.id;
        event.currentTarget.classList.add('event-pill--dragging');

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', this.draggedRecordId);
        }
    }

    handleEventDragEnd(event) {
        this.draggedRecordId = null;
        event.currentTarget.classList.remove('event-pill--dragging');
        this.clearDropTargets();
    }

    handleDayDragOver(event) {
        const recordId = this.resolveDraggedRecordId(event);
        if (!recordId) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        event.currentTarget.classList.add('day-cell--drop-target');
    }

    handleDayDragLeave(event) {
        event.currentTarget.classList.remove('day-cell--drop-target');
    }

    handleDayDrop(event) {
        const recordId = this.resolveDraggedRecordId(event);
        this.clearDropTargets();

        if (!recordId) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('eventdrop', {
                detail: {
                    recordId,
                    targetDateKey: event.currentTarget.dataset.date
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventHover(event) {
        this.dispatchEvent(
            new CustomEvent('eventhover', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordName: event.currentTarget.dataset.name || '',
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    canDelete: event.currentTarget.dataset.canDelete === 'true'
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventUnhover() {
        this.dispatchEvent(
            new CustomEvent('eventunhover', {
                bubbles: true,
                composed: true
            })
        );
    }

    handleNativeQuickActionMouseDown(event) {
        if (event.button !== 2) {
            return;
        }

        const source = this.resolveQuickActionSource(event);
        if (!source) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }

        this.dispatchQuickActionEvent(source, event);
    }

    handleNativeHoverOver(event) {
        const source = this.resolveRecordSource(event);
        if (!source || source.dataset.id === this.hoveredRecordId) {
            return;
        }

        this.hoveredRecordId = source.dataset.id;
        this.dispatchHoverEvent(source);
    }

    handleNativeHoverOut(event) {
        const source = this.resolveRecordSource(event);
        if (!source || source.dataset.id !== this.hoveredRecordId) {
            return;
        }

        const relatedTarget = event.relatedTarget;
        if (relatedTarget && typeof relatedTarget.closest === 'function') {
            const nextSource = relatedTarget.closest('button[data-id]');
            if (nextSource && nextSource.dataset.id === this.hoveredRecordId) {
                return;
            }
        }

        this.hoveredRecordId = null;
        this.dispatchEvent(
            new CustomEvent('eventunhover', {
                bubbles: true,
                composed: true
            })
        );
    }

    handleNativeQuickActionContextMenu(event) {
        const source = this.resolveQuickActionSource(event);
        if (!source) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }

        this.dispatchQuickActionEvent(source, event);
    }

    resolveQuickActionSource(event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') {
            return null;
        }

        const source = target.closest('button[data-id][data-can-delete="true"]');
        return source || null;
    }

    resolveRecordSource(event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') {
            return null;
        }

        return target.closest('button[data-id]');
    }

    dispatchHoverEvent(source) {
        this.dispatchEvent(
            new CustomEvent('eventhover', {
                detail: {
                    recordId: source.dataset.id,
                    recordName: source.dataset.name || '',
                    recordObjectApiName: source.dataset.recordObjectApiName || null,
                    recordContextId: source.dataset.recordContextId || null,
                    canDelete: source.dataset.canDelete !== 'false'
                },
                bubbles: true,
                composed: true
            })
        );
    }

    dispatchQuickActionEvent(source, event) {
        this.dispatchEvent(
            new CustomEvent('eventcontextmenu', {
                detail: {
                    recordId: source.dataset.id,
                    recordName: source.dataset.name || '',
                    recordObjectApiName: source.dataset.recordObjectApiName || null,
                    recordContextId: source.dataset.recordContextId || null,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    canDelete: true
                },
                bubbles: true,
                composed: true
            })
        );
    }

    resolveDraggedRecordId(event) {
        if (this.draggedRecordId) {
            return this.draggedRecordId;
        }

        return event.dataTransfer ? event.dataTransfer.getData('text/plain') : null;
    }

    clearDropTargets() {
        this.template.querySelectorAll('.day-cell--drop-target').forEach((cell) => {
            cell.classList.remove('day-cell--drop-target');
        });
    }

    handleEventPointerDown(event) {
        if (event.button !== 2 || event.currentTarget.dataset.canDelete !== 'true') {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('eventcontextmenu', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordName: event.currentTarget.dataset.name || '',
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    canDelete: true
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventContextMenu(event) {
        if (event.currentTarget.dataset.canDelete !== 'true') {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('eventcontextmenu', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordName: event.currentTarget.dataset.name || '',
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    canDelete: true
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventMouseDown(event) {
        if (event.button !== 2 || event.currentTarget.dataset.canDelete !== 'true') {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.dispatchEvent(
            new CustomEvent('eventcontextmenu', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordName: event.currentTarget.dataset.name || '',
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    clientX: event.clientX,
                    clientY: event.clientY,
                    canDelete: true
                },
                bubbles: true,
                composed: true
            })
        );
    }
}