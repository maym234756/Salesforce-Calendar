public with sharing class CalendarEventChangeService {
    @TestVisible
    static List<Calendar_Event_Change__e> testPublishedEvents = new List<Calendar_Event_Change__e>();

    public static void publishCreated(List<Calendar_Event__c> newRows) {
        publishEvents(buildPlatformEvents(newRows, 'CREATED'));
    }

    public static void publishUpdated(
        List<Calendar_Event__c> newRows,
        Map<Id, Calendar_Event__c> oldMap
    ) {
        List<Calendar_Event_Change__e> eventsToPublish = new List<Calendar_Event_Change__e>();

        for (Calendar_Event__c newRow : newRows) {
            Calendar_Event__c oldRow = oldMap == null ? null : oldMap.get(newRow.Id);
            if (hasBoardRelevantChanges(newRow, oldRow)) {
                eventsToPublish.add(buildPlatformEvent(newRow, 'UPDATED'));
            }
        }

        publishEvents(eventsToPublish);
    }

    public static void publishDeleted(List<Calendar_Event__c> oldRows) {
        publishEvents(buildPlatformEvents(oldRows, 'DELETED'));
    }

    public static void publishRestored(List<Calendar_Event__c> restoredRows) {
        publishEvents(buildPlatformEvents(restoredRows, 'RESTORED'));
    }

    @TestVisible
    static void resetTestPublishedEvents() {
        testPublishedEvents = new List<Calendar_Event_Change__e>();
    }

    @TestVisible
    static Boolean hasBoardRelevantChanges(Calendar_Event__c newRow, Calendar_Event__c oldRow) {
        if (newRow == null || oldRow == null) {
            return true;
        }

        return newRow.Name != oldRow.Name ||
            newRow.Calendar__c != oldRow.Calendar__c ||
            newRow.OwnerId != oldRow.OwnerId ||
            newRow.Start__c != oldRow.Start__c ||
            newRow.End__c != oldRow.End__c ||
            newRow.All_Day__c != oldRow.All_Day__c ||
            newRow.Status__c != oldRow.Status__c ||
            newRow.Notes__c != oldRow.Notes__c ||
            newRow.Appointment_Type__c != oldRow.Appointment_Type__c ||
            newRow.Private_To_Owner__c != oldRow.Private_To_Owner__c ||
            newRow.Customer_Account__c != oldRow.Customer_Account__c ||
            newRow.Customer_Contact__c != oldRow.Customer_Contact__c ||
            newRow.Recurrence_Rule__c != oldRow.Recurrence_Rule__c ||
            newRow.Recurrence_Parent__c != oldRow.Recurrence_Parent__c ||
            newRow.Is_Recurrence_Exception__c != oldRow.Is_Recurrence_Exception__c ||
            newRow.Occurrence_Date__c != oldRow.Occurrence_Date__c;
    }

    private static List<Calendar_Event_Change__e> buildPlatformEvents(
        List<Calendar_Event__c> rows,
        String changeType
    ) {
        List<Calendar_Event_Change__e> eventsToPublish = new List<Calendar_Event_Change__e>();

        if (rows == null) {
            return eventsToPublish;
        }

        for (Calendar_Event__c row : rows) {
            if (row != null) {
                eventsToPublish.add(buildPlatformEvent(row, changeType));
            }
        }

        return eventsToPublish;
    }

    private static Calendar_Event_Change__e buildPlatformEvent(
        Calendar_Event__c row,
        String changeType
    ) {
        Calendar_Event_Change__e notification = new Calendar_Event_Change__e();
        notification.Change_Type__c = changeType;
        notification.Calendar_Event_Id__c = String.valueOf(row.Id);
        notification.Calendar_Id__c = row.Calendar__c == null ? null : String.valueOf(row.Calendar__c);
        notification.Owner_Id__c = row.OwnerId == null ? null : String.valueOf(row.OwnerId);
        notification.Changed_By_Id__c = UserInfo.getUserId();
        notification.Start__c = row.Start__c;
        notification.End__c = row.End__c;
        return notification;
    }

    private static void publishEvents(List<Calendar_Event_Change__e> eventsToPublish) {
        if (eventsToPublish == null || eventsToPublish.isEmpty()) {
            return;
        }

        if (Test.isRunningTest()) {
            testPublishedEvents.addAll(eventsToPublish);
            return;
        }

        EventBus.publish(eventsToPublish);
    }
}