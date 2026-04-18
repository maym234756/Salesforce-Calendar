/**
 * @description       : Creates and manages reminder tasks for Team Calendar events.
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             :
 * @last modified on  : 04-15-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public without sharing class TeamCalendarReminderService {
    @TestVisible private static final String REMINDER_SUBJECT_PREFIX = 'Calendar Reminder: ';
    private static final Set<String> ELIGIBLE_STATUSES = new Set<String>{ 'Planned', 'Confirmed' };
    private static final Integer MAX_LOOKBACK_DAYS = 30;
    private static final Integer MAX_LOOKAHEAD_DAYS = 1;

    public static void prepareForSave(
        List<Calendar_Event__c> newRows,
        Map<Id, Calendar_Event__c> oldRowsById
    ) {
        if (newRows == null || newRows.isEmpty()) {
            return;
        }

        for (Calendar_Event__c row : newRows) {
            Calendar_Event__c oldRow =
                oldRowsById != null && row.Id != null ? oldRowsById.get(row.Id) : null;

            if (oldRow == null) {
                row.Reminder_Sent_At__c = null;
                continue;
            }

            if (hasReminderRelevantChanges(row, oldRow) || !isReminderEligible(row)) {
                row.Reminder_Sent_At__c = null;
            }
        }
    }

    public static void cleanupReminderTasks(
        List<Calendar_Event__c> newRows,
        Map<Id, Calendar_Event__c> oldRowsById
    ) {
        if (newRows == null || newRows.isEmpty() || oldRowsById == null || oldRowsById.isEmpty()) {
            return;
        }

        Set<Id> eventIdsToClean = new Set<Id>();

        for (Calendar_Event__c row : newRows) {
            Calendar_Event__c oldRow = oldRowsById.get(row.Id);
            if (oldRow == null) {
                continue;
            }

            if (hasReminderRelevantChanges(row, oldRow) || !isReminderEligible(row)) {
                eventIdsToClean.add(row.Id);
            }
        }

        if (eventIdsToClean.isEmpty()) {
            return;
        }

        String subjectLikePattern = buildReminderSubjectLikePattern();

        List<Task> tasksToDelete = [
            SELECT Id
            FROM Task
            WHERE WhatId IN :eventIdsToClean
            AND Subject LIKE :subjectLikePattern
            AND IsClosed = false
        ];

        if (!tasksToDelete.isEmpty()) {
            Database.delete(tasksToDelete, false);
        }
    }

    public static Integer processDueReminders(Datetime runAt) {
        Datetime effectiveRunAt = runAt == null ? System.now() : runAt;
        Datetime lowerBound = effectiveRunAt.addDays(-MAX_LOOKBACK_DAYS);
        Datetime upperBound = effectiveRunAt.addDays(MAX_LOOKAHEAD_DAYS);

        List<Calendar_Event__c> candidateRows = [
            SELECT Id,
                   Name,
                   OwnerId,
                   Start__c,
                   End__c,
                   Calendar__c,
                   Calendar__r.Name,
                   Notes__c,
                   Status__c,
                   Reminder_Offset_Minutes__c,
                   Reminder_Sent_At__c
            FROM Calendar_Event__c
            WHERE Reminder_Offset_Minutes__c != null
            AND Reminder_Offset_Minutes__c != 'None'
            AND Reminder_Sent_At__c = null
            AND Start__c != null
            AND OwnerId != null
            AND Status__c IN :ELIGIBLE_STATUSES
            AND Start__c >= :lowerBound
            AND Start__c <= :upperBound
            ORDER BY Start__c ASC
            LIMIT 500
        ];

        if (candidateRows.isEmpty()) {
            return 0;
        }

        Set<Id> candidateIds = new Set<Id>();
        for (Calendar_Event__c row : candidateRows) {
            candidateIds.add(row.Id);
        }

        Set<Id> existingTaskEventIds = new Set<Id>();
        String subjectLikePattern = buildReminderSubjectLikePattern();
        for (Task row : [
            SELECT Id, WhatId
            FROM Task
            WHERE WhatId IN :candidateIds
            AND Subject LIKE :subjectLikePattern
            AND IsClosed = false
        ]) {
            if (row.WhatId != null) {
                existingTaskEventIds.add(row.WhatId);
            }
        }

        List<Task> tasksToInsert = new List<Task>();
        List<Calendar_Event__c> sourceRowsByInsertOrder = new List<Calendar_Event__c>();
        List<Calendar_Event__c> rowsToMarkSent = new List<Calendar_Event__c>();

        for (Calendar_Event__c row : candidateRows) {
            Datetime reminderAt = calculateReminderAt(row.Start__c, row.Reminder_Offset_Minutes__c);
            if (reminderAt == null || reminderAt > effectiveRunAt) {
                continue;
            }

            if (existingTaskEventIds.contains(row.Id)) {
                rowsToMarkSent.add(new Calendar_Event__c(Id = row.Id, Reminder_Sent_At__c = effectiveRunAt));
                continue;
            }

            tasksToInsert.add(buildReminderTask(row, effectiveRunAt));
            sourceRowsByInsertOrder.add(row);
        }

        Integer createdCount = 0;
        if (!tasksToInsert.isEmpty()) {
            Database.SaveResult[] saveResults = Database.insert(tasksToInsert, false);
            for (Integer index = 0; index < saveResults.size(); index++) {
                if (!saveResults[index].isSuccess()) {
                    continue;
                }

                createdCount++;
                rowsToMarkSent.add(
                    new Calendar_Event__c(
                        Id = sourceRowsByInsertOrder[index].Id,
                        Reminder_Sent_At__c = effectiveRunAt
                    )
                );
            }
        }

        if (!rowsToMarkSent.isEmpty()) {
            Database.update(rowsToMarkSent, false);
        }

        return createdCount;
    }

    public static Integer processDueReminders() {
        return processDueReminders(System.now());
    }

    @TestVisible
    static Datetime calculateReminderAt(Datetime startValue, String reminderOffset) {
        Integer minutes = resolveReminderOffsetMinutes(reminderOffset);
        if (startValue == null || minutes == null) {
            return null;
        }

        return startValue.addMinutes(-minutes);
    }

    @TestVisible
    static Boolean hasReminderRelevantChanges(Calendar_Event__c newRow, Calendar_Event__c oldRow) {
        if (newRow == null || oldRow == null) {
            return true;
        }

        return newRow.Start__c != oldRow.Start__c ||
            newRow.OwnerId != oldRow.OwnerId ||
            newRow.Reminder_Offset_Minutes__c != oldRow.Reminder_Offset_Minutes__c ||
            newRow.Status__c != oldRow.Status__c ||
            newRow.Name != oldRow.Name ||
            newRow.Calendar__c != oldRow.Calendar__c;
    }

    @TestVisible
    static Boolean isReminderEligible(Calendar_Event__c row) {
        return row != null &&
            row.Start__c != null &&
            row.OwnerId != null &&
            resolveReminderOffsetMinutes(row.Reminder_Offset_Minutes__c) != null &&
            ELIGIBLE_STATUSES.contains(row.Status__c);
    }

    @TestVisible
    static Integer resolveReminderOffsetMinutes(String reminderOffset) {
        if (String.isBlank(reminderOffset) || reminderOffset == 'None') {
            return null;
        }

        switch on reminderOffset {
            when '15 Minutes' {
                return 15;
            }
            when '30 Minutes' {
                return 30;
            }
            when '1 Hour' {
                return 60;
            }
            when '1 Day' {
                return 1440;
            }
            when else {
                return null;
            }
        }
    }

    private static Task buildReminderTask(Calendar_Event__c row, Datetime runAt) {
        Task reminderTask = new Task();
        reminderTask.OwnerId = row.OwnerId;
        reminderTask.WhatId = row.Id;
        reminderTask.Subject = REMINDER_SUBJECT_PREFIX + row.Name;
        reminderTask.ActivityDate = runAt.date();
        reminderTask.Description = buildReminderDescription(row);
        return reminderTask;
    }

    private static String buildReminderDescription(Calendar_Event__c row) {
        List<String> lines = new List<String>{
            'Team Calendar reminder task.',
            'Event: ' + row.Name,
            'Starts: ' + row.Start__c.format('yyyy-MM-dd h:mm a z'),
            'Reminder Preference: ' + row.Reminder_Offset_Minutes__c
        };

        if (row.End__c != null) {
            lines.add('Ends: ' + row.End__c.format('yyyy-MM-dd h:mm a z'));
        }

        if (row.Calendar__r != null && String.isNotBlank(row.Calendar__r.Name)) {
            lines.add('Calendar: ' + row.Calendar__r.Name);
        }

        if (String.isNotBlank(row.Notes__c)) {
            lines.add('Notes: ' + row.Notes__c);
        }

        return String.join(lines, '\n');
    }

    private static String buildReminderSubjectLikePattern() {
        return REMINDER_SUBJECT_PREFIX + '%';
    }
}