import { LightningElement, api, track } from 'lwc';

const FREQ_OPTIONS = [
    { label: 'None (does not repeat)', value: 'none' },
    { label: 'Daily', value: 'DAILY' },
    { label: 'Weekly', value: 'WEEKLY' },
    { label: 'Monthly', value: 'MONTHLY' },
    { label: 'Yearly', value: 'YEARLY' }
];

const WEEKDAY_OPTIONS = [
    { label: 'Sun', value: 'SU' },
    { label: 'Mon', value: 'MO' },
    { label: 'Tue', value: 'TU' },
    { label: 'Wed', value: 'WE' },
    { label: 'Thu', value: 'TH' },
    { label: 'Fri', value: 'FR' },
    { label: 'Sat', value: 'SA' }
];

const END_OPTIONS = [
    { label: 'Never', value: 'never' },
    { label: 'After a number of occurrences', value: 'count' },
    { label: 'On a specific date', value: 'until' }
];

const DEFAULT_WEEKLY_DAYS = new Set(['MO']);
const DEFAULT_COUNT = 10;

export default class CalendarRecurrenceEditor extends LightningElement {
    /** Current RRULE value (inbound from parent). Setting this parses and populates the form. */
    @api
    get rrule() {
        return this._rrule;
    }
    set rrule(value) {
        this._rrule = value || '';
        this._applyInboundRRule(this._rrule);
    }

    /** Reference date used for "monthly on same weekday" display label. */
    @api referenceDate;

    _rrule = '';

    // Form state
    @track freq = 'none';
    @track interval = 1;
    @track endMode = 'never';
    @track endCount = DEFAULT_COUNT;
    @track endUntil = '';
    @track weekdays = new Set(DEFAULT_WEEKLY_DAYS);

    // -------------------------------------------------------------------------
    // Getters for template
    // -------------------------------------------------------------------------

    get freqOptions() {
        return FREQ_OPTIONS;
    }

    get weekdayOptions() {
        return WEEKDAY_OPTIONS.map((opt) => ({
            ...opt,
            checked: this.weekdays.has(opt.value),
            className: this.weekdays.has(opt.value)
                ? 'day-btn day-btn--active'
                : 'day-btn'
        }));
    }

    get endOptions() {
        return END_OPTIONS;
    }

    get isNone() {
        return this.freq === 'none';
    }

    get isWeekly() {
        return this.freq === 'WEEKLY';
    }

    get showEndCount() {
        return this.endMode === 'count';
    }

    get showEndUntil() {
        return this.endMode === 'until';
    }

    get showRecurrenceBody() {
        return this.freq !== 'none';
    }

    get intervalLabel() {
        const map = {
            DAILY: this.interval === 1 ? 'day' : 'days',
            WEEKLY: this.interval === 1 ? 'week' : 'weeks',
            MONTHLY: this.interval === 1 ? 'month' : 'months',
            YEARLY: this.interval === 1 ? 'year' : 'years'
        };
        return map[this.freq] || 'period';
    }

    get previewLabel() {
        if (this.freq === 'none') {
            return 'This event does not repeat.';
        }
        return `Preview: ${this._buildRRule() || '—'}`;
    }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    handleFreqChange(event) {
        this.freq = event.detail.value;
        if (this.freq === 'WEEKLY' && this.weekdays.size === 0) {
            this.weekdays = new Set(DEFAULT_WEEKLY_DAYS);
        }
        this._emit();
    }

    handleIntervalChange(event) {
        const v = parseInt(event.target.value, 10);
        this.interval = (!Number.isNaN(v) && v >= 1) ? v : 1;
        this._emit();
    }

    handleWeekdayToggle(event) {
        const code = event.currentTarget.dataset.code;
        const next = new Set(this.weekdays);
        if (next.has(code)) {
            next.delete(code);
        } else {
            next.add(code);
        }
        if (next.size === 0) {
            return; // require at least one day
        }
        this.weekdays = next;
        this._emit();
    }

    handleEndModeChange(event) {
        this.endMode = event.detail.value;
        this._emit();
    }

    handleEndCountChange(event) {
        const v = parseInt(event.target.value, 10);
        this.endCount = (!Number.isNaN(v) && v >= 1) ? Math.min(v, 500) : DEFAULT_COUNT;
        this._emit();
    }

    handleEndUntilChange(event) {
        this.endUntil = event.target.value || '';
        this._emit();
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    _buildRRule() {
        if (this.freq === 'none') {
            return '';
        }

        const parts = [`FREQ=${this.freq}`];

        if (this.interval > 1) {
            parts.push(`INTERVAL=${this.interval}`);
        }

        if (this.freq === 'WEEKLY' && this.weekdays.size > 0) {
            const dayOrder = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
            const sorted = dayOrder.filter((d) => this.weekdays.has(d));
            parts.push(`BYDAY=${sorted.join(',')}`);
        }

        if (this.endMode === 'count' && this.endCount >= 1) {
            parts.push(`COUNT=${this.endCount}`);
        } else if (this.endMode === 'until' && this.endUntil) {
            const dateStr = this.endUntil.replace(/-/g, ''); // YYYYMMDD
            parts.push(`UNTIL=${dateStr}`);
        }

        return parts.join(';');
    }

    _emit() {
        const rrule = this._buildRRule();
        this.dispatchEvent(new CustomEvent('rrulechange', { detail: { rrule } }));
    }

    _applyInboundRRule(raw) {
        if (!raw) {
            this.freq = 'none';
            this.interval = 1;
            this.endMode = 'never';
            this.endCount = DEFAULT_COUNT;
            this.endUntil = '';
            this.weekdays = new Set(DEFAULT_WEEKLY_DAYS);
            return;
        }

        const params = {};
        for (const part of raw.split(';')) {
            const idx = part.indexOf('=');
            if (idx < 0) continue;
            const key = part.substring(0, idx).toUpperCase();
            const val = part.substring(idx + 1).toUpperCase();
            params[key] = val;
        }

        this.freq = params.FREQ || 'none';
        this.interval = params.INTERVAL ? Math.max(1, parseInt(params.INTERVAL, 10)) : 1;

        if (params.BYDAY) {
            this.weekdays = new Set(params.BYDAY.split(',').map((d) => d.trim().slice(-2)));
        } else {
            this.weekdays = new Set(DEFAULT_WEEKLY_DAYS);
        }

        if (params.COUNT) {
            this.endMode = 'count';
            this.endCount = Math.min(500, Math.max(1, parseInt(params.COUNT, 10)));
        } else if (params.UNTIL) {
            this.endMode = 'until';
            // Convert YYYYMMDD → YYYY-MM-DD for date input
            const u = params.UNTIL.replace(/T.*$/, '');
            this.endUntil = u.length >= 8
                ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`
                : '';
        } else {
            this.endMode = 'never';
            this.endCount = DEFAULT_COUNT;
            this.endUntil = '';
        }
    }
}
