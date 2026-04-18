public without sharing class TeamCalendarRecordMutationService {
    public class CalendarEventMutationInput {
        @AuraEnabled public String recordId;
        @AuraEnabled public String calendarId;
        @AuraEnabled public String ownerId;
        @AuraEnabled public String name;
        @AuraEnabled public String startValue;
        @AuraEnabled public String endValue;
        @AuraEnabled public Boolean allDay;
        @AuraEnabled public String status;
        @AuraEnabled public String notes;
        @AuraEnabled public String appointmentType;
        @AuraEnabled public Boolean privateToOwner;
        @AuraEnabled public String reminderOffset;
        @AuraEnabled public String customerAccountId;
        @AuraEnabled public String customerContactId;
    }

    public class CalendarEventSeriesInput {
        @AuraEnabled public CalendarEventMutationInput primaryEvent;
        @AuraEnabled public List<CalendarEventMutationInput> followUpEvents;
    }

    public class TaskMutationInput {
        @AuraEnabled public String recordId;
        @AuraEnabled public String calendarViewId;
        @AuraEnabled public String subject;
        @AuraEnabled public String ownerId;
        @AuraEnabled public String activityDate;
        @AuraEnabled public String status;
        @AuraEnabled public String priority;
        @AuraEnabled public String whatId;
        @AuraEnabled public String whoId;
        @AuraEnabled public String description;
    }

    public class MutationResultDTO {
        @AuraEnabled public Id recordId;
        @AuraEnabled public Integer followUpRequestedCount;
        @AuraEnabled public Integer followUpCreatedCount;
        @AuraEnabled public Integer followUpFailedCount;
    }

    public class CalendarEventEditorDTO {
        @AuraEnabled public Id recordId;
        @AuraEnabled public Id calendarId;
        @AuraEnabled public String name;
        @AuraEnabled public Datetime startValue;
        @AuraEnabled public Datetime endValue;
        @AuraEnabled public Boolean allDay;
        @AuraEnabled public String status;
        @AuraEnabled public String notes;
    }

    @AuraEnabled
    public static MutationResultDTO createCalendarEventSeries(String requestJson) {
        CalendarEventSeriesInput request = String.isBlank(requestJson)
            ? null
            : (CalendarEventSeriesInput) JSON.deserialize(requestJson, CalendarEventSeriesInput.class);

        if (request == null || request.primaryEvent == null) {
            throw new AuraHandledException('A primary calendar event is required.');
        }

        Id runningUserId = UserInfo.getUserId();
        Boolean isSecurityAdmin = TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);

        Id resolvedOwnerId = parseId(request.primaryEvent.ownerId);
        if (resolvedOwnerId == null) {
            resolvedOwnerId = runningUserId;
        }

        Id resolvedCalendarId = resolveWritableTeamCalendarId(
            parseId(request.primaryEvent.calendarId),
            resolvedOwnerId,
            isSecurityAdmin
        );
        enforceCalendarEventMutationAccess(runningUserId, isSecurityAdmin, resolvedOwnerId);

        Calendar_Event__c primaryRow = buildCalendarEventRow(
            request.primaryEvent,
            null,
            resolvedCalendarId,
            resolvedOwnerId
        );
        insert primaryRow;

        MutationResultDTO result = new MutationResultDTO();
        result.recordId = primaryRow.Id;
        result.followUpRequestedCount = 0;
        result.followUpCreatedCount = 0;
        result.followUpFailedCount = 0;

        List<CalendarEventMutationInput> followUpInputs =
            request.followUpEvents == null ? new List<CalendarEventMutationInput>() : request.followUpEvents;

        if (followUpInputs.isEmpty()) {
            return result;
        }

        List<Calendar_Event__c> followUpRows = new List<Calendar_Event__c>();
        for (CalendarEventMutationInput inputRow : followUpInputs) {
            if (inputRow == null) {
                continue;
            }

            Id followUpOwnerId = parseId(inputRow.ownerId);
            if (followUpOwnerId == null) {
                followUpOwnerId = resolvedOwnerId;
            }

            Id followUpCalendarId = resolveWritableTeamCalendarId(
                parseId(inputRow.calendarId),
                followUpOwnerId,
                isSecurityAdmin
            );
            enforceCalendarEventMutationAccess(runningUserId, isSecurityAdmin, followUpOwnerId);

            followUpRows.add(
                buildCalendarEventRow(inputRow, null, followUpCalendarId, followUpOwnerId)
            );
        }

        result.followUpRequestedCount = followUpRows.size();
        if (followUpRows.isEmpty()) {
            return result;
        }

        Database.SaveResult[] saveResults = Database.insert(followUpRows, false);
        for (Database.SaveResult saveResult : saveResults) {
            if (saveResult.isSuccess()) {
                result.followUpCreatedCount += 1;
            } else {
                result.followUpFailedCount += 1;
            }
        }

        return result;
    }

    @AuraEnabled
    public static Id updateCalendarEvent(String requestJson) {
        CalendarEventMutationInput request = String.isBlank(requestJson)
            ? null
            : (CalendarEventMutationInput) JSON.deserialize(requestJson, CalendarEventMutationInput.class);

        Id recordId = request != null ? parseId(request.recordId) : null;
        if (recordId == null) {
            throw new AuraHandledException('A calendar event id is required.');
        }

        Id runningUserId = UserInfo.getUserId();
        Boolean isSecurityAdmin = TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);

        Calendar_Event__c existingRow = [
            SELECT Id, OwnerId, Calendar__c
            FROM Calendar_Event__c
            WHERE Id = :recordId
            LIMIT 1
        ];

        enforceCalendarEventMutationAccess(runningUserId, isSecurityAdmin, existingRow.OwnerId);

        Id resolvedCalendarId = resolveWritableTeamCalendarId(
            request != null ? parseId(request.calendarId) : existingRow.Calendar__c,
            existingRow.OwnerId,
            isSecurityAdmin
        );

        Calendar_Event__c updatedRow = buildCalendarEventRow(
            request,
            existingRow.Id,
            resolvedCalendarId,
            existingRow.OwnerId
        );
        update updatedRow;
        return updatedRow.Id;
    }

    @AuraEnabled(cacheable=true)
    public static CalendarEventEditorDTO getCalendarEventEditorState(String recordId) {
        Id resolvedRecordId = parseId(recordId);
        if (resolvedRecordId == null) {
            throw new AuraHandledException('A calendar event id is required.');
        }

        Id runningUserId = UserInfo.getUserId();
        Boolean isSecurityAdmin = TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);

        Calendar_Event__c existingRow = [
            SELECT Id, OwnerId, Calendar__c, Name, Start__c, End__c, All_Day__c, Status__c, Notes__c
            FROM Calendar_Event__c
            WHERE Id = :resolvedRecordId
            LIMIT 1
        ];

        enforceCalendarEventMutationAccess(runningUserId, isSecurityAdmin, existingRow.OwnerId);

        CalendarEventEditorDTO dto = new CalendarEventEditorDTO();
        dto.recordId = existingRow.Id;
        dto.calendarId = existingRow.Calendar__c;
        dto.name = existingRow.Name;
        dto.startValue = existingRow.Start__c;
        dto.endValue = existingRow.End__c;
        dto.allDay = existingRow.All_Day__c == true;
        dto.status = existingRow.Status__c;
        dto.notes = existingRow.Notes__c;
        return dto;
    }

    @AuraEnabled
    public static Id updateTask(String requestJson) {
        TaskMutationInput request = String.isBlank(requestJson)
            ? null
            : (TaskMutationInput) JSON.deserialize(requestJson, TaskMutationInput.class);

        Id recordId = request != null ? parseId(request.recordId) : null;
        Id calendarViewId = request != null ? parseId(request.calendarViewId) : null;

        if (recordId == null) {
            throw new AuraHandledException('A task id is required.');
        }

        if (calendarViewId == null) {
            throw new AuraHandledException('A calendar view context is required to edit this task.');
        }

        Id runningUserId = UserInfo.getUserId();
        Boolean isSecurityAdmin = TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);
        enforceTaskEditAccess(runningUserId, isSecurityAdmin, calendarViewId);

        Task existingRow = [
            SELECT Id, OwnerId
            FROM Task
            WHERE Id = :recordId
            LIMIT 1
        ];

        Id nextOwnerId = parseId(request.ownerId);
        if (nextOwnerId == null) {
            nextOwnerId = existingRow.OwnerId;
        }

        Task updatedRow = new Task(
            Id = recordId,
            Subject = request.subject,
            OwnerId = nextOwnerId,
            ActivityDate = parseDate(request.activityDate),
            Status = request.status,
            Priority = request.priority,
            WhatId = parseId(request.whatId),
            WhoId = parseId(request.whoId),
            Description = request.description
        );
        update updatedRow;
        return updatedRow.Id;
    }

    @AuraEnabled
    public static Id deleteCalendarEvent(String recordId) {
        Id resolvedRecordId = parseId(recordId);
        if (resolvedRecordId == null) {
            throw new AuraHandledException('A calendar event id is required.');
        }

        Id runningUserId = UserInfo.getUserId();
        Boolean isSecurityAdmin = TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);

        Calendar_Event__c existingRow = [
            SELECT Id, OwnerId
            FROM Calendar_Event__c
            WHERE Id = :resolvedRecordId
            LIMIT 1
        ];

        enforceCalendarEventMutationAccess(runningUserId, isSecurityAdmin, existingRow.OwnerId);
        delete existingRow;
        return existingRow.Id;
    }

    @AuraEnabled
    public static Id deleteTask(String recordId, String calendarViewId) {
        Id resolvedRecordId = parseId(recordId);
        Id resolvedCalendarViewId = parseId(calendarViewId);

        if (resolvedRecordId == null) {
            throw new AuraHandledException('A task id is required.');
        }

        if (resolvedCalendarViewId == null) {
            throw new AuraHandledException('A calendar view context is required to delete this task.');
        }

        Id runningUserId = UserInfo.getUserId();
        Boolean isSecurityAdmin = TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);
        enforceTaskEditAccess(runningUserId, isSecurityAdmin, resolvedCalendarViewId);

        Task existingRow = [
            SELECT Id
            FROM Task
            WHERE Id = :resolvedRecordId
            LIMIT 1
        ];

        delete existingRow;
        return existingRow.Id;
    }

    private static void enforceCalendarEventMutationAccess(
        Id runningUserId,
        Boolean isSecurityAdmin,
        Id ownerId
    ) {
        if (isSecurityAdmin == true || ownerId == runningUserId) {
            return;
        }

        throw new AuraHandledException(
            'You do not have access to create or edit calendar events for another user.'
        );
    }

    private static void enforceTaskEditAccess(
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

        throw new AuraHandledException('You do not have access to edit this task.');
    }

    private static Id resolveWritableTeamCalendarId(
        Id requestedCalendarId,
        Id ownerId,
        Boolean isSecurityAdmin
    ) {
        if (ownerId == null) {
            throw new AuraHandledException('A calendar owner is required.');
        }

        if (requestedCalendarId != null) {
            List<Team_Calendar__c> requestedRows = [
                SELECT Id, OwnerId
                FROM Team_Calendar__c
                WHERE Id = :requestedCalendarId
                LIMIT 1
            ];

            if (!requestedRows.isEmpty() && requestedRows[0].OwnerId == ownerId) {
                return requestedRows[0].Id;
            }
        }

        List<Team_Calendar__c> ownerRows = [
            SELECT Id
            FROM Team_Calendar__c
            WHERE OwnerId = :ownerId
            ORDER BY Name
            LIMIT 1
        ];
        if (!ownerRows.isEmpty()) {
            return ownerRows[0].Id;
        }

        if (ownerId != UserInfo.getUserId() && isSecurityAdmin != true) {
            throw new AuraHandledException(
                'A writable team calendar could not be found for the selected owner.'
            );
        }

        User ownerRow = [
            SELECT Id, Name
            FROM User
            WHERE Id = :ownerId
            LIMIT 1
        ];

        Team_Calendar__c createdRow = new Team_Calendar__c(
            Name = ownerRow.Name + ' Calendar',
            OwnerId = ownerId,
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = false
        );
        insert createdRow;
        return createdRow.Id;
    }

    private static Calendar_Event__c buildCalendarEventRow(
        CalendarEventMutationInput inputRow,
        Id recordId,
        Id calendarId,
        Id ownerId
    ) {
        if (inputRow == null) {
            throw new AuraHandledException('A calendar event payload is required.');
        }

        Calendar_Event__c row = new Calendar_Event__c();
        row.Id = recordId;
        row.Name = inputRow.name;
        row.Calendar__c = calendarId;
        row.OwnerId = ownerId;
        row.Start__c = parseDateTime(inputRow.startValue);
        row.End__c = parseDateTime(inputRow.endValue);
        row.All_Day__c = inputRow.allDay == true;
        row.Status__c = inputRow.status;
        row.Notes__c = inputRow.notes;
        row.Appointment_Type__c = inputRow.appointmentType;
        row.Private_To_Owner__c = inputRow.privateToOwner == true;
        row.Reminder_Offset_Minutes__c = inputRow.reminderOffset;
        row.Customer_Account__c = parseId(inputRow.customerAccountId);
        row.Customer_Contact__c = parseId(inputRow.customerContactId);
        return row;
    }

    private static Id parseId(String rawValue) {
        if (String.isBlank(rawValue)) {
            return null;
        }

        try {
            return (Id) rawValue;
        } catch (Exception ex) {
            return null;
        }
    }

    private static Datetime parseDateTime(String rawValue) {
        if (String.isBlank(rawValue)) {
            return null;
        }

        try {
            return (Datetime) JSON.deserialize('"' + rawValue + '"', Datetime.class);
        } catch (Exception ex) {
            return null;
        }
    }

    private static Date parseDate(String rawValue) {
        if (String.isBlank(rawValue)) {
            return null;
        }

        try {
            return Date.valueOf(rawValue);
        } catch (Exception ex) {
            return null;
        }
    }
}