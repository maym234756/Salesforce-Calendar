import { LightningElement, api } from 'lwc';

export default class CalendarAgenda extends LightningElement {
    @api groups = [];
    hasNativeQuickActionListeners = false;
    hoveredRecordId = null;

    constructor() {
        super();
        this._boundHoverOver = this.handleNativeHoverOver.bind(this);
        this._boundHoverOut = this.handleNativeHoverOut.bind(this);
        this._boundMouseDown = this.handleNativeQuickActionMouseDown.bind(this);
        this._boundContextMenu = this.handleNativeQuickActionContextMenu.bind(this);
    }

    get hasGroups() {
        return Array.isArray(this.groups) && this.groups.length > 0;
    }

    renderedCallback() {
        if (this.hasNativeQuickActionListeners) {
            return;
        }

        this.template.addEventListener('mouseover', this._boundHoverOver);
        this.template.addEventListener('mouseout', this._boundHoverOut);
        this.template.addEventListener('mousedown', this._boundMouseDown);
        this.template.addEventListener('contextmenu', this._boundContextMenu);
        this.hasNativeQuickActionListeners = true;
    }

    disconnectedCallback() {
        this.template.removeEventListener('mouseover', this._boundHoverOver);
        this.template.removeEventListener('mouseout', this._boundHoverOut);
        this.template.removeEventListener('mousedown', this._boundMouseDown);
        this.template.removeEventListener('contextmenu', this._boundContextMenu);
        this.hasNativeQuickActionListeners = false;
    }

    handleDayAdd(event) {
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
        this.dispatchEvent(
            new CustomEvent('eventopen', {
                detail: {
                    recordId: event.currentTarget.dataset.id,
                    recordObjectApiName: event.currentTarget.dataset.recordObjectApiName || null,
                    recordContextId: event.currentTarget.dataset.recordContextId || null,
                    canEdit: event.currentTarget.dataset.canEdit !== 'false',
                    canDelete: event.currentTarget.dataset.canDelete === 'true',
                    occurrenceDate: event.currentTarget.dataset.occurrenceDate || null,
                    isRecurring: event.currentTarget.dataset.isRecurring === 'true'
                }
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
                    canDelete: event.currentTarget.dataset.canDelete === 'true',
                    canContextMenu: event.currentTarget.dataset.canContextMenu === 'true',
                    clientX: event.clientX,
                    clientY: event.clientY
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
        this.dispatchHoverEvent(source, event);
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

        const source = target.closest('button[data-id][data-can-context-menu="true"]');
        return source || null;
    }

    resolveRecordSource(event) {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') {
            return null;
        }

        return target.closest('button[data-id]');
    }

    dispatchHoverEvent(source, event) {
        this.dispatchEvent(
            new CustomEvent('eventhover', {
                detail: {
                    recordId: source.dataset.id,
                    recordName: source.dataset.name || '',
                    recordObjectApiName: source.dataset.recordObjectApiName || null,
                    recordContextId: source.dataset.recordContextId || null,
                    canDelete: source.dataset.canDelete === 'true',
                    canContextMenu: source.dataset.canContextMenu === 'true',
                    clientX: event.clientX,
                    clientY: event.clientY
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
                    canDelete: source.dataset.canDelete === 'true',
                    canContextMenu: source.dataset.canContextMenu === 'true'
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventPointerDown(event) {
        if (event.button !== 2 || event.currentTarget.dataset.canContextMenu !== 'true') {
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
                    canDelete: event.currentTarget.dataset.canDelete === 'true',
                    canContextMenu: event.currentTarget.dataset.canContextMenu === 'true'
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventContextMenu(event) {
        if (event.currentTarget.dataset.canContextMenu !== 'true') {
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
                    canDelete: event.currentTarget.dataset.canDelete === 'true',
                    canContextMenu: event.currentTarget.dataset.canContextMenu === 'true'
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleEventMouseDown(event) {
        if (event.button !== 2 || event.currentTarget.dataset.canContextMenu !== 'true') {
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
                    canDelete: event.currentTarget.dataset.canDelete === 'true',
                    canContextMenu: event.currentTarget.dataset.canContextMenu === 'true'
                },
                bubbles: true,
                composed: true
            })
        );
    }
}