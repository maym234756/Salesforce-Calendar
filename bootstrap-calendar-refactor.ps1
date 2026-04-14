$ErrorActionPreference = "Stop"

$root = Get-Location
$lwcRoot = Join-Path $root "force-app\main\default\lwc"
$backupRoot = Join-Path $root ("calendar_refactor_backup_" + (Get-Date -Format "yyyyMMdd_HHmmss"))

$components = @(
    "teamCalendarBoard",
    "calendarToolbar",
    "calendarLegend",
    "calendarGrid",
    "calendarAgenda",
    "calendarCreateModal"
)

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Write-File {
    param(
        [string]$Path,
        [string]$Content
    )
    $dir = Split-Path $Path -Parent
    Ensure-Dir $dir
    Set-Content -Path $Path -Value $Content -Encoding UTF8
}

Ensure-Dir $lwcRoot
Ensure-Dir $backupRoot

# Backup existing parent component if present
$parentPath = Join-Path $lwcRoot "teamCalendarBoard"
if (Test-Path $parentPath) {
    Copy-Item $parentPath (Join-Path $backupRoot "teamCalendarBoard") -Recurse -Force
}

foreach ($component in $components) {
    Ensure-Dir (Join-Path $lwcRoot $component)
}

# -----------------------------
# teamCalendarBoard
# -----------------------------
Write-File (Join-Path $lwcRoot "teamCalendarBoard\teamCalendarBoard.html") @'
<template>
    <lightning-card title="Team Calendar Board" icon-name="standard:event">
        <div class="board-wrap">
            <c-calendar-toolbar
                range-label={rangeLabel}
                event-count={eventCount}
                current-view={currentView}
                view-options={viewOptions}
                selected-calendar-id={selectedCalendarId}
                calendar-options={calendarOptions}
                selected-status={selectedStatus}
                status-options={statusOptions}
                onviewchange={handleViewChange}
                oncalendarchange={handleCalendarChange}
                onstatuschange={handleStatusChange}
                ontoday={handleToday}
                onrefresh={handleRefresh}
                onprev={handlePrev}
                onnext={handleNext}
                onnew={handleHeaderNewEvent}
            >
            </c-calendar-toolbar>

            <c-calendar-legend items={legendItems}></c-calendar-legend>

            <template if:true={error}>
                <div class="error-box">{error}</div>
            </template>

            <template if:true={isLoading}>
                <div class="loading-box">Loading calendar...</div>
            </template>

            <template if:false={isLoading}>
                <template if:true={isGridView}>
                    <c-calendar-grid
                        weeks={weeks}
                        one-row={isWeekView}
                        ondayselect={handleDaySelect}
                        oneventopen={handleEventOpen}
                    >
                    </c-calendar-grid>
                </template>

                <template if:true={isAgendaView}>
                    <c-calendar-agenda
                        groups={agendaGroups}
                        ondayselect={handleDaySelect}
                        oneventopen={handleEventOpen}
                    >
                    </c-calendar-agenda>
                </template>
            </template>
        </div>
    </lightning-card>

    <template if:true={showCreateModal}>
        <c-calendar-create-modal
            default-calendar-id={defaultCalendarId}
            default-start={defaultStart}
            default-end={defaultEnd}
            onclose={handleCloseModal}
            onsuccess={handleCreateSuccess}
            onerror={handleCreateError}
        >
        </c-calendar-create-modal>
    </template>
</template>
'@

Write-File (Join-Path $lwcRoot "teamCalendarBoard\teamCalendarBoard.js") @'
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
'@

Write-File (Join-Path $lwcRoot "teamCalendarBoard\teamCalendarBoard.css") @'
.board-wrap {
    padding: 0.75rem;
}

.loading-box,
.error-box {
    padding: 1rem;
    border-radius: 0.25rem;
    margin-bottom: 0.75rem;
}

.error-box {
    background: #fde7e9;
    color: #8e030f;
}
'@

Write-File (Join-Path $lwcRoot "teamCalendarBoard\teamCalendarBoard.js-meta.xml") @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>true</isExposed>
    <masterLabel>Team Calendar Board</masterLabel>
    <description>Custom calendar board tab for Team Marine Sales.</description>
    <targets>
        <target>lightning__Tab</target>
        <target>lightning__AppPage</target>
    </targets>
</LightningComponentBundle>
'@

