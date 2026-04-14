import { LightningElement, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getEventsForRange from '@salesforce/apex/TeamCalendarBoardController.getEventsForRange';
import getCalendars from '@salesforce/apex/TeamCalendarBoardController.getCalendars';

export default class TeamCalendarBoard extends NavigationMixin(LightningElement) {
    @track weeks = [];
    @track error;
    @track isLoading = false;
    @track calendarOptions = [];
    @track legendItems = [];
    @track showCreateModal = false;

    currentDate = new Date();
    currentView = 'month';
    events = [];
    selectedCalendarId = '';
    selectedStatus = '';
    defaultStart;
    defaultEnd;

    viewOptions = [
        { label: 'Month', value: 'month' },
        { label: 'Week', value: 'week' },
        { label: 'Agenda', value: 'agenda' }
    ];

    statusOptions = [
        { label: 'All Statuses', value: '' },
        { label: 'Planned', value: 'Planned' },
        { label: 'Confirmed', value: 'Confirmed' },
        { label: 'Cancelled', value: 'Cancelled' }
    ];

    connectedCallback() {
        this.initializeBoard();
    }

    async initializeBoard() {
        this.isLoading = true;
        this.error = undefined;

        try {
            await this.loadCalendars();
            await this.loadCalendar();
        } catch (e) {
            this.error = this.normalizeError(e);
        } finally {
            this.isLoading = false;
        }
    }

    get isAgendaView() {
        return this.currentView === 'agenda';
    }

    get isGridView() {
        return this.currentView !== 'agenda';
    }

    get eventCount() {
        return this.events.length;
    }

    get hasLegend() {
        return this.legendItems.length > 0;
    }

    get hasAgendaEvents() {
        return this.agendaGroups.length > 0;
    }

    get defaultCalendarId() {
        if (this.selectedCalendarId) {
            return this.selectedCalendarId;
        }

        const actualCalendars = this.calendarOptions.filter((opt) => opt.value);
        if (actualCalendars.length === 1) {
            return actualCalendars[0].value;
        }

        return null;
    }

    get gridStyle() {
        return this.currentView === 'week'
            ? 'grid-template-rows: repeat(1, minmax(130px, auto));'
            : 'grid-template-rows: repeat(6, minmax(130px, auto));';
    }

    get rangeLabel() {
        if (this.currentView === 'week') {
            const range = this.getVisibleRange();
            const start = new Date(range.startDate + 'T12:00:00');
            const end = new Date(range.endDate + 'T12:00:00');

            const startText = new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric'
            }).format(start);

            const endText = new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }).format(end);

            return `${startText} - ${endText}`;
        }

        if (this.currentView === 'agenda') {
            return new Intl.DateTimeFormat('en-US', {
                month: 'long',
                year: 'numeric'
            }).format(this.currentDate) + ' Agenda';
        }

        return new Intl.DateTimeFormat('en-US', {
            month: 'long',
            year: 'numeric'
        }).format(this.currentDate);
    }

    get agendaGroups() {
        const grouped = {};
        this.events.forEach((event) => {
            const key = this.dateKey(new Date(event.start));
            if (!grouped[key]) {
                grouped[key] = [];
            }

            grouped[key].push({
                id: event.id,
                name: event.name || '(No Subject)',
                calendarName: event.calendarName || 'No Calendar',
                timeLabel: event.allDay ? 'All Day' : this.formatTime(new Date(event.start)),
                statusLabel: event.status || 'No Status',
                colorBarStyle: event.calendarColor
                    ? `background:${event.calendarColor};`
                    : 'background:#d8dde6;'
            });
        });

        return Object.keys(grouped)
            .sort()
            .map((key) => ({
                key,
                label: this.formatAgendaDate(key),
                events: grouped[key]
            }));
    }

    async loadCalendars() {
        const data = await getCalendars();
        const rows = Array.isArray(data) ? data : [];

        this.calendarOptions = [
            { label: 'All Calendars', value: '' },
            ...rows.map((row) => ({
                label: row.name,
                value: row.id
            }))
        ];

        this.legendItems = rows.map((row) => ({
            id: row.id,
            name: row.name,
            styleText: row.color
                ? `background:${row.color}; border:1px solid rgba(0,0,0,0.15);`
                : 'background:#d8dde6; border:1px solid rgba(0,0,0,0.15);'
        }));
    }

    async loadCalendar() {
        this.isLoading = true;
        this.error = undefined;

        try {
            const range = this.getVisibleRange();

            const data = await getEventsForRange({
                startDate: range.startDate,
                endDate: range.endDate,
                calendarId: this.selectedCalendarId || null,
                statusFilter: this.selectedStatus || null
            });

            this.events = Array.isArray(data) ? data : [];
            this.buildCalendar();
        } catch (e) {
            this.error = this.normalizeError(e);
            this.weeks = [];
        } finally {
            this.isLoading = false;
        }
    }

    getVisibleRange() {
        if (this.currentView === 'week') {
            const start = new Date(this.currentDate);
            start.setDate(start.getDate() - start.getDay());

            const end = new Date(start);
            end.setDate(end.getDate() + 6);

            return {
                startDate: this.dateKey(start),
                endDate: this.dateKey(end)
            };
        }

        if (this.currentView === 'agenda') {
            const start = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
            const end = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);

            return {
                startDate: this.dateKey(start),
                endDate: this.dateKey(end)
            };
        }

        const year = this.currentDate.getFullYear();
        const monthIndex = this.currentDate.getMonth();

        const firstOfMonth = new Date(year, monthIndex, 1);
        const start = new Date(firstOfMonth);
        start.setDate(start.getDate() - start.getDay());

        const end = new Date(start);
        end.setDate(end.getDate() + 41);

        return {
            startDate: this.dateKey(start),
            endDate: this.dateKey(end)
        };
    }

    handleViewChange(event) {
        this.currentView = event.detail.value;
        this.loadCalendar();
    }

    handleCalendarChange(event) {
        this.selectedCalendarId = event.detail.value;
        this.loadCalendar();
    }

    handleStatusChange(event) {
        this.selectedStatus = event.detail.value;
        this.loadCalendar();
    }

    handlePrev() {
        if (this.currentView === 'week') {
            this.currentDate = new Date(
                this.currentDate.getFullYear(),
                this.currentDate.getMonth(),
                this.currentDate.getDate() - 7
            );
        } else {
            this.currentDate = new Date(
                this.currentDate.getFullYear(),
                this.currentDate.getMonth() - 1,
                1
            );
        }
        this.loadCalendar();
    }

    handleNext() {
        if (this.currentView === 'week') {
            this.currentDate = new Date(
                this.currentDate.getFullYear(),
                this.currentDate.getMonth(),
                this.currentDate.getDate() + 7
            );
        } else {
            this.currentDate = new Date(
                this.currentDate.getFullYear(),
                this.currentDate.getMonth() + 1,
                1
            );
        }
        this.loadCalendar();
    }

    handleToday() {
        const now = new Date();
        this.currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        this.loadCalendar();
    }

    handleRefresh() {
        this.loadCalendar();
    }

    handleHeaderNewEvent() {
        this.openCreateModal(this.dateKey(new Date()));
    }

    handleDayClick(event) {
        const isCurrentMonth = event.currentTarget.dataset.currentMonth === 'true';
        if (!isCurrentMonth && this.currentView === 'month') {
            return;
        }

        const dateKey = event.currentTarget.dataset.date;
        this.openCreateModal(dateKey);
    }

    handleDayQuickAdd(event) {
        event.stopPropagation();
        const dateKey = event.currentTarget.dataset.date;
        this.openCreateModal(dateKey);
    }

    openCreateModal(dateKey) {
        if (!dateKey) {
            return;
        }

        this.defaultStart = this.buildDefaultDateTime(dateKey, 9);
        this.defaultEnd = this.buildDefaultDateTime(dateKey, 10);
        this.showCreateModal = true;
    }

    handleCloseModal() {
        this.showCreateModal = false;
        this.defaultStart = undefined;
        this.defaultEnd = undefined;
    }

    handleCreateSuccess() {
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Success',
                message: 'Calendar event created.',
                variant: 'success'
            })
        );

        this.handleCloseModal();
        this.loadCalendar();
    }

    handleCreateError(event) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message: event.detail?.detail || 'Unable to save event.',
                variant: 'error'
            })
        );
    }

    handleOpenEvent(event) {
        event.stopPropagation();

        const recordId = event.currentTarget.dataset.id;
        if (!recordId) {
            return;
        }

        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId,
                objectApiName: 'Calendar_Event__c',
                actionName: 'view'
            }
        });
    }

    buildCalendar() {
        if (this.currentView === 'agenda') {
            this.weeks = [];
            return;
        }

        const monthIndex = this.currentDate.getMonth();
        const todayKey = this.dateKey(new Date());
        const eventsByDay = this.groupEventsByDay();
        const range = this.getVisibleRange();

        let cursor = new Date(range.startDate + 'T12:00:00');
        const weekCount = this.currentView === 'week' ? 1 : 6;

        const weeks = [];
        for (let weekIndex = 0; weekIndex < weekCount; weekIndex++) {
            const week = { key: `week-${weekIndex}`, days: [] };

            for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
                const key = this.dateKey(cursor);
                const isCurrentMonth =
                    this.currentView === 'week' ? true : cursor.getMonth() === monthIndex;

                const dayEvents = eventsByDay[key] || [];

                week.days.push({
                    key,
                    label: cursor.getDate(),
                    isCurrentMonth,
                    currentMonthAttr: isCurrentMonth ? 'true' : 'false',
                    className: this.dayClass(isCurrentMonth, key === todayKey),
                    events: dayEvents,
                    showNoEvents: isCurrentMonth && dayEvents.length === 0
                });

                cursor = new Date(
                    cursor.getFullYear(),
                    cursor.getMonth(),
                    cursor.getDate() + 1
                );
            }

            weeks.push(week);
        }

        this.weeks = weeks;
    }

    groupEventsByDay() {
        const grouped = {};

        this.events.forEach((event) => {
            const startDate = new Date(event.start);
            const key = this.dateKey(startDate);

            if (!grouped[key]) {
                grouped[key] = [];
            }

            grouped[key].push(this.buildRenderedEvent(event, startDate));
        });

        return grouped;
    }

    buildRenderedEvent(event, startDate) {
        return {
            id: event.id,
            name: event.name || '(No Subject)',
            calendarName: event.calendarName || 'No Calendar',
            timeLabel: event.allDay ? 'All Day' : this.formatTime(startDate),
            hoverText: this.buildHoverText(event),
            className: this.eventClass(event.status),
            styleText: this.buildEventStyle(event.calendarColor)
        };
    }

    buildEventStyle(calendarColor) {
        if (!calendarColor) {
            return '';
        }

        return `background:${calendarColor}; color:#111111; border:1px solid rgba(0,0,0,0.15);`;
    }

    buildHoverText(event) {
        const parts = [];

        if (event.name) {
            parts.push(event.name);
        }
        if (event.calendarName) {
            parts.push(`Calendar: ${event.calendarName}`);
        }
        if (event.status) {
            parts.push(`Status: ${event.status}`);
        }
        if (event.notes) {
            parts.push(event.notes);
        }

        return parts.join(' | ');
    }

    buildDefaultDateTime(dateKey, hour) {
        const [year, month, day] = dateKey.split('-').map((value) => parseInt(value, 10));
        const dt = new Date(year, month - 1, day, hour, 0, 0, 0);
        return dt.toISOString();
    }

    formatTime(dateValue) {
        return new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        }).format(dateValue);
    }

    formatAgendaDate(dateKey) {
        return new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }).format(new Date(dateKey + 'T12:00:00'));
    }

    dateKey(dateValue) {
        const y = dateValue.getFullYear();
        const m = String(dateValue.getMonth() + 1).padStart(2, '0');
        const d = String(dateValue.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    dayClass(isCurrentMonth, isToday) {
        let className = 'day-cell';

        if (!isCurrentMonth) {
            className += ' day-cell--muted';
        } else {
            className += ' day-cell--interactive';
        }

        if (isToday) {
            className += ' day-cell--today';
        }

        return className;
    }

    eventClass(status) {
        let className = 'event-pill';

        if (status === 'Confirmed') {
            className += ' event-pill--confirmed';
        } else if (status === 'Cancelled') {
            className += ' event-pill--cancelled';
        } else {
            className += ' event-pill--planned';
        }

        return className;
    }

    normalizeError(error) {
        if (error?.body?.message) {
            return error.body.message;
        }
        if (error?.message) {
            return error.message;
        }
        return 'Unknown error loading calendar.';
    }
}