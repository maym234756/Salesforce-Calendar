import { LightningElement, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getEventsForRange from '@salesforce/apex/TeamCalendarBoardController.getEventsForRange';
import getCalendars from '@salesforce/apex/TeamCalendarBoardController.getCalendars';
import {
    buildAgendaGroups,
    buildCalendarWeeks,
    buildDefaultDateTime,
    buildRangeLabel,
    dateKey,
    getVisibleRange
} from 'c/calendarUtils';

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

    get isWeekView() {
        return this.currentView === 'week';
    }

    get eventCount() {
        return this.events.length;
    }

    get defaultCalendarId() {
        if (this.selectedCalendarId) {
            return this.selectedCalendarId;
        }

        const actualCalendars = this.calendarOptions.filter((opt) => opt.value);
        return actualCalendars.length === 1 ? actualCalendars[0].value : null;
    }

    get rangeLabel() {
        return buildRangeLabel(this.currentDate, this.currentView);
    }

    get agendaGroups() {
        return buildAgendaGroups(this.events);
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
            const range = getVisibleRange(this.currentDate, this.currentView);

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

    buildCalendar() {
        if (this.isAgendaView) {
            this.weeks = [];
            return;
        }

        this.weeks = buildCalendarWeeks(this.currentDate, this.currentView, this.events);
    }

    handleViewChange(event) {
        this.currentView = event.detail;
        this.loadCalendar();
    }

    handleCalendarChange(event) {
        this.selectedCalendarId = event.detail;
        this.loadCalendar();
    }

    handleStatusChange(event) {
        this.selectedStatus = event.detail;
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
        this.openCreateModal(dateKey(new Date()));
    }

    handleDaySelect(event) {
        const { dateKey: selectedDateKey, isCurrentMonth } = event.detail;

        if (!selectedDateKey) {
            return;
        }

        if (this.currentView === 'month' && !isCurrentMonth) {
            return;
        }

        this.openCreateModal(selectedDateKey);
    }

    handleEventOpen(event) {
        const recordId = event.detail?.recordId;
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

    openCreateModal(selectedDateKey) {
        this.defaultStart = buildDefaultDateTime(selectedDateKey, 9);
        this.defaultEnd = buildDefaultDateTime(selectedDateKey, 10);
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
