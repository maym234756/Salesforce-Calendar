import { LightningElement, api } from 'lwc';

export default class CalendarAgenda extends LightningElement {
    @api groups = [];

    get hasGroups() {
        return Array.isArray(this.groups) && this.groups.length > 0;
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
                detail: { recordId: event.currentTarget.dataset.id }
            })
        );
    }
}
