import { LightningElement, api } from 'lwc';

export default class CalendarToolbar extends LightningElement {
    @api rangeLabel;
    @api eventCount;
    @api currentView;
    @api viewOptions;
    @api selectedCalendarId;
    @api calendarOptions;
    @api selectedStatus;
    @api statusOptions;

    handleViewChange(event) {
        this.dispatchEvent(new CustomEvent('viewchange', { detail: event.detail.value }));
    }

    handleCalendarChange(event) {
        this.dispatchEvent(new CustomEvent('calendarchange', { detail: event.detail.value }));
    }

    handleStatusChange(event) {
        this.dispatchEvent(new CustomEvent('statuschange', { detail: event.detail.value }));
    }

    emitToday() { this.dispatchEvent(new CustomEvent('today')); }
    emitRefresh() { this.dispatchEvent(new CustomEvent('refresh')); }
    emitPrev() { this.dispatchEvent(new CustomEvent('prev')); }
    emitNext() { this.dispatchEvent(new CustomEvent('next')); }
    emitNew() { this.dispatchEvent(new CustomEvent('new')); }
}