# -----------------------------
# calendarToolbar
# -----------------------------
Write-File (Join-Path $lwcRoot "calendarToolbar\calendarToolbar.html") @'
<template>
    <div class="header-row">
        <div>
            <h2 class="month-title">{rangeLabel}</h2>
            <div class="event-count">{eventCount} event(s)</div>
        </div>

        <div class="header-actions">
            <lightning-radio-group
                type="button"
                name="viewMode"
                label="View"
                options={viewOptions}
                value={currentView}
                onchange={handleViewChange}
            >
            </lightning-radio-group>

            <lightning-combobox
                class="calendar-filter"
                name="calendarFilter"
                label="Calendar"
                value={selectedCalendarId}
                options={calendarOptions}
                onchange={handleCalendarChange}
            >
            </lightning-combobox>

            <lightning-combobox
                class="status-filter"
                name="statusFilter"
                label="Status"
                value={selectedStatus}
                options={statusOptions}
                onchange={handleStatusChange}
            >
            </lightning-combobox>

            <lightning-button label="New Event" variant="brand" onclick={emitNew}></lightning-button>
            <lightning-button label="Today" onclick={emitToday}></lightning-button>
            <lightning-button-icon icon-name="utility:refresh" alternative-text="Refresh" onclick={emitRefresh}></lightning-button-icon>
            <lightning-button-icon icon-name="utility:chevronleft" alternative-text="Previous" onclick={emitPrev}></lightning-button-icon>
            <lightning-button-icon icon-name="utility:chevronright" alternative-text="Next" onclick={emitNext}></lightning-button-icon>
        </div>
    </div>
</template>
'@

Write-File (Join-Path $lwcRoot "calendarToolbar\calendarToolbar.js") @'
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
'@

