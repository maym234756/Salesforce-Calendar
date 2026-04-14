import { LightningElement, api } from 'lwc';

export default class CalendarGrid extends LightningElement {
    @api weeks = [];
    @api singleRow = false;

    get gridStyle() {
        return this.singleRow
            ? 'grid-template-rows: repeat(1, minmax(130px, auto));'
            : 'grid-template-rows: repeat(6, minmax(130px, auto));';
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
                detail: { recordId: event.currentTarget.dataset.id }
            })
        );
    }
}