public with sharing class TeamCalendarPdfController {
    private static final Date SUNDAY_ANCHOR = Date.newInstance(1900, 1, 7);

    public String currentView { get; private set; }
    public String documentTitle { get; private set; }
    public String rangeLabel { get; private set; }
    public String selectedCalendarLabel { get; private set; }
    public String selectedStatusLabel { get; private set; }
    public String selectedUserLabelText { get; private set; }
    public Integer eventCount { get; private set; }
    public Boolean showWeekends { get; private set; }

    public List<String> weekdayHeaders { get; private set; }
    public List<PrintableWeek> weeks { get; private set; }
    public List<AgendaGroup> agendaGroups { get; private set; }
    public List<TeamLoadRow> teamLoadRows { get; private set; }
    public List<ConflictRow> conflictRows { get; private set; }

    public TeamCalendarPdfController() {
        Map<String, String> params = ApexPages.currentPage().getParameters();

        currentView = normalizeView(params.get('view'));
        Date currentDate = parseDateParam(params.get('currentDate'));
        selectedCalendarLabel = String.isBlank(params.get('calendarLabel'))
            ? 'All Calendars'
            : params.get('calendarLabel');
        selectedStatusLabel = String.isBlank(params.get('statusLabel'))
            ? 'All Statuses'
            : params.get('statusLabel');
        showWeekends = parseBooleanParam(params.get('showWeekends'), true);

        RangeInfo visibleRange = getVisibleRange(currentDate, currentView);
        rangeLabel = String.isBlank(params.get('rangeLabel'))
            ? buildRangeLabel(currentDate, currentView)
            : params.get('rangeLabel');
        documentTitle = String.isBlank(params.get('documentTitle'))
            ? 'Team Calendar - ' + rangeLabel
            : params.get('documentTitle');

        List<TeamCalendarBoardController.CalendarEventDTO> loadedEvents;
        if (!String.isBlank(params.get('eventsJson'))) {
            selectedUserLabelText = String.isBlank(params.get('selectedUserLabelText'))
                ? 'None'
                : params.get('selectedUserLabelText');
            loadedEvents = parseSnapshotEvents(params.get('eventsJson'));
        } else {
            List<String> selectedUserIds = splitCsv(params.get('selectedUserIds'));
            selectedUserLabelText = loadSelectedUserLabels(selectedUserIds);
            loadedEvents = TeamCalendarBoardController.getEventsForRange(
                toDateKey(visibleRange.startDate),
                toDateKey(visibleRange.endDate),
                blankToNull(params.get('calendarId')),
                blankToNull(params.get('statusFilter')),
                selectedUserIds,
                blankToNull(params.get('userCalendarSelectionJson'))
            );
        }

        eventCount = loadedEvents.size();
        weekdayHeaders = buildWeekdayHeaders(showWeekends);
        weeks = new List<PrintableWeek>();
        agendaGroups = new List<AgendaGroup>();
        teamLoadRows = new List<TeamLoadRow>();
        conflictRows = new List<ConflictRow>();

        if (getIsGridView()) {
            weeks = buildCalendarWeeks(currentDate, currentView, loadedEvents, showWeekends);
        } else if (getIsAgendaView()) {
            agendaGroups = buildAgendaGroups(loadedEvents);
        } else if (getIsTeamLoadView()) {
            teamLoadRows = buildTeamLoadRows(loadedEvents);
        } else if (getIsConflictsView()) {
            conflictRows = buildConflictRows(loadedEvents);
        }
    }

    public Boolean getIsGridView() {
        return currentView == 'month' || currentView == 'week';
    }

    public Boolean getIsAgendaView() {
        return currentView == 'agenda';
    }

    public Boolean getIsTeamLoadView() {
        return currentView == 'teamLoad';
    }

    public Boolean getIsConflictsView() {
        return currentView == 'conflicts';
    }

    public Boolean getHasAgendaGroups() {
        return !agendaGroups.isEmpty();
    }

    public Boolean getHasTeamLoadRows() {
        return !teamLoadRows.isEmpty();
    }

    public Boolean getHasConflictRows() {
        return !conflictRows.isEmpty();
    }

    private static String normalizeView(String rawView) {
        Set<String> allowed = new Set<String>{ 'month', 'week', 'agenda', 'teamLoad', 'conflicts' };
        return allowed.contains(rawView) ? rawView : 'month';
    }

    private static Date parseDateParam(String rawValue) {
        if (String.isBlank(rawValue)) {
            return Date.today();
        }

        try {
            return Date.valueOf(rawValue);
        } catch (Exception ex) {
            return Date.today();
        }
    }

    private static Boolean parseBooleanParam(String rawValue, Boolean defaultValue) {
        if (String.isBlank(rawValue)) {
            return defaultValue;
        }

        return rawValue == 'true';
    }

    private static String blankToNull(String rawValue) {
        return String.isBlank(rawValue) ? null : rawValue;
    }

    private static List<String> splitCsv(String rawValue) {
        List<String> rows = new List<String>();
        if (String.isBlank(rawValue)) {
            return rows;
        }

        for (String part : rawValue.split(',')) {
            if (!String.isBlank(part)) {
                rows.add(part.trim());
            }
        }

        return rows;
    }

    private static String loadSelectedUserLabels(List<String> selectedUserIds) {
        Set<Id> scopedIds = new Set<Id>();
        for (String rawId : selectedUserIds) {
            if (!String.isBlank(rawId)) {
                try {
                    scopedIds.add((Id) rawId);
                } catch (Exception ex) {
                    // skip malformed id values from URL parameters
                }
            }
        }

        if (scopedIds.isEmpty()) {
            return 'None';
        }

        List<String> labels = new List<String>();
        for (User row : [
            SELECT Name
            FROM User
            WHERE Id IN :scopedIds
            ORDER BY Name
        ]) {
            labels.add(row.Name);
        }

        return labels.isEmpty() ? 'None' : String.join(labels, ', ');
    }

    private static List<TeamCalendarBoardController.CalendarEventDTO> parseSnapshotEvents(String eventsJson) {
        List<TeamCalendarBoardController.CalendarEventDTO> results = new List<TeamCalendarBoardController.CalendarEventDTO>();
        if (String.isBlank(eventsJson)) {
            return results;
        }

        List<SnapshotEventRow> rawRows =
            (List<SnapshotEventRow>) JSON.deserialize(eventsJson, List<SnapshotEventRow>.class);

        for (SnapshotEventRow rawRow : rawRows) {
            TeamCalendarBoardController.CalendarEventDTO dto = new TeamCalendarBoardController.CalendarEventDTO();
            dto.name = rawRow.name;
            dto.ownerName = rawRow.ownerName;
            dto.start = parseDateTimeValue(rawRow.start);
            dto.endDateTime = parseDateTimeValue(rawRow.endDateTime);
            dto.allDay = rawRow.allDay;
            dto.status = rawRow.status;
            dto.notes = rawRow.notes;
            dto.calendarName = rawRow.calendarName;
            dto.calendarColor = rawRow.calendarColor;
            dto.syncStatus = rawRow.syncStatus;
            dto.syncError = rawRow.syncError;
            dto.lastSyncedAt = parseDateTimeValue(rawRow.lastSyncedAt);

            try {
                dto.id = String.isBlank(rawRow.id) ? null : (Id) rawRow.id;
            } catch (Exception ex) {
                dto.id = null;
            }

            try {
                dto.ownerId = String.isBlank(rawRow.ownerId) ? null : (Id) rawRow.ownerId;
            } catch (Exception ex) {
                dto.ownerId = null;
            }

            try {
                dto.calendarId = String.isBlank(rawRow.calendarId) ? null : (Id) rawRow.calendarId;
            } catch (Exception ex) {
                dto.calendarId = null;
            }

            results.add(dto);
        }

        return results;
    }

    private static Datetime parseDateTimeValue(String rawValue) {
        if (String.isBlank(rawValue)) {
            return null;
        }

        if (rawValue.endsWith('Z')) {
            return Datetime.valueOfGmt(rawValue.replace('T', ' ').replace('Z', ''));
        }

        if (rawValue.contains('T')) {
            return Datetime.valueOf(rawValue.replace('T', ' '));
        }

        if (rawValue.length() == 10) {
            return Datetime.newInstance(Date.valueOf(rawValue), Time.newInstance(0, 0, 0, 0));
        }

        return Datetime.valueOf(rawValue);
    }

    private static RangeInfo getVisibleRange(Date currentDate, String viewName) {
        if (viewName == 'week') {
            Date startDate = startOfWeek(currentDate);
            return new RangeInfo(startDate, startDate.addDays(6));
        }

        if (viewName == 'agenda' || viewName == 'teamLoad' || viewName == 'conflicts') {
            Date startDate = Date.newInstance(currentDate.year(), currentDate.month(), 1);
            return new RangeInfo(startDate, startDate.addMonths(1).addDays(-1));
        }

        Date firstOfMonth = Date.newInstance(currentDate.year(), currentDate.month(), 1);
        Date startDate = startOfWeek(firstOfMonth);
        return new RangeInfo(startDate, startDate.addDays(41));
    }

    private static Date startOfWeek(Date value) {
        Integer offset = Math.mod(SUNDAY_ANCHOR.daysBetween(value), 7);
        return value.addDays(-offset);
    }

    private static String buildRangeLabel(Date currentDate, String viewName) {
        if (viewName == 'week') {
            RangeInfo range = getVisibleRange(currentDate, viewName);
            return formatMonthShort(range.startDate) + ' ' + range.startDate.day() +
                ' - ' + formatMonthShort(range.endDate) + ' ' + range.endDate.day() +
                ', ' + range.endDate.year();
        }

        String monthYear = formatMonthLong(currentDate) + ' ' + String.valueOf(currentDate.year());

        if (viewName == 'agenda') {
            return monthYear + ' Agenda';
        }

        if (viewName == 'teamLoad') {
            return monthYear + ' Team Load';
        }

        if (viewName == 'conflicts') {
            return monthYear + ' Conflicts';
        }

        return monthYear;
    }

    private static List<String> buildWeekdayHeaders(Boolean includeWeekends) {
        return includeWeekends
            ? new List<String>{ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' }
            : new List<String>{ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri' };
    }

    private static List<PrintableWeek> buildCalendarWeeks(
        Date currentDate,
        String viewName,
        List<TeamCalendarBoardController.CalendarEventDTO> eventRows,
        Boolean includeWeekends
    ) {
        RangeInfo range = getVisibleRange(currentDate, viewName);
        Map<String, List<RenderedEvent>> groupedByDay = buildDayBuckets(eventRows, range.startDate, range.endDate);

        List<PrintableWeek> printableWeeks = new List<PrintableWeek>();
        Date cursor = range.startDate;
        Integer weekCount = viewName == 'week' ? 1 : 6;

        for (Integer weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
            PrintableWeek week = new PrintableWeek();
            week.days = new List<PrintableDay>();

            for (Integer dayIndex = 0; dayIndex < 7; dayIndex += 1) {
                Boolean isWeekend = dayIndex == 0 || dayIndex == 6;
                if (!includeWeekends && isWeekend) {
                    cursor = cursor.addDays(1);
                    continue;
                }

                String dayKey = toDateKey(cursor);
                List<RenderedEvent> dayEvents = groupedByDay.containsKey(dayKey)
                    ? groupedByDay.get(dayKey)
                    : new List<RenderedEvent>();
                Integer maxVisible = viewName == 'month' ? 3 : dayEvents.size();

                PrintableDay day = new PrintableDay();
                day.label = String.valueOf(cursor.day());
                day.isCurrentMonth = viewName == 'week' || cursor.month() == currentDate.month();
                day.cellClass = day.isCurrentMonth ? 'day-cell' : 'day-cell day-cell-muted';
                day.events = new List<RenderedEvent>();
                day.hiddenCount = Math.max(dayEvents.size() - maxVisible, 0);
                day.showMore = day.hiddenCount > 0;

                for (Integer eventIndex = 0; eventIndex < Math.min(dayEvents.size(), maxVisible); eventIndex += 1) {
                    day.events.add(dayEvents[eventIndex]);
                }

                week.days.add(day);
                cursor = cursor.addDays(1);
            }

            printableWeeks.add(week);
        }

        return printableWeeks;
    }

    private static Map<String, List<RenderedEvent>> buildDayBuckets(
        List<TeamCalendarBoardController.CalendarEventDTO> eventRows,
        Date rangeStart,
        Date rangeEnd
    ) {
        Map<String, List<RenderedEvent>> grouped = new Map<String, List<RenderedEvent>>();

        for (TeamCalendarBoardController.CalendarEventDTO row : eventRows) {
            if (row.start == null) {
                continue;
            }

            Date startDate = row.start.date();
            Date endDate = row.endDateTime != null ? row.endDateTime.date() : startDate;
            Date clippedStart = maxDate(startDate, rangeStart);
            Date clippedEnd = minDate(endDate, rangeEnd);

            if (toMillis(clippedStart) > toMillis(clippedEnd)) {
                continue;
            }

            Date cursor = clippedStart;
            while (toMillis(cursor) <= toMillis(clippedEnd)) {
                String occurrenceKey = toDateKey(cursor);

                if (!grouped.containsKey(occurrenceKey)) {
                    grouped.put(occurrenceKey, new List<RenderedEvent>());
                }

                grouped.get(occurrenceKey).add(buildRenderedEvent(row, occurrenceKey));
                cursor = cursor.addDays(1);
            }
        }

        for (String key : grouped.keySet()) {
            grouped.get(key).sort();
        }

        return grouped;
    }

    private static RenderedEvent buildRenderedEvent(
        TeamCalendarBoardController.CalendarEventDTO row,
        String occurrenceKey
    ) {
        Datetime startValue = row.start;
        Datetime endValue = row.endDateTime != null ? row.endDateTime : row.start;

        RenderedEvent eventRow = new RenderedEvent();
        eventRow.name = String.isBlank(row.name) ? '(No Subject)' : row.name;
        eventRow.timeLabel = buildGridTimeLabel(startValue, endValue, row.allDay, occurrenceKey);
        eventRow.displayLabel = String.isBlank(eventRow.timeLabel)
            ? eventRow.name
            : eventRow.timeLabel + ' - ' + eventRow.name;
        eventRow.sortValue = row.allDay ? 0 : startValue.getTime();

        return eventRow;
    }

    private static String buildGridTimeLabel(
        Datetime startValue,
        Datetime endValue,
        Boolean allDayValue,
        String occurrenceKey
    ) {
        if (allDayValue == true) {
            return 'All Day';
        }

        String startKey = toDateKey(startValue.date());
        String endKey = toDateKey(endValue.date());

        if (startKey == endKey) {
            return formatTime(startValue);
        }

        if (occurrenceKey == startKey) {
            return 'Starts ' + formatTime(startValue);
        }

        if (occurrenceKey == endKey) {
            return 'Ends ' + formatTime(endValue);
        }

        return 'All Day';
    }

    private static List<AgendaGroup> buildAgendaGroups(
        List<TeamCalendarBoardController.CalendarEventDTO> eventRows
    ) {
        Map<String, List<AgendaEventRow>> grouped = new Map<String, List<AgendaEventRow>>();

        for (TeamCalendarBoardController.CalendarEventDTO row : eventRows) {
            if (row.start == null) {
                continue;
            }

            String key = toDateKey(row.start.date());
            if (!grouped.containsKey(key)) {
                grouped.put(key, new List<AgendaEventRow>());
            }

            AgendaEventRow agendaEvent = new AgendaEventRow();
            agendaEvent.name = row.name;
            agendaEvent.timeLabel = buildAgendaTimeLabel(row.start, row.endDateTime, row.allDay);
            agendaEvent.sortValue = row.allDay ? 0 : row.start.getTime();
            grouped.get(key).add(agendaEvent);
        }

        List<String> sortedKeys = new List<String>(grouped.keySet());
        sortedKeys.sort();

        List<AgendaGroup> results = new List<AgendaGroup>();
        for (String key : sortedKeys) {
            List<AgendaEventRow> dayEvents = grouped.get(key);
            dayEvents.sort();

            AgendaGroup agendaGroup = new AgendaGroup();
            agendaGroup.label = formatAgendaDate(Date.valueOf(key));
            agendaGroup.countLabel = String.valueOf(dayEvents.size()) + ' event' + (dayEvents.size() == 1 ? '' : 's');
            agendaGroup.events = dayEvents;
            results.add(agendaGroup);
        }

        return results;
    }

    private static String buildAgendaTimeLabel(
        Datetime startValue,
        Datetime endValue,
        Boolean allDayValue
    ) {
        if (allDayValue == true) {
            return 'All Day';
        }

        if (endValue == null) {
            return formatTime(startValue);
        }

        return formatTime(startValue) + ' - ' + formatTime(endValue);
    }

    private static List<TeamLoadRow> buildTeamLoadRows(
        List<TeamCalendarBoardController.CalendarEventDTO> eventRows
    ) {
        Map<String, TeamLoadRow> buckets = new Map<String, TeamLoadRow>();

        for (TeamCalendarBoardController.CalendarEventDTO row : eventRows) {
            String key = String.isBlank(row.calendarName) ? 'unassigned' : row.calendarName;
            if (!buckets.containsKey(key)) {
                TeamLoadRow bucket = new TeamLoadRow();
                bucket.calendarName = String.isBlank(row.calendarName) ? 'Unassigned' : row.calendarName;
                buckets.put(key, bucket);
            }

            TeamLoadRow bucket = buckets.get(key);
            bucket.total += 1;

            if (row.allDay == true) {
                bucket.allDay += 1;
            } else {
                bucket.timed += 1;
            }

            String normalizedStatus = String.valueOf(row.status).toLowerCase();
            if (normalizedStatus == 'planned') bucket.planned += 1;
            if (normalizedStatus == 'confirmed') bucket.confirmed += 1;
            if (normalizedStatus == 'cancelled') bucket.cancelled += 1;
        }

        List<TeamLoadRow> results = new List<TeamLoadRow>(buckets.values());
        results.sort();
        return results;
    }

    private static List<ConflictRow> buildConflictRows(
        List<TeamCalendarBoardController.CalendarEventDTO> eventRows
    ) {
        Map<String, List<TeamCalendarBoardController.CalendarEventDTO>> groupedByCalendar =
            new Map<String, List<TeamCalendarBoardController.CalendarEventDTO>>();

        for (TeamCalendarBoardController.CalendarEventDTO row : eventRows) {
            String key = String.isBlank(row.calendarName) ? 'Unassigned' : row.calendarName;
            if (!groupedByCalendar.containsKey(key)) {
                groupedByCalendar.put(key, new List<TeamCalendarBoardController.CalendarEventDTO>());
            }

            groupedByCalendar.get(key).add(row);
        }

        List<ConflictRow> conflicts = new List<ConflictRow>();

        for (String calendarName : groupedByCalendar.keySet()) {
            List<SortableCalendarEvent> sortedRows = new List<SortableCalendarEvent>();
            for (TeamCalendarBoardController.CalendarEventDTO row : groupedByCalendar.get(calendarName)) {
                sortedRows.add(new SortableCalendarEvent(row));
            }
            sortedRows.sort();

            for (Integer index = 0; index < sortedRows.size(); index += 1) {
                TeamCalendarBoardController.CalendarEventDTO current = sortedRows[index].eventRow;
                Long currentEnd = (current.endDateTime != null ? current.endDateTime : current.start).getTime();

                for (Integer compareIndex = index + 1; compareIndex < sortedRows.size(); compareIndex += 1) {
                    TeamCalendarBoardController.CalendarEventDTO candidate = sortedRows[compareIndex].eventRow;
                    Long candidateStart = candidate.start.getTime();

                    if (candidateStart >= currentEnd) {
                        break;
                    }

                    ConflictRow conflict = new ConflictRow();
                    conflict.calendarName = calendarName;
                    conflict.firstTitle = current.name;
                    conflict.firstTime = formatEventStamp(current);
                    conflict.secondTitle = candidate.name;
                    conflict.secondTime = formatEventStamp(candidate);
                    conflicts.add(conflict);
                }
            }
        }

        return conflicts;
    }

    private static String formatEventStamp(TeamCalendarBoardController.CalendarEventDTO row) {
        Date startDate = row.start.date();
        String dateLabel = formatMonthShort(startDate) + ' ' + startDate.day();

        if (row.allDay == true) {
            return dateLabel + ' - All day';
        }

        if (row.endDateTime == null) {
            return dateLabel + ' - ' + formatTime(row.start);
        }

        return dateLabel + ' - ' + formatTime(row.start) + ' - ' + formatTime(row.endDateTime);
    }

    private static String formatAgendaDate(Date value) {
        return formatWeekdayShort(value) + ', ' + formatMonthShort(value) + ' ' + value.day();
    }

    private static String formatTime(Datetime value) {
        return value.format('h:mm a');
    }

    private static String formatMonthShort(Date value) {
        List<String> monthNames = new List<String>{
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        };
        return monthNames[value.month() - 1];
    }

    private static String formatMonthLong(Date value) {
        List<String> monthNames = new List<String>{
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        };
        return monthNames[value.month() - 1];
    }

    private static String formatWeekdayShort(Date value) {
        List<String> weekdayNames = new List<String>{ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' };
        Integer offset = Math.mod(SUNDAY_ANCHOR.daysBetween(value), 7);
        return weekdayNames[offset];
    }

    private static Date maxDate(Date leftValue, Date rightValue) {
        return toMillis(leftValue) >= toMillis(rightValue) ? leftValue : rightValue;
    }

    private static Date minDate(Date leftValue, Date rightValue) {
        return toMillis(leftValue) <= toMillis(rightValue) ? leftValue : rightValue;
    }

    private static Long toMillis(Date value) {
        return Datetime.newInstance(value, Time.newInstance(0, 0, 0, 0)).getTime();
    }

    private static String toDateKey(Date value) {
        return String.valueOf(value.year()) + '-' +
            String.valueOf(value.month()).leftPad(2, '0') + '-' +
            String.valueOf(value.day()).leftPad(2, '0');
    }

    public class RangeInfo {
        public Date startDate { get; private set; }
        public Date endDate { get; private set; }

        public RangeInfo(Date startDate, Date endDate) {
            this.startDate = startDate;
            this.endDate = endDate;
        }
    }

    public class PrintableWeek {
        public List<PrintableDay> days { get; set; }
    }

    public class PrintableDay {
        public String label { get; set; }
        public Boolean isCurrentMonth { get; set; }
        public String cellClass { get; set; }
        public List<RenderedEvent> events { get; set; }
        public Integer hiddenCount { get; set; }
        public Boolean showMore { get; set; }
    }

    public class RenderedEvent implements Comparable {
        public String name { get; set; }
        public String timeLabel { get; set; }
        public String displayLabel { get; set; }
        public Long sortValue { get; set; }

        public Integer compareTo(Object otherRow) {
            RenderedEvent otherEvent = (RenderedEvent) otherRow;
            if (sortValue == otherEvent.sortValue) {
                return compareStringsIgnoreCase(name, otherEvent.name);
            }

            return sortValue < otherEvent.sortValue ? -1 : 1;
        }
    }

    public class AgendaGroup {
        public String label { get; set; }
        public String countLabel { get; set; }
        public List<AgendaEventRow> events { get; set; }
    }

    public class AgendaEventRow implements Comparable {
        public String name { get; set; }
        public String timeLabel { get; set; }
        public Long sortValue { get; set; }

        public Integer compareTo(Object otherRow) {
            AgendaEventRow otherEvent = (AgendaEventRow) otherRow;
            if (sortValue == otherEvent.sortValue) {
                return compareStringsIgnoreCase(name, otherEvent.name);
            }

            return sortValue < otherEvent.sortValue ? -1 : 1;
        }
    }

    public class TeamLoadRow implements Comparable {
        public String calendarName { get; set; }
        public Integer total { get; set; }
        public Integer confirmed { get; set; }
        public Integer planned { get; set; }
        public Integer cancelled { get; set; }
        public Integer allDay { get; set; }
        public Integer timed { get; set; }

        public TeamLoadRow() {
            total = 0;
            confirmed = 0;
            planned = 0;
            cancelled = 0;
            allDay = 0;
            timed = 0;
        }

        public Integer compareTo(Object otherRow) {
            TeamLoadRow otherLoad = (TeamLoadRow) otherRow;
            if (total == otherLoad.total) {
                return compareStringsIgnoreCase(calendarName, otherLoad.calendarName);
            }

            return total > otherLoad.total ? -1 : 1;
        }
    }

    public class SortableCalendarEvent implements Comparable {
        public TeamCalendarBoardController.CalendarEventDTO eventRow { get; private set; }

        public SortableCalendarEvent(TeamCalendarBoardController.CalendarEventDTO eventRow) {
            this.eventRow = eventRow;
        }

        public Integer compareTo(Object otherRow) {
            SortableCalendarEvent otherEvent = (SortableCalendarEvent) otherRow;
            Long leftValue = eventRow.start != null ? eventRow.start.getTime() : 0;
            Long rightValue = otherEvent.eventRow.start != null ? otherEvent.eventRow.start.getTime() : 0;

            if (leftValue == rightValue) {
                return compareStringsIgnoreCase(eventRow.name, otherEvent.eventRow.name);
            }

            return leftValue < rightValue ? -1 : 1;
        }
    }

    public class ConflictRow {
        public String calendarName { get; set; }
        public String firstTitle { get; set; }
        public String firstTime { get; set; }
        public String secondTitle { get; set; }
        public String secondTime { get; set; }
    }

    public class SnapshotEventRow {
        public String id;
        public String name;
        public String ownerId;
        public String ownerName;
        public String start;
        public String endDateTime;
        public Boolean allDay;
        public String status;
        public String notes;
        public String calendarId;
        public String calendarName;
        public String calendarColor;
        public String externalEventId;
        public String syncStatus;
        public String syncError;
        public String lastSyncedAt;
    }

    private static Integer compareStringsIgnoreCase(String leftValue, String rightValue) {
        return String.valueOf(leftValue).toLowerCase().compareTo(String.valueOf(rightValue).toLowerCase());
    }
}