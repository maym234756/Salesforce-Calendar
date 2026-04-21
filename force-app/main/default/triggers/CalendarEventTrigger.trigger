trigger CalendarEventTrigger on Calendar_Event__c (
    before insert,
    before update,
    after insert,
    after update,
    after delete,
    after undelete
) {
    if (Trigger.isBefore) {
        TeamCalendarReminderService.prepareForSave(
            Trigger.new,
            Trigger.isUpdate ? Trigger.oldMap : null
        );
    }

    if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            CalendarEventChangeService.publishCreated(Trigger.new);
        } else if (Trigger.isUpdate) {
            TeamCalendarReminderService.cleanupReminderTasks(Trigger.new, Trigger.oldMap);
            CalendarEventChangeService.publishUpdated(Trigger.new, Trigger.oldMap);
        } else if (Trigger.isDelete) {
            CalendarEventChangeService.publishDeleted(Trigger.old);
        } else if (Trigger.isUndelete) {
            CalendarEventChangeService.publishRestored(Trigger.new);
        }
    }
}