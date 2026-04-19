String requestsJson = '[{"calendarViewId":"000000000000000","calendarViewName":"Test","calendarViewColor":"#706e6b","ownerId":"005Hs00000FAYJQIA5","startField":"ReminderDateTime","displayField":"Activity_Type__c"}]';
List<TeamCalendarBoardController.CalendarEventDTO> results = TeamCalendarBoardController.getTaskEventsForCalendarViews(requestsJson, '2026-04-01', '2026-04-30');
System.debug('Task events found: ' + results.size());
for (TeamCalendarBoardController.CalendarEventDTO dto : results) {
    System.debug('Event: ' + dto.name + ' | Start: ' + dto.start + ' | Owner: ' + dto.ownerName + ' | Calendar: ' + dto.calendarName);
}
