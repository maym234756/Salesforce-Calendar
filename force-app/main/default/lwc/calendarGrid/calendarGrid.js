import { LightningElement, api } from 'lwc';

export default class CalendarGrid extends LightningElement {
    @api weeks = [];
    @api singleRow = false;

    @api showWeekends = false;
    @api autoExpandDayHeight = false;
    @api wrapEventTitles = false;
    @api compactEventDensity = false;

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
                    recordId: event.currentTarget.dataset.id
                }
            })
        );
    }
}