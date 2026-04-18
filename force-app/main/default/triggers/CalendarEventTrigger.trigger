trigger CalendarEventTrigger on Calendar_Event__c (before insert, before update, after update) {
    if (Trigger.isBefore) {
        TeamCalendarReminderService.prepareForSave(
            Trigger.new,
            Trigger.isUpdate ? Trigger.oldMap : null
        );
    }

    if (Trigger.isAfter && Trigger.isUpdate) {
        TeamCalendarReminderService.cleanupReminderTasks(Trigger.new, Trigger.oldMap);
    }
}