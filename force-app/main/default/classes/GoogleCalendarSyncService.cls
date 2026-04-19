/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 04-09-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class GoogleCalendarSyncService {
    private static final Integer BULK_CHUNK_SIZE = 40;
    private static final Integer IMPORT_PAGE_SIZE = 250;

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

    private class EventSyncOutcome {
        public Boolean success;
        public String externalEventId;
        public String message;
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

        String targetGoogleCalendarId = resolveTargetGoogleCalendarId(
            evt,
            evt.Calendar__r.Google_Calendar_Id__c
        );
        String validationMessage = validateCalendarSync(evt, targetGoogleCalendarId);
        if (validationMessage != null) {
            result.success = false;
            result.message = validationMessage;
            return result;
        }

        EventSyncOutcome outcome = syncSingleEvent(evt, targetGoogleCalendarId);
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

        List<String> sourceCalendarIds = parseGoogleCalendarIds(calendarRow.Google_Import_Calendar_Ids__c);
        if (sourceCalendarIds.isEmpty()) {
            result.success = false;
            result.message = 'Choose at least one Google calendar to import into Salesforce.';
            return result;
        }

        Map<String, Calendar_Event__c> existingByKey = loadExistingImportedEvents(calendarId, sourceCalendarIds);
        List<Calendar_Event__c> upserts = new List<Calendar_Event__c>();
        List<String> errors = new List<String>();
        Integer processedCount = 0;

        for (String sourceCalendarId : sourceCalendarIds) {
            try {
                for (Object rawItem : loadGoogleEvents(sourceCalendarId, start, endDate)) {
                    if (!(rawItem instanceof Map<String, Object>)) {
                        continue;
                    }

                    Map<String, Object> item = (Map<String, Object>) rawItem;
                    String externalEventId = (String) item.get('id');
                    if (String.isBlank(externalEventId)) {
                        continue;
                    }

                    String eventKey = buildImportEventKey(sourceCalendarId, externalEventId);
                    Calendar_Event__c row = existingByKey.get(eventKey);

                    if (((String) item.get('status')) == 'cancelled') {
                        if (row != null) {
                            applyImportedGoogleEvent(row, calendarId, sourceCalendarId, item, true);
                            upserts.add(row);
                            processedCount++;
                        }
                        continue;
                    }

                    if (row == null) {
                        row = new Calendar_Event__c();
                    }

                    applyImportedGoogleEvent(row, calendarId, sourceCalendarId, item, false);
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

        String soql =
            'SELECT Id ' +
            'FROM Calendar_Event__c ' +
            'WHERE Calendar__c = :calendarId';

        if (start != null) {
            soql += ' AND (End__c = NULL OR End__c >= :start)';
        }

        if (endDate != null) {
            soql += ' AND Start__c <= :endDate';
        }

        soql += ' ORDER BY Start__c ASC LIMIT 50000';

        List<Calendar_Event__c> rows = Database.query(soql);

        if (rows.isEmpty()) {
            result.success = true;
            result.message = 'No events found to sync for the selected range.';
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
        result.message = 'Google sync job queued for ' + eventIds.size() + ' events.';
        result.processedCount = eventIds.size();
        result.errorCount = 0;
        return result;
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
                EventSyncOutcome outcome = syncSingleEvent(
                    evt,
                    resolveTargetGoogleCalendarId(evt, googleCalendarId)
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

    private static String validateCalendarSync(Calendar_Event__c evt, String targetGoogleCalendarId) {
        if (evt == null) {
            return 'Event not found.';
        }

        if (evt.Calendar__c == null) {
            return 'Event is not linked to a Team Calendar.';
        }

        if (evt.Calendar__r.Google_Sync_Enabled__c != true) {
            return 'Google sync is not enabled for this Team Calendar.';
        }

        if (String.isBlank(targetGoogleCalendarId)) {
            return 'No Google calendar is configured for this event.';
        }

        return null;
    }

    private static String resolveTargetGoogleCalendarId(
        Calendar_Event__c evt,
        String defaultGoogleCalendarId
    ) {
        if (
            evt != null &&
            evt.Sync_Source__c == 'Google' &&
            !String.isBlank(evt.Google_Source_Calendar_Id__c)
        ) {
            return evt.Google_Source_Calendar_Id__c;
        }

        return defaultGoogleCalendarId;
    }

    private static EventSyncOutcome syncSingleEvent(Calendar_Event__c evt, String googleCalendarId) {
        EventSyncOutcome outcome = new EventSyncOutcome();

        if (evt == null) {
            outcome.success = false;
            outcome.message = 'Event not found.';
            return outcome;
        }

        HttpRequest req = new HttpRequest();
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(20000);

        String encodedCalendarId = EncodingUtil.urlEncode(googleCalendarId, 'UTF-8');
        Boolean isInsert = String.isBlank(evt.External_Event_Id__c);

        if (isInsert) {
            req.setMethod('POST');
            req.setEndpoint(
                'callout:' + GoogleCalendarConnectionService.NAMED_CREDENTIAL_DEVELOPER_NAME +
                '/calendar/v3/calendars/' + encodedCalendarId + '/events'
            );
        } else {
            String encodedEventId = EncodingUtil.urlEncode(evt.External_Event_Id__c, 'UTF-8');
            req.setMethod('PATCH');
            req.setEndpoint(
                'callout:' + GoogleCalendarConnectionService.NAMED_CREDENTIAL_DEVELOPER_NAME +
                '/calendar/v3/calendars/' + encodedCalendarId + '/events/' + encodedEventId
            );
        }

        Map<String, Object> payload = new Map<String, Object>();
        payload.put('summary', evt.Name);

        if (!String.isBlank(evt.Notes__c)) {
            payload.put('description', evt.Notes__c);
        }

        if (evt.All_Day__c == true) {
            if (evt.Start__c == null) {
                outcome.success = false;
                outcome.message = 'Start is required for all-day events.';
                return outcome;
            }

            Date startDate = evt.Start__c.date();
            Date endDateValue = evt.End__c != null ? evt.End__c.date() : startDate;

            if (endDateValue <= startDate) {
                endDateValue = startDate.addDays(1);
            }

            payload.put('start', new Map<String, Object>{ 'date' => String.valueOf(startDate) });
            payload.put('end', new Map<String, Object>{ 'date' => String.valueOf(endDateValue) });
        } else {
            if (evt.Start__c == null || evt.End__c == null) {
                outcome.success = false;
                outcome.message = 'Start and End are required for timed events.';
                return outcome;
            }

            payload.put(
                'start',
                new Map<String, Object>{
                    'dateTime' => evt.Start__c.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
                    'timeZone' => 'UTC'
                }
            );
            payload.put(
                'end',
                new Map<String, Object>{
                    'dateTime' => evt.End__c.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
                    'timeZone' => 'UTC'
                }
            );
        }

        req.setBody(JSON.serialize(payload));

        try {
            Http http = new Http();
            HttpResponse res = http.send(req);
            Integer statusCode = res.getStatusCode();

            if (statusCode >= 200 && statusCode < 300) {
                Map<String, Object> responseMap =
                    (Map<String, Object>) JSON.deserializeUntyped(res.getBody());

                outcome.success = true;
                outcome.externalEventId = (String) responseMap.get('id');
                outcome.message = isInsert
                    ? 'Event created in Google Calendar.'
                    : 'Event updated in Google Calendar.';
                return outcome;
            }

            outcome.success = false;
            outcome.message = 'Google sync failed. HTTP ' + statusCode + ': ' + res.getBody();
            return outcome;
        } catch (Exception e) {
            outcome.success = false;
            outcome.message = e.getMessage();
            return outcome;
        }
    }

    private static void applyOutcome(Calendar_Event__c evt, EventSyncOutcome outcome) {
        evt.Last_Synced_At__c = System.now();

        if (outcome.success) {
            evt.External_Event_Id__c = outcome.externalEventId;
            evt.Sync_Status__c = 'Synced';
            evt.Sync_Error__c = null;
            evt.Sync_Source__c = 'Salesforce';
            return;
        }

        evt.Sync_Status__c = 'Error';
        evt.Sync_Error__c = outcome.message;
    }

    private static Map<String, Calendar_Event__c> loadExistingImportedEvents(
        Id calendarId,
        List<String> googleCalendarIds
    ) {
        Map<String, Calendar_Event__c> results = new Map<String, Calendar_Event__c>();

        if (calendarId == null || googleCalendarIds == null || googleCalendarIds.isEmpty()) {
            return results;
        }

        for (Calendar_Event__c row : [
            SELECT Id,
                   Name,
                   Start__c,
                   End__c,
                   All_Day__c,
                   Notes__c,
                   Status__c,
                   External_Event_Id__c,
                   Sync_Status__c,
                   Sync_Error__c,
                   Last_Synced_At__c,
                   Sync_Source__c,
                   Google_Source_Calendar_Id__c,
                   Calendar__c
            FROM Calendar_Event__c
            WHERE Calendar__c = :calendarId
              AND Sync_Source__c = 'Google'
              AND Google_Source_Calendar_Id__c IN :googleCalendarIds
              AND External_Event_Id__c != NULL
              LIMIT 50000
        ]) {
            results.put(buildImportEventKey(row.Google_Source_Calendar_Id__c, row.External_Event_Id__c), row);
        }

        return results;
    }

    private static final Integer MAX_IMPORT_PAGES = 40;

    private static List<Object> loadGoogleEvents(
        String googleCalendarId,
        Datetime start,
        Datetime endDate
    ) {
        List<Object> results = new List<Object>();
        String nextPageToken;
        Integer pageCount = 0;

        do {
            pageCount++;
            HttpRequest request = new HttpRequest();
            request.setMethod('GET');
            request.setEndpoint(buildGoogleImportEndpoint(googleCalendarId, start, endDate, nextPageToken));
            request.setTimeout(20000);

            HttpResponse response = new Http().send(request);
            Integer statusCode = response.getStatusCode();

            if (statusCode < 200 || statusCode >= 300) {
                throw new AuraHandledException(
                    'Unable to load Google events. HTTP ' + statusCode + ': ' + response.getBody()
                );
            }

            Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
            List<Object> items = parsed != null ? (List<Object>) parsed.get('items') : null;

            if (items != null) {
                results.addAll(items);
            }

            nextPageToken = parsed != null ? (String) parsed.get('nextPageToken') : null;
        } while (!String.isBlank(nextPageToken) && pageCount < MAX_IMPORT_PAGES);

        return results;
    }

    private static String buildGoogleImportEndpoint(
        String googleCalendarId,
        Datetime start,
        Datetime endDate,
        String nextPageToken
    ) {
        String encodedCalendarId = EncodingUtil.urlEncode(googleCalendarId, 'UTF-8');
        String endpoint =
            'callout:' + GoogleCalendarConnectionService.NAMED_CREDENTIAL_DEVELOPER_NAME +
            '/calendar/v3/calendars/' + encodedCalendarId +
            '/events?singleEvents=true&showDeleted=true&maxResults=' + IMPORT_PAGE_SIZE +
            '&fields=items(id,status,summary,description,start(date,dateTime,timeZone),end(date,dateTime,timeZone)),nextPageToken';

        if (start != null) {
            endpoint += '&timeMin=' + EncodingUtil.urlEncode(start.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''), 'UTF-8');
        }

        if (endDate != null) {
            endpoint += '&timeMax=' + EncodingUtil.urlEncode(endDate.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''), 'UTF-8');
        }

        if (String.isNotBlank(nextPageToken)) {
            endpoint += '&pageToken=' + EncodingUtil.urlEncode(nextPageToken, 'UTF-8');
        }

        return endpoint;
    }

    private static void applyImportedGoogleEvent(
        Calendar_Event__c row,
        Id calendarId,
        String googleSourceCalendarId,
        Map<String, Object> item,
        Boolean cancelled
    ) {
        Map<String, Object> startBlock = item.get('start') instanceof Map<String, Object>
            ? (Map<String, Object>) item.get('start')
            : null;
        Map<String, Object> endBlock = item.get('end') instanceof Map<String, Object>
            ? (Map<String, Object>) item.get('end')
            : null;

        row.Calendar__c = calendarId;
        row.Name = String.isBlank((String) item.get('summary')) ? 'Google Event' : (String) item.get('summary');
        row.Notes__c = (String) item.get('description');
        row.External_Event_Id__c = (String) item.get('id');
        row.Google_Source_Calendar_Id__c = googleSourceCalendarId;
        row.Sync_Source__c = 'Google';
        row.Sync_Status__c = 'Imported';
        row.Sync_Error__c = null;
        row.Last_Synced_At__c = System.now();

        if (cancelled == true) {
            row.Status__c = 'Cancelled';
            return;
        }

        if (startBlock != null && String.isNotBlank((String) startBlock.get('date'))) {
            Date startDate = parseGoogleDate((String) startBlock.get('date'));
            Date endDateValue = endBlock != null && String.isNotBlank((String) endBlock.get('date'))
                ? parseGoogleDate((String) endBlock.get('date'))
                : startDate.addDays(1);

            row.All_Day__c = true;
            row.Start__c = Datetime.newInstance(startDate, Time.newInstance(0, 0, 0, 0));
            row.End__c = Datetime.newInstance(endDateValue, Time.newInstance(0, 0, 0, 0));
        } else {
            row.All_Day__c = false;
            row.Start__c = startBlock != null && String.isNotBlank((String) startBlock.get('dateTime'))
                ? parseGoogleDateTime((String) startBlock.get('dateTime'))
                : null;
            row.End__c = endBlock != null && String.isNotBlank((String) endBlock.get('dateTime'))
                ? parseGoogleDateTime((String) endBlock.get('dateTime'))
                : null;
        }

        row.Status__c = ((String) item.get('status')) == 'confirmed' ? 'Confirmed' : 'Planned';
    }

    private static Date parseGoogleDate(String value) {
        return (Date) JSON.deserialize(JSON.serialize(value), Date.class);
    }

    private static Datetime parseGoogleDateTime(String value) {
        return (Datetime) JSON.deserialize(JSON.serialize(value), Datetime.class);
    }

    private static List<String> parseGoogleCalendarIds(String rawValue) {
        if (String.isBlank(rawValue)) {
            return new List<String>();
        }

        try {
            Object parsed = JSON.deserializeUntyped(rawValue);
            if (!(parsed instanceof List<Object>)) {
                return new List<String>();
            }

            List<String> results = new List<String>();
            for (Object value : (List<Object>) parsed) {
                if (!(value instanceof String)) {
                    continue;
                }

                String normalized = ((String) value).trim();
                if (!String.isBlank(normalized) && !results.contains(normalized)) {
                    results.add(normalized);
                }
            }

            return results;
        } catch (Exception ex) {
            return new List<String>();
        }
    }

    private static String buildImportEventKey(String googleCalendarId, String externalEventId) {
        return String.valueOf(googleCalendarId) + '::' + String.valueOf(externalEventId);
    }
}