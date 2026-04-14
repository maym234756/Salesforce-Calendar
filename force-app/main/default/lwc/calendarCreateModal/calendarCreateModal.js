import { LightningElement, api } from 'lwc';
import { buildDefaultDateTime } from 'c/calendarUtils';

const DEFAULT_START_HOUR = 9;
const DEFAULT_DURATION_MINUTES = 60;

export default class CalendarCreateModal extends LightningElement {
    @api defaultCalendarId;
    @api defaultStart;
    @api defaultEnd;

    formInitialized = false;
    startValue;
    endValue;
    allDayValue = false;
    selectedDurationMinutes = DEFAULT_DURATION_MINUTES;

    get presetButtons() {
        return [30, 60, 90, 120].map((minutes) => ({
            key: `${minutes}`,
            minutes,
            label: `${minutes}m`,
            className:
                minutes === this.selectedDurationMinutes
                    ? 'preset-btn preset-btn--active'
                    : 'preset-btn'
        }));
    }

    get isTimedEvent() {
        return !this.allDayValue;
    }

    get durationSummary() {
        if (this.allDayValue) {
            return 'All-day event';
        }

        const minutes = this.selectedDurationMinutes;
        if (minutes < 60) {
            return `${minutes} minutes`;
        }

        const hours = minutes / 60;
        return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? '' : 's'}` : `${minutes} minutes`;
    }

    get timeHint() {
        if (this.allDayValue) {
            return 'All-day keeps the same calendar date and syncs to Google as a full-day event.';
        }

        return 'Quick duration buttons update the end time from the selected start.';
    }

    get resolvedDefaultStart() {
        if (!this.defaultStart) {
            return null;
        }

        return this.resolveDateValue(this.defaultStart, DEFAULT_START_HOUR);
    }

    get resolvedDefaultEnd() {
        if (this.defaultEnd) {
            return this.resolveDateValue(this.defaultEnd, DEFAULT_START_HOUR + 1);
        }

        if (!this.defaultStart) {
            return null;
        }

        const startValue = this.resolveDateValue(this.defaultStart, DEFAULT_START_HOUR);
        if (!startValue) {
            return null;
        }

        const startDate = new Date(startValue);
        startDate.setMinutes(startDate.getMinutes() + DEFAULT_DURATION_MINUTES);
        return startDate.toISOString();
    }

    handleFormLoad() {
        if (this.formInitialized) {
            return;
        }

        this.formInitialized = true;
        this.startValue = this.resolvedDefaultStart;
        this.endValue = this.resolvedDefaultEnd;

        this.applyFormDefaults();
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleSuccess(event) {
        this.dispatchEvent(
            new CustomEvent('success', {
                detail: event.detail
            })
        );
    }

    handleError(event) {
        this.dispatchEvent(
            new CustomEvent('error', {
                detail: event.detail
            })
        );
    }

    handleStartChange(event) {
        this.startValue = event.detail?.value || event.target?.value || null;

        if (!this.startValue) {
            return;
        }

        if (this.allDayValue) {
            this.endValue = this.buildAllDayEndValue(this.startValue);
        } else {
            const currentEnd = this.endValue ? new Date(this.endValue) : null;
            const currentStart = new Date(this.startValue);

            if (!currentEnd || Number.isNaN(currentEnd.getTime()) || currentEnd <= currentStart) {
                this.endValue = this.buildTimedEndValue(this.startValue, this.selectedDurationMinutes);
            }
        }

        this.pushFieldValue('End__c', this.endValue);
    }

    handleEndChange(event) {
        this.endValue = event.detail?.value || event.target?.value || null;
    }

    handleAllDayChange(event) {
        this.allDayValue = this.resolveCheckboxValue(event);

        if (!this.startValue) {
            this.startValue = this.resolvedDefaultStart;
            this.pushFieldValue('Start__c', this.startValue);
        }

        if (!this.startValue) {
            return;
        }

        if (this.allDayValue) {
            const allDayStart = this.buildAllDayStartValue(this.startValue);
            const allDayEnd = this.buildAllDayEndValue(this.startValue);

            this.startValue = allDayStart;
            this.endValue = allDayEnd;
        } else {
            const timedStart = this.buildTimedStartValue(this.startValue);
            const timedEnd = this.buildTimedEndValue(timedStart, this.selectedDurationMinutes);

            this.startValue = timedStart;
            this.endValue = timedEnd;
        }

        this.pushFieldValue('Start__c', this.startValue);
        this.pushFieldValue('End__c', this.endValue);
    }

    handleDurationClick(event) {
        const minutes = parseInt(event.currentTarget.dataset.minutes, 10);
        if (Number.isNaN(minutes)) {
            return;
        }

        this.selectedDurationMinutes = minutes;

        if (this.allDayValue) {
            return;
        }

        if (!this.startValue) {
            this.startValue = this.resolvedDefaultStart;
            this.pushFieldValue('Start__c', this.startValue);
        }

        if (!this.startValue) {
            return;
        }

        this.endValue = this.buildTimedEndValue(this.startValue, minutes);
        this.pushFieldValue('End__c', this.endValue);
    }

    applyFormDefaults() {
        this.pushFieldValue('Calendar__c', this.defaultCalendarId || null);
        this.pushFieldValue('Start__c', this.startValue);
        this.pushFieldValue('End__c', this.endValue);
        this.pushFieldValue('All_Day__c', this.allDayValue);
    }

    pushFieldValue(fieldName, value) {
        const field = this.template.querySelector(`lightning-input-field[data-field="${fieldName}"]`);
        if (field) {
            field.value = value;
        }
    }

    resolveDateValue(value, fallbackHour) {
        if (!value) {
            return null;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return buildDefaultDateTime(value, fallbackHour);
        }

        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    resolveCheckboxValue(event) {
        if (typeof event.target?.checked === 'boolean') {
            return event.target.checked;
        }

        if (typeof event.detail?.checked === 'boolean') {
            return event.detail.checked;
        }

        if (typeof event.detail?.value === 'boolean') {
            return event.detail.value;
        }

        if (event.detail?.value === 'true') {
            return true;
        }

        return false;
    }

    buildTimedStartValue(value) {
        const date = this.coerceDate(value);
        if (!date) {
            return null;
        }

        if (date.getHours() === 0 && date.getMinutes() === 0) {
            date.setHours(DEFAULT_START_HOUR, 0, 0, 0);
        }

        return date.toISOString();
    }

    buildTimedEndValue(startValue, minutes) {
        const startDate = this.coerceDate(startValue);
        if (!startDate) {
            return null;
        }

        startDate.setMinutes(startDate.getMinutes() + minutes);
        return startDate.toISOString();
    }

    buildAllDayStartValue(value) {
        const date = this.coerceDate(value);
        if (!date) {
            return null;
        }

        date.setHours(0, 0, 0, 0);
        return date.toISOString();
    }

    buildAllDayEndValue(value) {
        const date = this.coerceDate(value);
        if (!date) {
            return null;
        }

        date.setHours(23, 59, 0, 0);
        return date.toISOString();
    }

    coerceDate(value) {
        if (!value) {
            return null;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [year, month, day] = value.split('-').map((item) => parseInt(item, 10));
            return new Date(year, month - 1, day, DEFAULT_START_HOUR, 0, 0, 0);
        }

        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
}