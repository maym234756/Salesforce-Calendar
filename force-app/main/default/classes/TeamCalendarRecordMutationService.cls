public with sharing class TeamCalendarRecordMutationService {
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
        @AuraEnabled public String recurrenceRule;
    }

    public class RecurrenceScopeInput {
        @AuraEnabled public String recordId;        // Template Calendar_Event__c Id
        @AuraEnabled public String scope;           // 'this' | 'thisAndFollowing' | 'all'
        @AuraEnabled public String occurrenceDate;  // YYYY-MM-DD of the targeted occurrence
        @AuraEnabled public CalendarEventMutationInput eventData; // non-null for updates
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
        enforceCrudAccess(Calendar_Event__c.SObjectType, 'create');

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

        Calendar_Event__c existingRow;
        List<Calendar_Event__c> existingRows = [
            SELECT Id, OwnerId, Calendar__c
            FROM Calendar_Event__c
            WHERE Id = :recordId
            LIMIT 1
        ];
        if (existingRows.isEmpty()) {
            throw new AuraHandledException('The calendar event was not found or may have been deleted.');
        }
        existingRow = existingRows[0];

        enforceCalendarEventMutationAccess(runningUserId, isSecurityAdmin, existingRow.OwnerId);
        enforceCrudAccess(Calendar_Event__c.SObjectType, 'update');

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

        Calendar_Event__c existingRow;
        List<Calendar_Event__c> existingRows = [
            SELECT Id, OwnerId, Calendar__c, Name, Start__c, End__c, All_Day__c, Status__c, Notes__c
            FROM Calendar_Event__c
            WHERE Id = :resolvedRecordId
            LIMIT 1
        ];
        if (existingRows.isEmpty()) {
            throw new AuraHandledException('The calendar event was not found or may have been deleted.');
        }
        existingRow = existingRows[0];

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
        enforceCrudAccess(Task.SObjectType, 'update');

        List<Task> existingTasks = [
            SELECT Id, OwnerId
            FROM Task
            WHERE Id = :recordId
            LIMIT 1
        ];
        if (existingTasks.isEmpty()) {
            throw new AuraHandledException('The task was not found or may have been deleted.');
        }
        Task existingRow = existingTasks[0];

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

        Calendar_Event__c existingRow;
        List<Calendar_Event__c> existingRows = [
            SELECT Id, OwnerId
            FROM Calendar_Event__c
            WHERE Id = :resolvedRecordId
            LIMIT 1
        ];
        if (existingRows.isEmpty()) {
            throw new AuraHandledException('The calendar event was not found or may have been deleted.');
        }
        existingRow = existingRows[0];

        enforceCalendarEventMutationAccess(runningUserId, isSecurityAdmin, existingRow.OwnerId);
        enforceCrudAccess(Calendar_Event__c.SObjectType, 'delete');
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
        enforceCrudAccess(Task.SObjectType, 'delete');

        List<Task> existingTasks = [
            SELECT Id
            FROM Task
            WHERE Id = :resolvedRecordId
            LIMIT 1
        ];
        if (existingTasks.isEmpty()) {
            throw new AuraHandledException('The task was not found or may have been deleted.');
        }

        delete existingTasks[0];
        return existingTasks[0].Id;
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

        List<User> ownerRows2 = [
            SELECT Id, Name
            FROM User
            WHERE Id = :ownerId
            LIMIT 1
        ];
        if (ownerRows2.isEmpty()) {
            throw new AuraHandledException('The calendar owner could not be found.');
        }
        User ownerRow = ownerRows2[0];

        enforceCrudAccess(Team_Calendar__c.SObjectType, 'create');

        Team_Calendar__c createdRow = new Team_Calendar__c(
            Name = ownerRow.Name + ' Calendar',
            OwnerId = ownerId,
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = false
        );

        try {
            insert createdRow;
        } catch (DmlException ex) {
            // Race condition: another transaction may have created a calendar concurrently.
            // Re-query to find the calendar that was just created.
            List<Team_Calendar__c> retryRows = [
                SELECT Id
                FROM Team_Calendar__c
                WHERE OwnerId = :ownerId
                ORDER BY Name
                LIMIT 1
            ];
            if (!retryRows.isEmpty()) {
                return retryRows[0].Id;
            }
            throw new AuraHandledException(ex.getMessage());
        }
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
        row.Recurrence_Rule__c = String.isNotBlank(inputRow.recurrenceRule)
            ? inputRow.recurrenceRule
            : null;
        return row;
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

    private static void enforceCrudAccess(Schema.SObjectType sObjectType, String operation) {
        Schema.DescribeSObjectResult describe = sObjectType.getDescribe();
        Boolean allowed = false;
        if (operation == 'create') {
            allowed = describe.isCreateable();
        } else if (operation == 'update') {
            allowed = describe.isUpdateable();
        } else if (operation == 'delete') {
            allowed = describe.isDeletable();
        }
        if (!allowed) {
            throw new AuraHandledException(
                'You do not have ' + operation + ' access to ' + describe.getLabel() + ' records.'
            );
        }
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

    // -------------------------------------------------------------------------
    // Recurring event operations
    // -------------------------------------------------------------------------

    /**
     * Update a recurring event occurrence.
     * scope='this'             — create/update a single exception record for occurrenceDate.
     * scope='thisAndFollowing' — truncate the parent series before occurrenceDate, create a
     *                           new series starting at occurrenceDate with the new data.
     * scope='all'              — update the template record (affects all future occurrences).
     */
    @AuraEnabled
    public static Id updateRecurringCalendarEvent(String requestJson) {
        RecurrenceScopeInput request = String.isBlank(requestJson)
            ? null
            : (RecurrenceScopeInput) JSON.deserialize(requestJson, RecurrenceScopeInput.class);

        if (request == null || String.isBlank(request.recordId)) {
            throw new AuraHandledException('A recurring event id is required.');
        }
        if (String.isBlank(request.scope)) {
            throw new AuraHandledException('A scope is required (this | thisAndFollowing | all).');
        }

        Id templateId = parseId(request.recordId);
        Id runningUserId = UserInfo.getUserId();
        Boolean isSecurityAdmin = TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);

        List<Calendar_Event__c> templateRows = [
            SELECT Id, OwnerId, Calendar__c, Recurrence_Rule__c, Start__c
            FROM Calendar_Event__c
            WHERE Id = :templateId
            LIMIT 1
        ];
        if (templateRows.isEmpty()) {
            throw new AuraHandledException('Recurring event template not found.');
        }
        Calendar_Event__c template = templateRows[0];
        enforceCalendarEventMutationAccess(runningUserId, isSecurityAdmin, template.OwnerId);

        if (request.scope == 'all') {
            enforceCrudAccess(Calendar_Event__c.SObjectType, 'update');
            Id resolvedCalendarId = resolveWritableTeamCalendarId(
                request.eventData != null ? parseId(request.eventData.calendarId) : template.Calendar__c,
                template.OwnerId,
                isSecurityAdmin
            );
            Calendar_Event__c updatedRow = buildCalendarEventRow(
                request.eventData, templateId, resolvedCalendarId, template.OwnerId
            );
            if (request.eventData == null || String.isBlank(request.eventData.recurrenceRule)) {
                updatedRow.Recurrence_Rule__c = template.Recurrence_Rule__c;
            }
            update updatedRow;
            return templateId;

        } else if (request.scope == 'this') {
            if (String.isBlank(request.occurrenceDate)) {
                throw new AuraHandledException('Occurrence date is required for this scope.');
            }
            List<Calendar_Event__c> existing = [
                SELECT Id
                FROM Calendar_Event__c
                WHERE Is_Recurrence_Exception__c = true
                AND Recurrence_Parent__c = :templateId
                AND Occurrence_Date__c = :request.occurrenceDate
                LIMIT 1
            ];
            Id resolvedCalendarId = resolveWritableTeamCalendarId(
                request.eventData != null ? parseId(request.eventData.calendarId) : template.Calendar__c,
                template.OwnerId,
                isSecurityAdmin
            );
            if (!existing.isEmpty()) {
                enforceCrudAccess(Calendar_Event__c.SObjectType, 'update');
                Calendar_Event__c updatedEx = buildCalendarEventRow(
                    request.eventData, existing[0].Id, resolvedCalendarId, template.OwnerId
                );
                updatedEx.Is_Recurrence_Exception__c = true;
                updatedEx.Recurrence_Parent__c = templateId;
                updatedEx.Occurrence_Date__c = request.occurrenceDate;
                updatedEx.Recurrence_Rule__c = null;
                update updatedEx;
                return existing[0].Id;
            } else {
                enforceCrudAccess(Calendar_Event__c.SObjectType, 'create');
                Calendar_Event__c exRow = buildCalendarEventRow(
                    request.eventData, null, resolvedCalendarId, template.OwnerId
                );
                exRow.Is_Recurrence_Exception__c = true;
                exRow.Recurrence_Parent__c = templateId;
                exRow.Occurrence_Date__c = request.occurrenceDate;
                exRow.Recurrence_Rule__c = null;
                insert exRow;
                return exRow.Id;
            }

        } else if (request.scope == 'thisAndFollowing') {
            if (String.isBlank(request.occurrenceDate)) {
                throw new AuraHandledException('Occurrence date is required for this scope.');
            }
            enforceCrudAccess(Calendar_Event__c.SObjectType, 'update');
            enforceCrudAccess(Calendar_Event__c.SObjectType, 'create');

            Date splitDate = Date.valueOf(request.occurrenceDate);
            Date untilDate = splitDate.addDays(-1);
            String truncatedRRule = truncateRRuleUntil(template.Recurrence_Rule__c, untilDate);
            update new Calendar_Event__c(Id = templateId, Recurrence_Rule__c = truncatedRRule);

            List<Calendar_Event__c> futureExceptions = [
                SELECT Id
                FROM Calendar_Event__c
                WHERE Is_Recurrence_Exception__c = true
                AND Recurrence_Parent__c = :templateId
                AND Occurrence_Date__c >= :request.occurrenceDate
            ];
            if (!futureExceptions.isEmpty()) {
                enforceCrudAccess(Calendar_Event__c.SObjectType, 'delete');
                delete futureExceptions;
            }

            Id resolvedCalendarId = resolveWritableTeamCalendarId(
                request.eventData != null ? parseId(request.eventData.calendarId) : template.Calendar__c,
                template.OwnerId,
                isSecurityAdmin
            );
            Calendar_Event__c newTemplate = buildCalendarEventRow(
                request.eventData, null, resolvedCalendarId, template.OwnerId
            );
            if (request.eventData == null || String.isBlank(request.eventData.recurrenceRule)) {
                newTemplate.Recurrence_Rule__c = template.Recurrence_Rule__c;
            }
            insert newTemplate;
            return newTemplate.Id;
        }

        throw new AuraHandledException('Unrecognised scope: ' + request.scope);
    }

    /**
     * Delete a recurring event occurrence.
     * scope='this'             — insert a tombstone exception (Status__c='Deleted').
     * scope='thisAndFollowing' — truncate series before occurrenceDate; delete future exceptions.
     * scope='all'              — delete template and all exception records.
     */
    @AuraEnabled
    public static Id deleteRecurringCalendarEvent(
        String recordId, String scope, String occurrenceDate
    ) {
        if (String.isBlank(recordId)) {
            throw new AuraHandledException('A recurring event id is required.');
        }
        if (String.isBlank(scope)) {
            throw new AuraHandledException('A scope is required (this | thisAndFollowing | all).');
        }

        Id templateId = parseId(recordId);
        Id runningUserId = UserInfo.getUserId();
        Boolean isSecurityAdmin = TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);

        List<Calendar_Event__c> templateRows = [
            SELECT Id, OwnerId, Calendar__c, Recurrence_Rule__c, Start__c, Name
            FROM Calendar_Event__c
            WHERE Id = :templateId
            LIMIT 1
        ];
        if (templateRows.isEmpty()) {
            throw new AuraHandledException('Recurring event template not found.');
        }
        Calendar_Event__c template = templateRows[0];
        enforceCalendarEventMutationAccess(runningUserId, isSecurityAdmin, template.OwnerId);

        if (scope == 'all') {
            enforceCrudAccess(Calendar_Event__c.SObjectType, 'delete');
            List<Calendar_Event__c> allExceptions = [
                SELECT Id FROM Calendar_Event__c WHERE Recurrence_Parent__c = :templateId
            ];
            if (!allExceptions.isEmpty()) {
                delete allExceptions;
            }
            delete template;
            return templateId;

        } else if (scope == 'this') {
            if (String.isBlank(occurrenceDate)) {
                throw new AuraHandledException('Occurrence date is required for this scope.');
            }
            List<Calendar_Event__c> existing = [
                SELECT Id, Status__c
                FROM Calendar_Event__c
                WHERE Is_Recurrence_Exception__c = true
                AND Recurrence_Parent__c = :templateId
                AND Occurrence_Date__c = :occurrenceDate
                LIMIT 1
            ];
            if (!existing.isEmpty()) {
                if (existing[0].Status__c == 'Deleted') {
                    return templateId; // already tombstoned
                }
                enforceCrudAccess(Calendar_Event__c.SObjectType, 'update');
                update new Calendar_Event__c(Id = existing[0].Id, Status__c = 'Deleted');
            } else {
                enforceCrudAccess(Calendar_Event__c.SObjectType, 'create');
                insert new Calendar_Event__c(
                    Name = template.Name != null ? template.Name : 'Deleted Occurrence',
                    Calendar__c = template.Calendar__c,
                    OwnerId = template.OwnerId,
                    Is_Recurrence_Exception__c = true,
                    Recurrence_Parent__c = templateId,
                    Occurrence_Date__c = occurrenceDate,
                    Status__c = 'Deleted',
                    Start__c = template.Start__c
                );
            }
            return templateId;

        } else if (scope == 'thisAndFollowing') {
            if (String.isBlank(occurrenceDate)) {
                throw new AuraHandledException('Occurrence date is required for this scope.');
            }
            enforceCrudAccess(Calendar_Event__c.SObjectType, 'update');
            Date splitDate = Date.valueOf(occurrenceDate);
            Date untilDate = splitDate.addDays(-1);
            update new Calendar_Event__c(
                Id = templateId,
                Recurrence_Rule__c = truncateRRuleUntil(template.Recurrence_Rule__c, untilDate)
            );
            List<Calendar_Event__c> futureExceptions = [
                SELECT Id FROM Calendar_Event__c
                WHERE Is_Recurrence_Exception__c = true
                AND Recurrence_Parent__c = :templateId
                AND Occurrence_Date__c >= :occurrenceDate
            ];
            if (!futureExceptions.isEmpty()) {
                enforceCrudAccess(Calendar_Event__c.SObjectType, 'delete');
                delete futureExceptions;
            }
            return templateId;
        }

        throw new AuraHandledException('Unrecognised scope: ' + scope);
    }

    /**
     * Truncates an RRULE by replacing/inserting UNTIL=<date> and removing any COUNT.
     * e.g., 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10' with until=2026-04-17
     *    → 'FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260417'
     */
    @TestVisible
    private static String truncateRRuleUntil(String rrule, Date untilDate) {
        if (String.isBlank(rrule)) {
            return rrule;
        }
        String untilStr = String.valueOf(untilDate.year())
            + String.valueOf(untilDate.month()).leftPad(2, '0')
            + String.valueOf(untilDate.day()).leftPad(2, '0');
        List<String> parts = new List<String>();
        for (String part : rrule.trim().split(';')) {
            if (String.isBlank(part)) { continue; }
            Integer eqIdx = part.indexOf('=');
            if (eqIdx >= 0) {
                String key = part.substring(0, eqIdx).trim().toUpperCase();
                if (key == 'COUNT' || key == 'UNTIL') { continue; }
            }
            parts.add(part);
        }
        parts.add('UNTIL=' + untilStr);
        return String.join(parts, ';');
    }
}