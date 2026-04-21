/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 04-09-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class GoogleCalendarSyncService {
    private static final Integer BULK_CHUNK_SIZE = 40;
    private static final Long SCHEDULED_SYNC_GRACE_MILLIS = 2000;

    public class SyncResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
        @AuraEnabled public String externalEventId;
        @AuraEnabled public Integer processedCount;
        @AuraEnabled public Integer errorCount;
    }

    public class SyncSummary {
        @AuraEnabled public Datetime lastSyncedAt;
        @AuraEnabled public String status;
        @AuraEnabled public String lastError;
    }

    @AuraEnabled
    public static SyncSummary getCalendarSyncSummary(Id calendarId) {
        SyncSummary summary = new SyncSummary();

        if (calendarId == null) {
            return summary;
        }

        List<Calendar_Event__c> rows = [
            SELECT Last_Synced_At__c, Sync_Status__c, Sync_Error__c
            FROM Calendar_Event__c
            WHERE Calendar__c = :calendarId AND Last_Synced_At__c != NULL
            ORDER BY Last_Synced_At__c DESC
            LIMIT 1
        ];

        if (!rows.isEmpty()) {
            Calendar_Event__c row = rows[0];
            summary.lastSyncedAt = row.Last_Synced_At__c;
            summary.status = row.Sync_Status__c;
            summary.lastError = row.Sync_Error__c;
        }

        return summary;
    }

    @AuraEnabled
    public static SyncResult pushEvent(Id calendarEventId) {
        SyncResult result = new SyncResult();

        if (calendarEventId == null) {
            result.success = false;
            result.message = 'Calendar Event Id is required.';
            return result;
        }

        List<Calendar_Event__c> evtRows = [
            SELECT Id,
                   Name,
                   Start__c,
                   End__c,
                   All_Day__c,
                   Notes__c,
                   Status__c,
                   Is_Recurrence_Exception__c,
                   Recurrence_Rule__c,
                   External_Event_Id__c,
                   Sync_Status__c,
                   Sync_Error__c,
                   Last_Synced_At__c,
                   Sync_Source__c,
                   Google_Source_Calendar_Id__c,
                   Calendar__c,
                   Calendar__r.Name,
                   Calendar__r.Google_Sync_Enabled__c,
                   Calendar__r.Google_Calendar_Id__c
            FROM Calendar_Event__c
            WHERE Id = :calendarEventId
            LIMIT 1
        ];
        if (evtRows.isEmpty()) {
            result.success = false;
            result.message = 'Calendar Event not found or may have been deleted.';
            return result;
        }
        Calendar_Event__c evt = evtRows[0];

        String targetGoogleCalendarId = GoogleCalendarExportService.resolveTargetGoogleCalendarId(
            evt,
            evt.Calendar__r.Google_Calendar_Id__c
        );
        String validationMessage = GoogleCalendarExportService.validateCalendarSync(
            evt,
            targetGoogleCalendarId
        );
        if (validationMessage != null) {
            result.success = false;
            result.message = validationMessage;
            return result;
        }

        GoogleCalendarExportService.ExportOutcome outcome =
            GoogleCalendarExportService.syncSingleEvent(evt, targetGoogleCalendarId);
        applyOutcome(evt, outcome);
        update evt;

        result.success = outcome.success;
        result.message = outcome.message;
        result.externalEventId = outcome.externalEventId;
        result.processedCount = 1;
        result.errorCount = outcome.success ? 0 : 1;
        return result;
    }

    @AuraEnabled
    public static SyncResult importEventsFromGoogle(Id calendarId, Datetime start, Datetime endDate) {
        SyncResult result = new SyncResult();

        if (calendarId == null) {
            result.success = false;
            result.message = 'Calendar Id is required.';
            return result;
        }

        List<Team_Calendar__c> calRows = [
            SELECT Id, Name, Google_Sync_Enabled__c, Google_Import_Calendar_Ids__c
            FROM Team_Calendar__c
            WHERE Id = :calendarId
            LIMIT 1
        ];
        if (calRows.isEmpty()) {
            result.success = false;
            result.message = 'Team Calendar not found or may have been deleted.';
            return result;
        }
        Team_Calendar__c calendarRow = calRows[0];

        if (calendarRow.Google_Sync_Enabled__c != true) {
            result.success = false;
            result.message = 'Google sync is not enabled for this Team Calendar.';
            return result;
        }

        List<String> sourceCalendarIds = GoogleCalendarImportService.parseGoogleCalendarIds(
            calendarRow.Google_Import_Calendar_Ids__c
        );
        if (sourceCalendarIds.isEmpty()) {
            result.success = false;
            result.message = 'Choose at least one Google calendar to import into Salesforce.';
            return result;
        }

        Map<String, Calendar_Event__c> existingByKey =
            GoogleCalendarImportService.loadExistingImportedEvents(calendarId, sourceCalendarIds);
        List<Calendar_Event__c> upserts = new List<Calendar_Event__c>();
        List<String> errors = new List<String>();
        Integer processedCount = 0;

        for (String sourceCalendarId : sourceCalendarIds) {
            try {
                for (Object rawItem : GoogleCalendarImportService.loadGoogleEvents(sourceCalendarId, start, endDate)) {
                    if (!(rawItem instanceof Map<String, Object>)) {
                        continue;
                    }

                    Map<String, Object> item = (Map<String, Object>) rawItem;
                    String externalEventId = (String) item.get('id');
                    if (String.isBlank(externalEventId)) {
                        continue;
                    }

                    String eventKey = GoogleCalendarImportService.buildImportEventKey(
                        sourceCalendarId,
                        externalEventId
                    );
                    Calendar_Event__c row = existingByKey.get(eventKey);

                    if (((String) item.get('status')) == 'cancelled') {
                        if (row != null) {
                            GoogleCalendarImportService.applyImportedGoogleEvent(
                                row,
                                calendarId,
                                sourceCalendarId,
                                item,
                                true
                            );
                            upserts.add(row);
                            processedCount++;
                        }
                        continue;
                    }

                    if (row == null) {
                        row = new Calendar_Event__c();
                    }

                    GoogleCalendarImportService.applyImportedGoogleEvent(
                        row,
                        calendarId,
                        sourceCalendarId,
                        item,
                        false
                    );
                    upserts.add(row);
                    existingByKey.put(eventKey, row);
                    processedCount++;
                }
            } catch (Exception ex) {
                errors.add(ex.getMessage());
            }
        }

        if (!upserts.isEmpty()) {
            Database.UpsertResult[] saveResults = Database.upsert(upserts, false);
            for (Database.UpsertResult saveResult : saveResults) {
                if (!saveResult.isSuccess()) {
                    for (Database.Error rowError : saveResult.getErrors()) {
                        errors.add(rowError.getMessage());
                    }
                }
            }
        }

        result.success = errors.isEmpty();
        result.processedCount = processedCount;
        result.errorCount = errors.size();
        result.message = errors.isEmpty()
            ? 'Imported ' + processedCount + ' Google event' + (processedCount == 1 ? '' : 's') + ' into Salesforce.'
            : 'Imported ' + processedCount + ' Google event' + (processedCount == 1 ? '' : 's') + ' with ' + errors.size() + ' error' + (errors.size() == 1 ? '' : 's') + '.';
        return result;
    }

    @AuraEnabled
    public static SyncResult pushEventsForCalendar(Id calendarId, Datetime start, Datetime endDate) {
        return queueEventsForCalendar(calendarId, start, endDate, false);
    }

    public static SyncResult pushChangedEventsForCalendar(Id calendarId, Datetime start, Datetime endDate) {
        return queueEventsForCalendar(calendarId, start, endDate, true);
    }

    public static void queueMutationSync(Id calendarEventId) {
        if (calendarEventId == null) {
            return;
        }

        queueMutationSync(new List<Id>{ calendarEventId });
    }

    public static void queueMutationSync(List<Id> calendarEventIds) {
        List<Id> normalizedIds = new List<Id>();
        Set<Id> seenIds = new Set<Id>();

        for (Id eventId : calendarEventIds == null ? new List<Id>() : calendarEventIds) {
            if (eventId == null || seenIds.contains(eventId)) {
                continue;
            }

            seenIds.add(eventId);
            normalizedIds.add(eventId);
        }

        if (normalizedIds.isEmpty()) {
            return;
        }

        Map<Id, List<Id>> eventIdsByCalendar = new Map<Id, List<Id>>();
        Map<Id, String> defaultGoogleCalendarIdsByCalendar = new Map<Id, String>();

        for (Calendar_Event__c row : [
            SELECT Id,
                   Calendar__c,
                 Is_Recurrence_Exception__c,
                 External_Event_Id__c,
                   Sync_Source__c,
                   Google_Source_Calendar_Id__c,
                   Calendar__r.Google_Sync_Enabled__c,
                   Calendar__r.Google_Calendar_Id__c
            FROM Calendar_Event__c
            WHERE Id IN :normalizedIds
        ]) {
            if (row.Calendar__c == null || row.Calendar__r.Google_Sync_Enabled__c != true) {
                continue;
            }

            if (row.Is_Recurrence_Exception__c == true && String.isBlank(row.External_Event_Id__c)) {
                continue;
            }

            Boolean hasSyncTarget =
                !String.isBlank(row.Calendar__r.Google_Calendar_Id__c) ||
                (row.Sync_Source__c == 'Google' && !String.isBlank(row.Google_Source_Calendar_Id__c));
            if (hasSyncTarget != true) {
                continue;
            }

            if (!eventIdsByCalendar.containsKey(row.Calendar__c)) {
                eventIdsByCalendar.put(row.Calendar__c, new List<Id>());
            }

            eventIdsByCalendar.get(row.Calendar__c).add(row.Id);
            if (!defaultGoogleCalendarIdsByCalendar.containsKey(row.Calendar__c)) {
                defaultGoogleCalendarIdsByCalendar.put(
                    row.Calendar__c,
                    row.Calendar__r.Google_Calendar_Id__c
                );
            }
        }

        for (Id calendarId : eventIdsByCalendar.keySet()) {
            System.enqueueJob(
                new BulkGoogleSyncQueueable(
                    eventIdsByCalendar.get(calendarId),
                    calendarId,
                    defaultGoogleCalendarIdsByCalendar.get(calendarId),
                    0,
                    0,
                    0
                )
            );
        }
    }

    public static void queueDeletedEventSync(String googleCalendarId, String externalEventId) {
        if (String.isBlank(googleCalendarId) || String.isBlank(externalEventId)) {
            return;
        }

        System.enqueueJob(new DeletedGoogleSyncQueueable(googleCalendarId, externalEventId));
    }

    private static SyncResult queueEventsForCalendar(
        Id calendarId,
        Datetime start,
        Datetime endDate,
        Boolean changedOnly
    ) {
        SyncResult result = new SyncResult();

        if (calendarId == null) {
            result.success = false;
            result.message = 'Calendar Id is required.';
            return result;
        }

        List<Team_Calendar__c> calRows = [
            SELECT Id, Name, Google_Sync_Enabled__c, Google_Calendar_Id__c
            FROM Team_Calendar__c
            WHERE Id = :calendarId
            LIMIT 1
        ];
        if (calRows.isEmpty()) {
            result.success = false;
            result.message = 'Team Calendar not found or may have been deleted.';
            return result;
        }
        Team_Calendar__c calendarRow = calRows[0];

        if (calendarRow.Google_Sync_Enabled__c != true) {
            result.success = false;
            result.message = 'Google sync is not enabled for this Team Calendar.';
            return result;
        }

        if (String.isBlank(calendarRow.Google_Calendar_Id__c)) {
            result.success = false;
            result.message = 'Google Calendar ID is blank on the Team Calendar.';
            return result;
        }

        List<Calendar_Event__c> rows = loadEventsForCalendar(calendarId, start, endDate, changedOnly);

        if (rows.isEmpty()) {
            result.success = true;
            result.message = changedOnly
                ? 'No changed events found to sync for the configured schedule.'
                : 'No events found to sync for the selected range.';
            result.processedCount = 0;
            result.errorCount = 0;
            return result;
        }

        List<Id> eventIds = new List<Id>();
        for (Calendar_Event__c row : rows) {
            eventIds.add(row.Id);
        }

        System.enqueueJob(
            new BulkGoogleSyncQueueable(
                eventIds,
                calendarId,
                calendarRow.Google_Calendar_Id__c,
                0,
                0,
                0
            )
        );

        result.success = true;
        result.message = changedOnly
            ? 'Scheduled Google sync queued for ' + eventIds.size() + ' changed event' + (eventIds.size() == 1 ? '' : 's') + '.'
            : 'Google sync job queued for ' + eventIds.size() + ' events.';
        result.processedCount = eventIds.size();
        result.errorCount = 0;
        return result;
    }

    private static List<Calendar_Event__c> loadEventsForCalendar(
        Id calendarId,
        Datetime start,
        Datetime endDate,
        Boolean changedOnly
    ) {
        String soql =
            'SELECT Id, Last_Synced_At__c, Sync_Status__c, LastModifiedDate ' +
            'FROM Calendar_Event__c ' +
            'WHERE Calendar__c = :calendarId ' +
            'AND (Is_Recurrence_Exception__c = false OR Is_Recurrence_Exception__c = null OR External_Event_Id__c != null)';

        if (start != null) {
            soql += ' AND (End__c = NULL OR End__c >= :start)';
        }

        if (endDate != null) {
            soql += ' AND Start__c <= :endDate';
        }

        soql += ' ORDER BY Start__c ASC LIMIT 50000';

        List<Calendar_Event__c> rows = Database.query(soql);
        if (changedOnly != true) {
            return rows;
        }

        List<Calendar_Event__c> changedRows = new List<Calendar_Event__c>();
        for (Calendar_Event__c row : rows) {
            if (shouldQueueScheduledEvent(row)) {
                changedRows.add(row);
            }
        }
        return changedRows;
    }

    private static Boolean shouldQueueScheduledEvent(Calendar_Event__c row) {
        if (row == null) {
            return false;
        }

        if (row.Last_Synced_At__c == null) {
            return true;
        }

        if (row.Sync_Status__c == 'Error') {
            return true;
        }

        if (row.LastModifiedDate == null) {
            return false;
        }

        return row.LastModifiedDate.getTime() > (row.Last_Synced_At__c.getTime() + SCHEDULED_SYNC_GRACE_MILLIS);
    }

    public class BulkGoogleSyncQueueable implements System.Queueable, Database.AllowsCallouts {
        private List<Id> eventIds;
        private Id calendarId;
        private String googleCalendarId;
        private Integer offsetValue;
        private Integer successCount;
        private Integer errorCount;

        public BulkGoogleSyncQueueable(
            List<Id> eventIds,
            Id calendarId,
            String googleCalendarId,
            Integer offsetValue,
            Integer successCount,
            Integer errorCount
        ) {
            this.eventIds = eventIds;
            this.calendarId = calendarId;
            this.googleCalendarId = googleCalendarId;
            this.offsetValue = offsetValue;
            this.successCount = successCount;
            this.errorCount = errorCount;
        }

        public void execute(System.QueueableContext context) {
            if (eventIds == null || eventIds.isEmpty()) {
                return;
            }

            Integer startIndex = offsetValue == null ? 0 : offsetValue;
            Integer endIndex = Math.min(startIndex + BULK_CHUNK_SIZE, eventIds.size());

            List<Id> currentIds = new List<Id>();
            for (Integer indexValue = startIndex; indexValue < endIndex; indexValue++) {
                currentIds.add(eventIds[indexValue]);
            }

            List<Calendar_Event__c> events = [
                SELECT Id,
                       Name,
                       Start__c,
                       End__c,
                       All_Day__c,
                       Notes__c,
                       Status__c,
                       Is_Recurrence_Exception__c,
                       Recurrence_Rule__c,
                       External_Event_Id__c,
                       Sync_Status__c,
                       Sync_Error__c,
                       Last_Synced_At__c,
                       Sync_Source__c,
                       Google_Source_Calendar_Id__c,
                       Calendar__c
                FROM Calendar_Event__c
                WHERE Id IN :currentIds
                ORDER BY Start__c ASC
            ];

            List<Calendar_Event__c> updates = new List<Calendar_Event__c>();
            Integer localSuccessCount = successCount;
            Integer localErrorCount = errorCount;

            for (Calendar_Event__c evt : events) {
                GoogleCalendarExportService.ExportOutcome outcome =
                    GoogleCalendarExportService.syncSingleEvent(
                    evt,
                    GoogleCalendarExportService.resolveTargetGoogleCalendarId(evt, googleCalendarId)
                );
                applyOutcome(evt, outcome);
                updates.add(evt);

                if (outcome.success) {
                    localSuccessCount++;
                } else {
                    localErrorCount++;
                }
            }

            if (!updates.isEmpty()) {
                Database.update(updates, false);
            }

            if (endIndex < eventIds.size()) {
                System.enqueueJob(
                    new BulkGoogleSyncQueueable(
                        eventIds,
                        calendarId,
                        googleCalendarId,
                        endIndex,
                        localSuccessCount,
                        localErrorCount
                    )
                );
            }
        }
    }

    public class DeletedGoogleSyncQueueable implements System.Queueable, Database.AllowsCallouts {
        private String googleCalendarId;
        private String externalEventId;

        public DeletedGoogleSyncQueueable(String googleCalendarId, String externalEventId) {
            this.googleCalendarId = googleCalendarId;
            this.externalEventId = externalEventId;
        }

        public void execute(System.QueueableContext context) {
            GoogleCalendarExportService.deleteExternalEvent(
                googleCalendarId,
                externalEventId,
                'Event deleted from Google Calendar.'
            );
        }
    }

    private static void applyOutcome(
        Calendar_Event__c evt,
        GoogleCalendarExportService.ExportOutcome outcome
    ) {
        evt.Last_Synced_At__c = System.now();

        if (outcome.success) {
            evt.External_Event_Id__c = outcome.externalEventId;
            evt.Sync_Status__c = 'Synced';
            evt.Sync_Error__c = null;
            evt.Sync_Source__c = String.isBlank(evt.Google_Source_Calendar_Id__c)
                ? 'Salesforce'
                : 'Google';
            return;
        }

        evt.Sync_Status__c = 'Error';
        evt.Sync_Error__c = outcome.message;
    }
}