Write-File (Join-Path $lwcRoot "calendarToolbar\calendarToolbar.css") @'
.header-row {
    margin-bottom: 0.75rem;
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.header-actions {
    display: flex;
    align-items: end;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.calendar-filter,
.status-filter {
    min-width: 14rem;
}

.month-title {
    font-size: 1.1rem;
    font-weight: 700;
}

.event-count {
    font-size: 0.85rem;
    color: #5f6368;
    margin-top: 0.2rem;
}
'@

Write-File (Join-Path $lwcRoot "calendarToolbar\calendarToolbar.js-meta.xml") @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarLegend
# -----------------------------
Write-File (Join-Path $lwcRoot "calendarLegend\calendarLegend.html") @'
<template>
    <template if:true={hasItems}>
        <div class="legend">
            <template for:each={items} for:item="item">
                <div key={item.id} class="legend-item">
                    <span class="legend-swatch" style={item.styleText}></span>
                    <span>{item.name}</span>
                </div>
            </template>
        </div>
    </template>
</template>
'@

Write-File (Join-Path $lwcRoot "calendarLegend\calendarLegend.js") @'
import { LightningElement, api } from 'lwc';

export default class CalendarLegend extends LightningElement {
    @api items = [];

    get hasItems() {
        return Array.isArray(this.items) && this.items.length > 0;
    }
}
'@

Write-File (Join-Path $lwcRoot "calendarLegend\calendarLegend.css") @'
.legend {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
}

.legend-swatch {
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 0.2rem;
}
'@

Write-File (Join-Path $lwcRoot "calendarLegend\calendarLegend.js-meta.xml") @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarGrid
# -----------------------------
Write-File (Join-Path $lwcRoot "calendarGrid\calendarGrid.html") @'
<template>
    <div class="weekdays">
        <div class="weekday">Sun</div>
        <div class="weekday">Mon</div>
        <div class="weekday">Tue</div>
        <div class="weekday">Wed</div>
        <div class="weekday">Thu</div>
        <div class="weekday">Fri</div>
        <div class="weekday">Sat</div>
    </div>

    <div class="calendar-grid" style={gridStyle}>
        <template for:each={weeks} for:item="week">
            <template for:each={week.days} for:item="day">
                <div
                    key={day.key}
                    class={day.className}
                    data-date={day.key}
                    data-current-month={day.currentMonthAttr}
                    onclick={handleDayClick}
                >
                    <div class="day-header">
                        <span>{day.label}</span>

                        <template if:true={day.isCurrentMonth}>
                            <button
                                type="button"
                                class="day-add-btn"
                                data-date={day.key}
                                onclick={handleDayAdd}
                                title="Add event"
                            >
                                +
                            </button>
                        </template>
                    </div>

                    <div class="events">
                        <template for:each={day.events} for:item="event">
                            <button
                                key={event.id}
                                type="button"
                                class={event.className}
                                style={event.styleText}
                                title={event.hoverText}
                                data-id={event.id}
                                onclick={handleEventOpen}
                            >
                                <div class="event-time">{event.timeLabel}</div>
                                <div class="event-title">{event.name}</div>
                                <div class="event-subtitle">{event.calendarName}</div>
                            </button>
                        </template>

                        <template if:true={day.showNoEvents}>
                            <div class="empty-day">No events</div>
                        </template>
                    </div>
                </div>
            </template>
        </template>
    </div>
</template>
'@

Write-File (Join-Path $lwcRoot "calendarGrid\calendarGrid.js") @'
import { LightningElement, api } from 'lwc';

export default class CalendarGrid extends LightningElement {
    @api weeks = [];
    @api oneRow = false;

    get gridStyle() {
        return this.oneRow
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
'@

Write-File (Join-Path $lwcRoot "calendarGrid\calendarGrid.css") @'
.weekdays,
.calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
}

.weekday {
    padding: 0.5rem;
    font-weight: 700;
    border: 1px solid #d8dde6;
    background: #f3f3f3;
    text-align: center;
}

.day-cell {
    min-height: 130px;
    border: 1px solid #d8dde6;
    padding: 0.35rem;
    background: #ffffff;
}

.day-cell--interactive {
    cursor: pointer;
}

.day-cell--muted {
    background: #f8f8f8;
    color: #999999;
}

.day-cell--today {
    box-shadow: inset 0 0 0 2px #0176d3;
}

.day-header {
    font-weight: 700;
    margin-bottom: 0.35rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.day-add-btn {
    border: 0;
    background: transparent;
    color: #0176d3;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    line-height: 1;
    padding: 0 0.25rem;
    border-radius: 0.2rem;
}

.day-add-btn:hover {
    background: #eef4ff;
}

.events {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

.event-pill {
    border-radius: 0.25rem;
    padding: 0.3rem 0.4rem;
    font-size: 0.75rem;
    line-height: 1.2;
    overflow: hidden;
    text-align: left;
    border: 0;
    cursor: pointer;
    width: 100%;
}

.event-pill:hover {
    filter: brightness(0.97);
}

.event-pill--planned {
    background: #fdf3d1;
}

.event-pill--confirmed {
    background: #d8f5d8;
}

.event-pill--cancelled {
    background: #fde7e9;
}

.event-time {
    font-weight: 700;
}

.event-title,
.event-subtitle {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.event-subtitle {
    opacity: 0.75;
    font-size: 0.68rem;
}

.empty-day {
    font-size: 0.7rem;
    color: #999999;
}
'@

Write-File (Join-Path $lwcRoot "calendarGrid\calendarGrid.js-meta.xml") @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarAgenda
# -----------------------------
Write-File (Join-Path $lwcRoot "calendarAgenda\calendarAgenda.html") @'
<template>
    <template if:true={hasGroups}>
        <div class="agenda-list">
            <template for:each={groups} for:item="group">
                <section key={group.key} class="agenda-group">
                    <div class="agenda-group-header">
                        <div class="agenda-date">{group.label}</div>
                        <button
                            type="button"
                            class="agenda-add-btn"
                            data-date={group.key}
                            onclick={handleDayAdd}
                        >
                            + Add Event
                        </button>
                    </div>

                    <div class="agenda-items">
                        <template for:each={group.events} for:item="event">
                            <button
                                key={event.id}
                                type="button"
                                class="agenda-row"
                                data-id={event.id}
                                onclick={handleEventOpen}
                            >
                                <span class="agenda-color" style={event.colorBarStyle}></span>
                                <div class="agenda-time">{event.timeLabel}</div>
                                <div class="agenda-main">
                                    <div class="agenda-title">{event.name}</div>
                                    <div class="agenda-meta">{event.calendarName} • {event.statusLabel}</div>
                                </div>
                            </button>
                        </template>
                    </div>
                </section>
            </template>
        </div>
    </template>

    <template if:false={hasGroups}>
        <div class="agenda-empty">No events found for this range.</div>
    </template>
</template>
'@

Write-File (Join-Path $lwcRoot "calendarAgenda\calendarAgenda.js") @'
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
'@

Write-File (Join-Path $lwcRoot "calendarAgenda\calendarAgenda.css") @'
.agenda-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.agenda-group {
    border: 1px solid #d8dde6;
    border-radius: 0.35rem;
    overflow: hidden;
    background: #ffffff;
}

.agenda-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #f3f3f3;
    border-bottom: 1px solid #d8dde6;
}

.agenda-date {
    font-weight: 700;
}

.agenda-add-btn {
    border: 0;
    background: transparent;
    color: #0176d3;
    cursor: pointer;
    font-weight: 700;
    border-radius: 0.2rem;
    padding: 0.2rem 0.4rem;
}

.agenda-add-btn:hover {
    background: #eef4ff;
}

.agenda-items {
    display: flex;
    flex-direction: column;
}

.agenda-row {
    display: grid;
    grid-template-columns: 8px 110px 1fr;
    gap: 0.75rem;
    align-items: start;
    padding: 0.75rem 1rem;
    border: 0;
    border-top: 1px solid #eef1f6;
    background: #ffffff;
    text-align: left;
    cursor: pointer;
    width: 100%;
}

.agenda-row:first-child {
    border-top: 0;
}

.agenda-row:hover {
    filter: brightness(0.97);
}

.agenda-color {
    display: block;
    width: 8px;
    height: 100%;
    border-radius: 999px;
    min-height: 38px;
}

.agenda-time {
    font-weight: 700;
    color: #2e2e2e;
}

.agenda-title {
    font-weight: 700;
    margin-bottom: 0.15rem;
}

.agenda-meta {
    font-size: 0.8rem;
    color: #5f6368;
}

.agenda-empty {
    padding: 1rem;
    border: 1px solid #d8dde6;
    border-radius: 0.35rem;
    color: #5f6368;
    background: #ffffff;
}
'@

Write-File (Join-Path $lwcRoot "calendarAgenda\calendarAgenda.js-meta.xml") @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarCreateModal
# -----------------------------
Write-File (Join-Path $lwcRoot "calendarCreateModal\calendarCreateModal.html") @'
<template>
    <section role="dialog" tabindex="-1" aria-modal="true" class="slds-modal slds-fade-in-open">
        <div class="slds-modal__container">
            <header class="slds-modal__header">
                <h2 class="slds-text-heading_medium">New Calendar Event</h2>
            </header>

            <div class="slds-modal__content slds-p-around_medium">
                <lightning-record-edit-form
                    object-api-name="Calendar_Event__c"
                    onsuccess={handleSuccess}
                    onerror={handleError}
                >
                    <div class="slds-grid slds-wrap slds-gutters">
                        <div class="slds-col slds-size_1-of-1">
                            <lightning-input-field field-name="Name"></lightning-input-field>
                        </div>

                        <div class="slds-col slds-size_1-of-2">
                            <lightning-input-field field-name="Calendar__c" value={defaultCalendarId}></lightning-input-field>
                        </div>

                        <div class="slds-col slds-size_1-of-2">
                            <lightning-input-field field-name="Status__c"></lightning-input-field>
                        </div>

                        <div class="slds-col slds-size_1-of-2">
                            <lightning-input-field field-name="Start__c" value={defaultStart}></lightning-input-field>
                        </div>

                        <div class="slds-col slds-size_1-of-2">
                            <lightning-input-field field-name="End__c" value={defaultEnd}></lightning-input-field>
                        </div>

                        <div class="slds-col slds-size_1-of-2">
                            <lightning-input-field field-name="All_Day__c"></lightning-input-field>
                        </div>

                        <div class="slds-col slds-size_1-of-1">
                            <lightning-input-field field-name="Notes__c"></lightning-input-field>
                        </div>
                    </div>

                    <div class="slds-m-top_medium slds-grid slds-grid_align-end slds-gutters_small">
                        <lightning-button label="Cancel" onclick={handleClose}></lightning-button>
                        <lightning-button variant="brand" type="submit" label="Save"></lightning-button>
                    </div>
                </lightning-record-edit-form>
            </div>
        </div>
    </section>

    <div class="slds-backdrop slds-backdrop_open"></div>
</template>
'@

Write-File (Join-Path $lwcRoot "calendarCreateModal\calendarCreateModal.js") @'
import { LightningElement, api } from 'lwc';

export default class CalendarCreateModal extends LightningElement {
    @api defaultCalendarId;
    @api defaultStart;
    @api defaultEnd;

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleSuccess(event) {
        this.dispatchEvent(new CustomEvent('success', { detail: event.detail }));
    }

    handleError(event) {
        this.dispatchEvent(new CustomEvent('error', { detail: event.detail }));
    }
}
'@

Write-File (Join-Path $lwcRoot "calendarCreateModal\calendarCreateModal.css") @'
/* Modal mostly uses SLDS defaults */
'@

Write-File (Join-Path $lwcRoot "calendarCreateModal\calendarCreateModal.js-meta.xml") @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarUtils
# -----------------------------
Write-File (Join-Path $lwcRoot "calendarUtils\calendarUtils.js") @'
export function dateKey(dateValue) {
    const y = dateValue.getFullYear();
    const m = String(dateValue.getMonth() + 1).padStart(2, '0');
    const d = String(dateValue.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function formatTime(dateValue) {
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    }).format(dateValue);
}

export function formatAgendaDate(dateValue) {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).format(new Date(dateValue + 'T12:00:00'));
}

export function buildDefaultDateTime(dateText, hour) {
    const [year, month, day] = dateText.split('-').map((value) => parseInt(value, 10));
    const dt = new Date(year, month - 1, day, hour, 0, 0, 0);
    return dt.toISOString();
}

export function getVisibleRange(currentDate, currentView) {
    if (currentView === 'week') {
        const start = new Date(currentDate);
        start.setDate(start.getDate() - start.getDay());

        const end = new Date(start);
        end.setDate(end.getDate() + 6);

        return {
            startDate: dateKey(start),
            endDate: dateKey(end)
        };
    }

    if (currentView === 'agenda') {
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        return {
            startDate: dateKey(start),
            endDate: dateKey(end)
        };
    }

    const year = currentDate.getFullYear();
    const monthIndex = currentDate.getMonth();

    const firstOfMonth = new Date(year, monthIndex, 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay());

    const end = new Date(start);
    end.setDate(end.getDate() + 41);

    return {
        startDate: dateKey(start),
        endDate: dateKey(end)
    };
}

export function buildRangeLabel(currentDate, currentView) {
    if (currentView === 'week') {
        const range = getVisibleRange(currentDate, currentView);
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

    if (currentView === 'agenda') {
        return new Intl.DateTimeFormat('en-US', {
            month: 'long',
            year: 'numeric'
        }).format(currentDate) + ' Agenda';
    }

    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
    }).format(currentDate);
}

function buildEventStyle(calendarColor) {
    if (!calendarColor) {
        return '';
    }

    return `background:${calendarColor}; color:#111111; border:1px solid rgba(0,0,0,0.15);`;
}

function buildHoverText(event) {
    const parts = [];

    if (event.name) parts.push(event.name);
    if (event.calendarName) parts.push(`Calendar: ${event.calendarName}`);
    if (event.status) parts.push(`Status: ${event.status}`);
    if (event.notes) parts.push(event.notes);

    return parts.join(' | ');
}

function eventClass(status) {
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

function dayClass(isCurrentMonth, isToday) {
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

function buildRenderedEvent(event) {
    const startDate = new Date(event.start);

    return {
        id: event.id,
        name: event.name || '(No Subject)',
        calendarName: event.calendarName || 'No Calendar',
        timeLabel: event.allDay ? 'All Day' : formatTime(startDate),
        hoverText: buildHoverText(event),
        className: eventClass(event.status),
        styleText: buildEventStyle(event.calendarColor),
        colorBarStyle: event.calendarColor
            ? `background:${event.calendarColor};`
            : 'background:#d8dde6;',
        statusLabel: event.status || 'No Status'
    };
}

export function buildAgendaGroups(events) {
    const grouped = {};

    (events || []).forEach((event) => {
        const key = dateKey(new Date(event.start));
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(buildRenderedEvent(event));
    });

    return Object.keys(grouped)
        .sort()
        .map((key) => ({
            key,
            label: formatAgendaDate(key),
            events: grouped[key]
        }));
}

export function buildCalendarWeeks(currentDate, currentView, events) {
    const monthIndex = currentDate.getMonth();
    const todayKey = dateKey(new Date());
    const range = getVisibleRange(currentDate, currentView);
    const grouped = {};

    (events || []).forEach((event) => {
        const key = dateKey(new Date(event.start));
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(buildRenderedEvent(event));
    });

    let cursor = new Date(range.startDate + 'T12:00:00');
    const weekCount = currentView === 'week' ? 1 : 6;
    const weeks = [];

    for (let weekIndex = 0; weekIndex < weekCount; weekIndex++) {
        const week = { key: `week-${weekIndex}`, days: [] };

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const key = dateKey(cursor);
            const isCurrentMonth = currentView === 'week' ? true : cursor.getMonth() === monthIndex;
            const dayEvents = grouped[key] || [];

            week.days.push({
                key,
                label: cursor.getDate(),
                isCurrentMonth,
                currentMonthAttr: isCurrentMonth ? 'true' : 'false',
                className: dayClass(isCurrentMonth, key === todayKey),
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

    return weeks;
}
'@

Write-Host ""
Write-Host "[OK] Calendar refactor scaffold created." -ForegroundColor Green
Write-Host "Backup saved to: $backupRoot" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Review the generated files."
Write-Host "2. Deploy with:"
Write-Host "   sf project deploy start --source-dir force-app/main/default/lwc --target-org calendarDev"
Write-Host ""