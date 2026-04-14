$ErrorActionPreference = "Stop"

$root = Get-Location
$lwcRoot = Join-Path $root "force-app\main\default\lwc"
$backupRoot = Join-Path $root ("calendar_scaffold_backup_" + (Get-Date -Format "yyyyMMdd_HHmmss"))

function Ensure-Dir {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Write-Utf8NoBom {
    param(
        [string]$Path,
        [string]$Content
    )
    $dir = Split-Path $Path -Parent
    Ensure-Dir $dir
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

$components = @(
    "teamCalendarBoard",
    "calendarToolbar",
    "calendarLegend",
    "calendarGrid",
    "calendarAgenda",
    "calendarCreateModal",
    "calendarEventDrawer",
    "calendarUtils"
)

Ensure-Dir $lwcRoot
Ensure-Dir $backupRoot

foreach ($component in $components) {
    $path = Join-Path $lwcRoot $component
    if (Test-Path $path) {
        Copy-Item $path (Join-Path $backupRoot $component) -Recurse -Force
    } else {
        Ensure-Dir $path
    }
}

# -----------------------------
# budgets doc
# -----------------------------
Write-Utf8NoBom -Path (Join-Path $root "component-budgets.md") -Content @'
# Calendar Component Budgets

These are target line-count ceilings, not hard limits.

| Component | Target Max Lines |
|---|---:|
| teamCalendarBoard.js | 250 |
| teamCalendarBoard.html | 120 |
| calendarToolbar.js | 120 |
| calendarToolbar.html | 100 |
| calendarLegend.js | 40 |
| calendarLegend.html | 40 |
| calendarGrid.js | 140 |
| calendarGrid.html | 140 |
| calendarAgenda.js | 120 |
| calendarAgenda.html | 120 |
| calendarCreateModal.js | 80 |
| calendarCreateModal.html | 120 |
| calendarEventDrawer.js | 100 |
| calendarEventDrawer.html | 120 |
| calendarUtils.js | 220 |

## Rules
- Parent owns state and Apex calls.
- Child components render UI and emit events upward.
- Shared pure functions go in `calendarUtils.js`.
- If any file starts creeping over budget, split again.
'@

# -----------------------------
# tree snapshot
# -----------------------------
Write-Utf8NoBom -Path (Join-Path $root "calendar-tree.txt") -Content @'
force-app/main/default/lwc/
  teamCalendarBoard/
    teamCalendarBoard.html
    teamCalendarBoard.js
    teamCalendarBoard.css
    teamCalendarBoard.js-meta.xml

  calendarToolbar/
    calendarToolbar.html
    calendarToolbar.js
    calendarToolbar.css
    calendarToolbar.js-meta.xml

  calendarLegend/
    calendarLegend.html
    calendarLegend.js
    calendarLegend.css
    calendarLegend.js-meta.xml

  calendarGrid/
    calendarGrid.html
    calendarGrid.js
    calendarGrid.css
    calendarGrid.js-meta.xml

  calendarAgenda/
    calendarAgenda.html
    calendarAgenda.js
    calendarAgenda.css
    calendarAgenda.js-meta.xml

  calendarCreateModal/
    calendarCreateModal.html
    calendarCreateModal.js
    calendarCreateModal.css
    calendarCreateModal.js-meta.xml

  calendarEventDrawer/
    calendarEventDrawer.html
    calendarEventDrawer.js
    calendarEventDrawer.css
    calendarEventDrawer.js-meta.xml

  calendarUtils/
    calendarUtils.js
    calendarUtils.js-meta.xml
'@

# -----------------------------
# teamCalendarBoard
# -----------------------------
Write-Utf8NoBom -Path (Join-Path $lwcRoot "teamCalendarBoard\teamCalendarBoard.html") -Content @'
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
                        single-row={isWeekView}
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

    <template if:true={showDrawer}>
        <c-calendar-event-drawer
            record-id={selectedRecordId}
            onclose={handleCloseDrawer}
        >
        </c-calendar-event-drawer>
    </template>
</template>
'@

Write-Utf8NoBom -Path (Join-Path $lwcRoot "teamCalendarBoard\teamCalendarBoard.js") -Content @'
import { LightningElement } from 'lwc';

export default class TeamCalendarBoard extends LightningElement {
    error;
    isLoading = false;
    showCreateModal = false;
    showDrawer = false;

    currentView = 'month';
    selectedCalendarId = '';
    selectedStatus = '';
    selectedRecordId = null;
    defaultStart = null;
    defaultEnd = null;

    weeks = [];
    legendItems = [];
    agendaGroups = [];
    calendarOptions = [{ label: 'All Calendars', value: '' }];
    statusOptions = [
        { label: 'All Statuses', value: '' },
        { label: 'Planned', value: 'Planned' },
        { label: 'Confirmed', value: 'Confirmed' },
        { label: 'Cancelled', value: 'Cancelled' }
    ];
    viewOptions = [
        { label: 'Month', value: 'month' },
        { label: 'Week', value: 'week' },
        { label: 'Agenda', value: 'agenda' }
    ];

    get rangeLabel() {
        return 'Calendar Scaffold';
    }

    get eventCount() {
        return 0;
    }

    get isGridView() {
        return this.currentView !== 'agenda';
    }

    get isAgendaView() {
        return this.currentView === 'agenda';
    }

    get isWeekView() {
        return this.currentView === 'week';
    }

    get defaultCalendarId() {
        return this.selectedCalendarId || null;
    }

    handleViewChange(event) {
        this.currentView = event.detail;
    }

    handleCalendarChange(event) {
        this.selectedCalendarId = event.detail;
    }

    handleStatusChange(event) {
        this.selectedStatus = event.detail;
    }

    handleToday() {}
    handleRefresh() {}
    handlePrev() {}
    handleNext() {}

    handleHeaderNewEvent() {
        this.showCreateModal = true;
    }

    handleDaySelect(event) {
        const selectedDate = event.detail?.dateKey;
        this.defaultStart = selectedDate;
        this.defaultEnd = selectedDate;
        this.showCreateModal = true;
    }

    handleEventOpen(event) {
        this.selectedRecordId = event.detail?.recordId || null;
        this.showDrawer = !!this.selectedRecordId;
    }

    handleCloseModal() {
        this.showCreateModal = false;
    }

    handleCreateSuccess() {
        this.showCreateModal = false;
    }

    handleCreateError() {}

    handleCloseDrawer() {
        this.showDrawer = false;
        this.selectedRecordId = null;
    }
}
'@

Write-Utf8NoBom -Path (Join-Path $lwcRoot "teamCalendarBoard\teamCalendarBoard.css") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "teamCalendarBoard\teamCalendarBoard.js-meta.xml") -Content @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>true</isExposed>
    <masterLabel>Team Calendar Board</masterLabel>
    <description>Structured calendar board scaffold.</description>
    <targets>
        <target>lightning__Tab</target>
        <target>lightning__AppPage</target>
    </targets>
</LightningComponentBundle>
'@

# -----------------------------
# calendarToolbar
# -----------------------------
Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarToolbar\calendarToolbar.html") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarToolbar\calendarToolbar.js") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarToolbar\calendarToolbar.css") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarToolbar\calendarToolbar.js-meta.xml") -Content @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarLegend
# -----------------------------
Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarLegend\calendarLegend.html") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarLegend\calendarLegend.js") -Content @'
import { LightningElement, api } from 'lwc';

