public with sharing class TeamCalendarUndoService {
    @AuraEnabled
    public static Id undeleteCalendarEvent(String recordId) {
        Id resolvedRecordId = parseId(recordId);
        if (resolvedRecordId == null) {
            throw new AuraHandledException('A calendar event id is required.');
        }

        Id runningUserId = UserInfo.getUserId();
        Boolean isSecurityAdmin = TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);

        List<Calendar_Event__c> existingRows = [
            SELECT Id, OwnerId, IsDeleted
            FROM Calendar_Event__c
            WHERE Id = :resolvedRecordId
            LIMIT 1
            ALL ROWS
        ];
        if (existingRows.isEmpty()) {
            throw new AuraHandledException('The calendar event was not found.');
        }

        Calendar_Event__c existingRow = existingRows[0];
        if (existingRow.IsDeleted != true) {
            return existingRow.Id;
        }

        enforceCalendarEventRestoreAccess(runningUserId, isSecurityAdmin, existingRow.OwnerId);
        enforceCrudAccess(Calendar_Event__c.SObjectType, 'delete');
        undelete existingRow;
        resetRestoredEventForGoogleSync(existingRow.Id);
        return existingRow.Id;
    }

    @AuraEnabled
    public static Id undeleteTask(String recordId, String calendarViewId) {
        Id resolvedRecordId = parseId(recordId);
        Id resolvedCalendarViewId = parseId(calendarViewId);

        if (resolvedRecordId == null) {
            throw new AuraHandledException('A task id is required.');
        }

        if (resolvedCalendarViewId == null) {
            throw new AuraHandledException('A calendar view context is required to restore this task.');
        }

        Id runningUserId = UserInfo.getUserId();
        Boolean isSecurityAdmin = TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);
        enforceTaskRestoreAccess(runningUserId, isSecurityAdmin, resolvedCalendarViewId);
        enforceCrudAccess(Task.SObjectType, 'delete');

        List<Task> existingTasks = [
            SELECT Id, IsDeleted
            FROM Task
            WHERE Id = :resolvedRecordId
            LIMIT 1
            ALL ROWS
        ];
        if (existingTasks.isEmpty()) {
            throw new AuraHandledException('The task was not found.');
        }

        Task existingRow = existingTasks[0];
        if (existingRow.IsDeleted != true) {
            return existingRow.Id;
        }

        undelete existingRow;
        return existingRow.Id;
    }

    private static void enforceCalendarEventRestoreAccess(
        Id runningUserId,
        Boolean isSecurityAdmin,
        Id ownerId
    ) {
        if (isSecurityAdmin == true || ownerId == runningUserId) {
            return;
        }

        throw new AuraHandledException(
            'You do not have access to restore calendar events for another user.'
        );
    }

    private static void enforceTaskRestoreAccess(
        Id runningUserId,
        Boolean isSecurityAdmin,
        Id calendarViewId
    ) {
        if (isSecurityAdmin == true) {
            return;
        }

        List<CalendarView> ownedRows = [
            SELECT Id
            FROM CalendarView
            WHERE Id = :calendarViewId
            AND OwnerId = :runningUserId
            LIMIT 1
        ];
        if (!ownedRows.isEmpty()) {
            return;
        }

        String calendarViewIdValue = String.valueOf(calendarViewId);
        List<Calendar_Access_Rule__c> allowedRules = [
            SELECT Id
            FROM Calendar_Access_Rule__c
            WHERE Target_User__c = :runningUserId
            AND Calendar_View_Id__c = :calendarViewIdValue
            AND Is_Active__c = true
            AND Can_Edit__c = true
            LIMIT 1
        ];
        if (!allowedRules.isEmpty()) {
            return;
        }

        throw new AuraHandledException('You do not have access to restore this task.');
    }

    private static void enforceCrudAccess(Schema.SObjectType sObjectType, String operation) {
        Schema.DescribeSObjectResult describeResult = sObjectType.getDescribe();
        Boolean isAllowed = false;

        if (operation == 'delete') {
            isAllowed = describeResult.isDeletable();
        } else if (operation == 'update') {
            isAllowed = describeResult.isUpdateable();
        }

        if (isAllowed != true) {
            throw new AuraHandledException('You do not have permission to modify this record.');
        }
    }

    private static Id parseId(String rawValue) {
        if (String.isBlank(rawValue)) {
            return null;
        }

        try {
            return (Id) rawValue.trim();
        } catch (Exception ex) {
            return null;
        }
    }

    private static void resetRestoredEventForGoogleSync(Id restoredEventId) {
        if (restoredEventId == null) {
            return;
        }

        List<Calendar_Event__c> restoredRows = [
            SELECT Id,
                   External_Event_Id__c,
                   Sync_Status__c,
                   Sync_Error__c,
                   Last_Synced_At__c,
                   Calendar__r.Google_Sync_Enabled__c
            FROM Calendar_Event__c
            WHERE Id = :restoredEventId
            LIMIT 1
        ];
        if (restoredRows.isEmpty() || restoredRows[0].Calendar__r.Google_Sync_Enabled__c != true) {
            return;
        }

        Calendar_Event__c restoredRow = restoredRows[0];
        Calendar_Event__c resetRow = new Calendar_Event__c(Id = restoredEventId);
        Boolean needsReset = false;

        if (!String.isBlank(restoredRow.External_Event_Id__c)) {
            resetRow.External_Event_Id__c = null;
            needsReset = true;
        }
        if (String.isNotBlank(restoredRow.Sync_Status__c)) {
            resetRow.Sync_Status__c = null;
            needsReset = true;
        }
        if (String.isNotBlank(restoredRow.Sync_Error__c)) {
            resetRow.Sync_Error__c = null;
            needsReset = true;
        }
        if (restoredRow.Last_Synced_At__c != null) {
            resetRow.Last_Synced_At__c = null;
            needsReset = true;
        }

        if (needsReset) {
            enforceCrudAccess(Calendar_Event__c.SObjectType, 'update');
            update resetRow;
        }

        GoogleCalendarSyncService.queueMutationSync(restoredEventId);
    }
}