export default class CalendarLegend extends LightningElement {
    @api items = [];

    get hasItems() {
        return Array.isArray(this.items) && this.items.length > 0;
    }
}
'@

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarLegend\calendarLegend.css") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarLegend\calendarLegend.js-meta.xml") -Content @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarGrid
# -----------------------------
Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarGrid\calendarGrid.html") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarGrid\calendarGrid.js") -Content @'
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
'@

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarGrid\calendarGrid.css") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarGrid\calendarGrid.js-meta.xml") -Content @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarAgenda
# -----------------------------
Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarAgenda\calendarAgenda.html") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarAgenda\calendarAgenda.js") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarAgenda\calendarAgenda.css") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarAgenda\calendarAgenda.js-meta.xml") -Content @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarCreateModal
# -----------------------------
Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarCreateModal\calendarCreateModal.html") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarCreateModal\calendarCreateModal.js") -Content @'
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

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarCreateModal\calendarCreateModal.css") -Content @'
/* Using SLDS defaults for modal styling */
'@

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarCreateModal\calendarCreateModal.js-meta.xml") -Content @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarEventDrawer
# -----------------------------
Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarEventDrawer\calendarEventDrawer.html") -Content @'
<template>
    <section role="dialog" tabindex="-1" aria-modal="true" class="slds-modal slds-fade-in-open">
        <div class="slds-modal__container drawer">
            <header class="slds-modal__header">
                <h2 class="slds-text-heading_medium">Event Details</h2>
            </header>

            <div class="slds-modal__content slds-p-around_medium">
                <p>Selected Record Id:</p>
                <p><strong>{recordId}</strong></p>
            </div>

            <footer class="slds-modal__footer">
                <lightning-button label="Close" onclick={handleClose}></lightning-button>
            </footer>
        </div>
    </section>

    <div class="slds-backdrop slds-backdrop_open"></div>
</template>
'@

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarEventDrawer\calendarEventDrawer.js") -Content @'
import { LightningElement, api } from 'lwc';

export default class CalendarEventDrawer extends LightningElement {
    @api recordId;

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }
}
'@

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarEventDrawer\calendarEventDrawer.css") -Content @'
.drawer {
    max-width: 40rem;
}
'@

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarEventDrawer\calendarEventDrawer.js-meta.xml") -Content @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

# -----------------------------
# calendarUtils
# -----------------------------
Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarUtils\calendarUtils.js") -Content @'
export function dateKey(dateValue) {
    const y = dateValue.getFullYear();
    const m = String(dateValue.getMonth() + 1).padStart(2, '0');
    const d = String(dateValue.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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

        return { startDate: dateKey(start), endDate: dateKey(end) };
    }

    if (currentView === 'agenda') {
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        return { startDate: dateKey(start), endDate: dateKey(end) };
    }

    const year = currentDate.getFullYear();
    const monthIndex = currentDate.getMonth();
    const firstOfMonth = new Date(year, monthIndex, 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 41);

    return { startDate: dateKey(start), endDate: dateKey(end) };
}

export function buildRangeLabel(currentDate, currentView) {
    if (currentView === 'week') {
        return 'Week View';
    }
    if (currentView === 'agenda') {
        return 'Agenda View';
    }
    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric'
    }).format(currentDate);
}

export function buildAgendaGroups(events) {
    return [];
}

export function buildCalendarWeeks(currentDate, currentView, events) {
    return [];
}
'@

Write-Utf8NoBom -Path (Join-Path $lwcRoot "calendarUtils\calendarUtils.js-meta.xml") -Content @'
<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>66.0</apiVersion>
    <isExposed>false</isExposed>
</LightningComponentBundle>
'@

Write-Host ""
Write-Host "[OK] Calendar scaffold created." -ForegroundColor Green
Write-Host "Backup folder: $backupRoot" -ForegroundColor Yellow
Write-Host ""
Write-Host "Deploy with:" -ForegroundColor Cyan
Write-Host "sf project deploy start --source-dir force-app/main/default/lwc --target-org calendarDev"
Write-Host ""