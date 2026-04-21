// LIVE_SMOKE_CONFIG_START
String phase = 'setup';
String baseKey = 'Live Recurring Smoke Example';
String calendarName = 'Afton Averett Calendar';
String updateOccurrenceDate = '2026-04-23';
String deleteOccurrenceDate = '2026-04-24';
String templateStartValue = '2026-04-22T15:00:00.000Z';
String templateEndValue = '2026-04-22T16:00:00.000Z';
String templateRecurrenceRule = 'FREQ=DAILY;COUNT=5';
String updateStartValue = '2026-04-23T18:00:00.000Z';
String updateEndValue = '2026-04-23T19:00:00.000Z';
String rangeStartValue = '2026-04-22T00:00:00.000Z';
String rangeEndValue = '2026-04-27T23:59:59.000Z';
// LIVE_SMOKE_CONFIG_END
String templateName = baseKey + ' Template';
String overrideName = baseKey + ' Override';
Datetime rangeStart = (Datetime) JSON.deserialize('"' + rangeStartValue + '"', Datetime.class);
Datetime rangeEnd = (Datetime) JSON.deserialize('"' + rangeEndValue + '"', Datetime.class);

public class LiveRecurringGoogleSmokeHelper {
    public String extractOriginalStart(Map<String, Object> item) {
        if (item == null) {
            return null;
        }

        Map<String, Object> originalStart = (Map<String, Object>) item.get('originalStartTime');
        if (originalStart == null) {
            return null;
        }

        String dateTimeValue = (String) originalStart.get('dateTime');
        if (String.isNotBlank(dateTimeValue)) {
            return dateTimeValue;
        }

        return (String) originalStart.get('date');
    }

    public String extractStart(Map<String, Object> item) {
        if (item == null) {
            return null;
        }

        Map<String, Object> startBlock = (Map<String, Object>) item.get('start');
        if (startBlock == null) {
            return null;
        }

        String dateTimeValue = (String) startBlock.get('dateTime');
        if (String.isNotBlank(dateTimeValue)) {
            return dateTimeValue;
        }

        return (String) startBlock.get('date');
    }

    public String extractEnd(Map<String, Object> item) {
        if (item == null) {
            return null;
        }

        Map<String, Object> endBlock = (Map<String, Object>) item.get('end');
        if (endBlock == null) {
            return null;
        }

        String dateTimeValue = (String) endBlock.get('dateTime');
        if (String.isNotBlank(dateTimeValue)) {
            return dateTimeValue;
        }

        return (String) endBlock.get('date');
    }

    public Datetime parseIsoDateTime(String rawValue) {
        if (String.isBlank(rawValue)) {
            return null;
        }

        return (Datetime) JSON.deserialize('"' + rawValue + '"', Datetime.class);
    }

    public List<Object> summarizeInstances(List<Object> rawItems) {
        List<Object> results = new List<Object>();

        for (Object rawItem : rawItems == null ? new List<Object>() : rawItems) {
            if (!(rawItem instanceof Map<String, Object>)) {
                continue;
            }

            Map<String, Object> item = (Map<String, Object>) rawItem;
            results.add(new Map<String, Object>{
                'id' => item.get('id'),
                'status' => item.get('status'),
                'recurringEventId' => item.get('recurringEventId'),
                'originalStart' => extractOriginalStart(item)
            });
        }

        return results;
    }

    public List<Object> summarizeEvents(List<Object> rawItems) {
        List<Object> results = new List<Object>();

        for (Object rawItem : rawItems == null ? new List<Object>() : rawItems) {
            if (!(rawItem instanceof Map<String, Object>)) {
                continue;
            }

            Map<String, Object> item = (Map<String, Object>) rawItem;
            results.add(new Map<String, Object>{
                'id' => item.get('id'),
                'status' => item.get('status'),
                'summary' => item.get('summary'),
                'start' => extractStart(item),
                'end' => extractEnd(item)
            });
        }

        return results;
    }

    public Map<String, Object> findInstanceForDate(List<Object> rawItems, String occurrenceDate) {
        for (Object rawItem : rawItems == null ? new List<Object>() : rawItems) {
            if (!(rawItem instanceof Map<String, Object>)) {
                continue;
            }

            Map<String, Object> item = (Map<String, Object>) rawItem;
            String originalStart = extractOriginalStart(item);
            if (String.isNotBlank(originalStart) && originalStart.startsWith(occurrenceDate)) {
                return item;
            }
        }

        return null;
    }

    public Map<String, Object> findEventById(List<Object> rawItems, String eventId) {
        for (Object rawItem : rawItems == null ? new List<Object>() : rawItems) {
            if (!(rawItem instanceof Map<String, Object>)) {
                continue;
            }

            Map<String, Object> item = (Map<String, Object>) rawItem;
            if ((String) item.get('id') == eventId) {
                return item;
            }
        }

        return null;
    }
}

LiveRecurringGoogleSmokeHelper helper = new LiveRecurringGoogleSmokeHelper();

Map<String, Object> result = new Map<String, Object>{
    'phase' => phase,
    'baseKey' => baseKey,
    'calendarName' => calendarName,
    'updateOccurrenceDate' => updateOccurrenceDate,
    'deleteOccurrenceDate' => deleteOccurrenceDate
};

if (phase == 'cleanup') {
    List<Calendar_Event__c> templateRows = [
        SELECT Id, Name, Status__c, Sync_Status__c, External_Event_Id__c
        FROM Calendar_Event__c
        WHERE Name = :templateName
        AND External_Event_Id__c != null
        ORDER BY CreatedDate DESC
        LIMIT 1
    ];

    if (templateRows.isEmpty()) {
        result.put('cleanupStatus', 'not-found');
    } else {
        Calendar_Event__c templateRow = templateRows[0];
        result.put('templateId', templateRow.Id);
        result.put('templateExternalEventId', templateRow.External_Event_Id__c);

        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'all',
            null
        );

        result.put('cleanupStatus', 'requested');
    }

    result.put(
        'remainingNamedRows',
        [SELECT COUNT() FROM Calendar_Event__c WHERE Name LIKE :baseKey + '%']
    );
} else {
    Team_Calendar__c calendarRow = [
        SELECT Id, Name, OwnerId, Google_Sync_Enabled__c, Google_Calendar_Id__c
        FROM Team_Calendar__c
        WHERE Name = :calendarName
        LIMIT 1
    ];

    System.assertEquals(true, calendarRow.Google_Sync_Enabled__c, 'Google sync must be enabled on the smoke-test calendar.');
    System.assert(String.isNotBlank(calendarRow.Google_Calendar_Id__c), 'Google calendar selection must be saved before the smoke test.');

    result.put('calendarId', calendarRow.Id);
    result.put('calendarName', calendarRow.Name);
    result.put('googleCalendarId', calendarRow.Google_Calendar_Id__c);

if (phase == 'setup') {
    System.assertEquals(
        0,
        [SELECT COUNT() FROM Calendar_Event__c WHERE Name = :templateName],
        'The smoke-test template already exists. Pick a new base key or clean up the prior run first.'
    );

    TeamCalendarRecordMutationService.CalendarEventMutationInput primaryEvent =
        new TeamCalendarRecordMutationService.CalendarEventMutationInput();
    primaryEvent.calendarId = String.valueOf(calendarRow.Id);
    primaryEvent.ownerId = String.valueOf(calendarRow.OwnerId);
    primaryEvent.name = templateName;
    primaryEvent.startValue = templateStartValue;
    primaryEvent.endValue = templateEndValue;
    primaryEvent.status = 'Planned';
    primaryEvent.allDay = false;
    primaryEvent.notes = baseKey;
    primaryEvent.recurrenceRule = templateRecurrenceRule;

    TeamCalendarRecordMutationService.CalendarEventSeriesInput createRequest =
        new TeamCalendarRecordMutationService.CalendarEventSeriesInput();
    createRequest.primaryEvent = primaryEvent;
    createRequest.followUpEvents = new List<TeamCalendarRecordMutationService.CalendarEventMutationInput>();

    TeamCalendarRecordMutationService.MutationResultDTO createResult =
        TeamCalendarRecordMutationService.createCalendarEventSeries(JSON.serialize(createRequest));
    Id templateId = createResult.recordId;

    Calendar_Event__c templateRow = [
        SELECT Id, Calendar__c, External_Event_Id__c, Sync_Status__c, Last_Synced_At__c
        FROM Calendar_Event__c
        WHERE Id = :templateId
    ];

    result.put('templateId', templateRow.Id);
    result.put('templateCalendarId', templateRow.Calendar__c);
    result.put('templateExternalEventId', templateRow.External_Event_Id__c);
    result.put('templateSyncStatus', templateRow.Sync_Status__c);
} else if (phase == 'verifyCleanup') {
    Integer remainingNamedRows = [
        SELECT COUNT()
        FROM Calendar_Event__c
        WHERE Name LIKE :baseKey + '%'
    ];
    List<Object> googleEvents = GoogleCalendarApiClient.loadCalendarEvents(
        calendarRow.Google_Calendar_Id__c,
        rangeStart,
        rangeEnd,
        100,
        5
    );
    List<Object> matchingGoogleEvents = new List<Object>();
    Integer activeGoogleEventCount = 0;

    for (Object rawItem : googleEvents == null ? new List<Object>() : googleEvents) {
        if (!(rawItem instanceof Map<String, Object>)) {
            continue;
        }

        Map<String, Object> item = (Map<String, Object>) rawItem;
        String summary = (String) item.get('summary');
        if (String.isBlank(summary) || !summary.contains(baseKey)) {
            continue;
        }

        matchingGoogleEvents.add(item);
        if ((String) item.get('status') != 'cancelled') {
            activeGoogleEventCount++;
        }
    }

    result.put('remainingNamedRows', remainingNamedRows);
    result.put('matchingGoogleEventCount', matchingGoogleEvents.size());
    result.put('activeGoogleEventCount', activeGoogleEventCount);
    result.put('matchingGoogleEvents', helper.summarizeEvents(matchingGoogleEvents));

    System.assertEquals(0, remainingNamedRows, 'Cleanup should remove all Salesforce smoke records for this base key.');
    System.assertEquals(0, activeGoogleEventCount, 'Cleanup should leave no active Google events for this base key in the verification range.');
} else {
    Calendar_Event__c templateRow;
    if (phase == 'verifyDelete') {
        templateRow = [
            SELECT Id,
                   Name,
                   Start__c,
                   End__c,
                   Status__c,
                   Sync_Status__c,
                   External_Event_Id__c,
                   Last_Synced_At__c,
                   Calendar__c,
                   Calendar__r.Google_Sync_Enabled__c,
                   Calendar__r.Google_Calendar_Id__c
            FROM Calendar_Event__c
            WHERE Name = :templateName
            AND External_Event_Id__c != null
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
    } else {
        templateRow = [
            SELECT Id,
                   Name,
                   Start__c,
                   End__c,
                   Status__c,
                   Sync_Status__c,
                   External_Event_Id__c,
                   Last_Synced_At__c,
                   Calendar__c,
                   Calendar__r.Google_Sync_Enabled__c,
                   Calendar__r.Google_Calendar_Id__c
            FROM Calendar_Event__c
            WHERE Name = :templateName
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];
    }

    result.put('templateId', templateRow.Id);
    result.put('templateExternalEventId', templateRow.External_Event_Id__c);

    if (phase == 'syncTemplate') {
        GoogleCalendarSyncService.SyncResult syncResult = GoogleCalendarSyncService.pushEvent(templateRow.Id);
        System.assertEquals(true, syncResult.success, 'Template push to Google failed: ' + syncResult.message);

        templateRow = [
            SELECT Id, External_Event_Id__c, Sync_Status__c, Last_Synced_At__c
            FROM Calendar_Event__c
            WHERE Id = :templateRow.Id
        ];

        System.assert(String.isNotBlank(templateRow.External_Event_Id__c), 'The synced series must retain the Google recurring event id.');

        result.put('templateSyncStatus', templateRow.Sync_Status__c);
        result.put('templateLastSyncedAt', templateRow.Last_Synced_At__c);
    } else if (phase == 'verifyTemplate') {
        System.assert(String.isNotBlank(templateRow.External_Event_Id__c), 'The smoke-test series must already be synced to Google.');

        List<Object> initialInstances = GoogleCalendarApiClient.loadRecurringEventInstances(
            calendarRow.Google_Calendar_Id__c,
            templateRow.External_Event_Id__c,
            rangeStart,
            rangeEnd,
            20,
            true
        );

        System.assert(initialInstances.size() >= 5, 'Expected at least five recurring instances after the initial Google push.');

        result.put('templateSyncStatus', templateRow.Sync_Status__c);
        result.put('templateLastSyncedAt', templateRow.Last_Synced_At__c);
        result.put('initialInstanceCount', initialInstances.size());
        result.put('initialInstances', helper.summarizeInstances(initialInstances));
    } else if (phase == 'update') {
        System.assert(String.isNotBlank(templateRow.External_Event_Id__c), 'The smoke-test series must already be synced to Google.');
        List<Object> initialInstances = GoogleCalendarApiClient.loadRecurringEventInstances(
            calendarRow.Google_Calendar_Id__c,
            templateRow.External_Event_Id__c,
            rangeStart,
            rangeEnd,
            20,
            true
        );
        Map<String, Object> expectedInstance = helper.findInstanceForDate(
            initialInstances,
            updateOccurrenceDate
        );
        System.assert(expectedInstance != null, 'Expected to find the Google recurring instance for the update occurrence date.');

        TeamCalendarRecordMutationService.CalendarEventMutationInput eventData =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        eventData.calendarId = String.valueOf(calendarRow.Id);
        eventData.name = overrideName;
        eventData.startValue = updateStartValue;
        eventData.endValue = updateEndValue;
        eventData.status = 'Confirmed';
        eventData.allDay = false;

        TeamCalendarRecordMutationService.RecurrenceScopeInput request =
            new TeamCalendarRecordMutationService.RecurrenceScopeInput();
        request.recordId = String.valueOf(templateRow.Id);
        request.scope = 'this';
        request.occurrenceDate = updateOccurrenceDate;
        request.eventData = eventData;

        Id exceptionId = TeamCalendarRecordMutationService.updateRecurringCalendarEvent(JSON.serialize(request));
        Calendar_Event__c exceptionRow = [
            SELECT Id,
                   Name,
                   Start__c,
                   End__c,
                   Status__c,
                   Sync_Status__c,
                   External_Event_Id__c
            FROM Calendar_Event__c
            WHERE Id = :exceptionId
        ];

        System.assertEquals(overrideName, exceptionRow.Name, 'The scope=this update should create or update the override row.');
        System.assertEquals(
            (String) expectedInstance.get('id'),
            exceptionRow.External_Event_Id__c,
            'The exception must bind to the Google instance id for the targeted occurrence.'
        );

        result.put('expectedUpdateInstanceId', expectedInstance.get('id'));
        result.put('expectedUpdateOriginalStart', helper.extractOriginalStart(expectedInstance));
        result.put('exceptionId', exceptionRow.Id);
        result.put('exceptionExternalEventId', exceptionRow.External_Event_Id__c);
        result.put('exceptionSyncStatus', exceptionRow.Sync_Status__c);
    } else if (phase == 'verifyUpdate') {
        System.assert(String.isNotBlank(templateRow.External_Event_Id__c), 'The smoke-test series must already be synced to Google.');
        Calendar_Event__c exceptionRow = [
            SELECT Id,
                   Name,
                   Start__c,
                   End__c,
                   Status__c,
                   Sync_Status__c,
                   External_Event_Id__c,
                   Last_Synced_At__c
            FROM Calendar_Event__c
            WHERE Name = :overrideName
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];

        List<Object> googleEvents = GoogleCalendarApiClient.loadCalendarEvents(
            calendarRow.Google_Calendar_Id__c,
            rangeStart,
            rangeEnd,
            100,
            5
        );
        Map<String, Object> googleEvent = helper.findEventById(
            googleEvents,
            exceptionRow.External_Event_Id__c
        );

        result.put('exceptionId', exceptionRow.Id);
        result.put('exceptionSyncStatus', exceptionRow.Sync_Status__c);
        result.put('exceptionLastSyncedAt', exceptionRow.Last_Synced_At__c);
        result.put('googleEvent', googleEvent == null ? null : new Map<String, Object>{
            'id' => googleEvent.get('id'),
            'status' => googleEvent.get('status'),
            'summary' => googleEvent.get('summary'),
            'start' => helper.extractStart(googleEvent),
            'end' => helper.extractEnd(googleEvent)
        });

        System.assertEquals('Synced', exceptionRow.Sync_Status__c, 'The queued Google exception update has not completed yet.');
        System.assert(googleEvent != null, 'The updated Google occurrence was not found in the expanded event feed.');
        System.assertEquals(overrideName, (String) googleEvent.get('summary'), 'The Google occurrence summary did not update.');
        System.assertEquals(
            helper.parseIsoDateTime(updateStartValue),
            helper.parseIsoDateTime(helper.extractStart(googleEvent)),
            'The Google occurrence start time did not update.'
        );
        System.assertEquals(
            helper.parseIsoDateTime(updateEndValue),
            helper.parseIsoDateTime(helper.extractEnd(googleEvent)),
            'The Google occurrence end time did not update.'
        );
    } else if (phase == 'delete') {
        System.assert(String.isNotBlank(templateRow.External_Event_Id__c), 'The smoke-test series must already be synced to Google.');
        List<Object> remainingInstances = GoogleCalendarApiClient.loadRecurringEventInstances(
            calendarRow.Google_Calendar_Id__c,
            templateRow.External_Event_Id__c,
            rangeStart,
            rangeEnd,
            20,
            true
        );
        Map<String, Object> expectedDeleteInstance = helper.findInstanceForDate(
            remainingInstances,
            deleteOccurrenceDate
        );
        System.assert(expectedDeleteInstance != null, 'Expected to find the Google recurring instance for the delete occurrence date.');
        String expectedDeleteInstanceId = (String) expectedDeleteInstance.get('id');

        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'this',
            deleteOccurrenceDate
        );

        Calendar_Event__c deletedException = [
            SELECT Id,
                   Status__c,
                   Sync_Status__c,
                   External_Event_Id__c
            FROM Calendar_Event__c
                 WHERE External_Event_Id__c = :expectedDeleteInstanceId
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];

        System.assertEquals('Deleted', deletedException.Status__c, 'The scope=this delete should create or update a deleted tombstone exception.');
        System.assertEquals(
            (String) expectedDeleteInstance.get('id'),
            deletedException.External_Event_Id__c,
            'The delete tombstone must bind to the Google instance id for the targeted occurrence.'
        );

        result.put('expectedDeleteInstanceId', expectedDeleteInstance.get('id'));
        result.put('expectedDeleteOriginalStart', helper.extractOriginalStart(expectedDeleteInstance));
        result.put('deletedExceptionId', deletedException.Id);
        result.put('deletedExceptionExternalEventId', deletedException.External_Event_Id__c);
        result.put('deletedExceptionSyncStatus', deletedException.Sync_Status__c);
    } else if (phase == 'verifyDelete') {
        System.assert(String.isNotBlank(templateRow.External_Event_Id__c), 'The smoke-test series must already be synced to Google.');
        List<Object> remainingInstances = GoogleCalendarApiClient.loadRecurringEventInstances(
            calendarRow.Google_Calendar_Id__c,
            templateRow.External_Event_Id__c,
            rangeStart,
            rangeEnd,
            20,
            true
        );
        Map<String, Object> deletedGoogleInstance = helper.findInstanceForDate(
            remainingInstances,
            deleteOccurrenceDate
        );

        Calendar_Event__c deletedException = [
            SELECT Id,
                   Status__c,
                   Sync_Status__c,
                   External_Event_Id__c,
                   Last_Synced_At__c
            FROM Calendar_Event__c
            WHERE Name = :templateName
            AND Status__c = 'Deleted'
            ORDER BY CreatedDate DESC
            LIMIT 1
        ];

        result.put('deletedExceptionId', deletedException.Id);
        result.put('deletedExceptionStatus', deletedException.Status__c);
        result.put('deletedExceptionSyncStatus', deletedException.Sync_Status__c);
        result.put('deletedExceptionExternalEventId', deletedException.External_Event_Id__c);
        result.put('deletedExceptionLastSyncedAt', deletedException.Last_Synced_At__c);
        result.put('deletedGoogleInstance', deletedGoogleInstance == null ? null : new Map<String, Object>{
            'id' => deletedGoogleInstance.get('id'),
            'status' => deletedGoogleInstance.get('status'),
            'originalStart' => helper.extractOriginalStart(deletedGoogleInstance)
        });

        System.assertEquals('Deleted', deletedException.Status__c, 'The Salesforce tombstone exception should stay marked deleted.');
        System.assertEquals('Synced', deletedException.Sync_Status__c, 'The queued Google delete has not completed yet.');
        System.assertEquals(null, deletedException.External_Event_Id__c, 'The synced tombstone should clear its Google instance id after the delete succeeds.');
        System.assert(deletedGoogleInstance != null, 'The deleted Google instance was not returned from the instances feed.');
        System.assertEquals('cancelled', (String) deletedGoogleInstance.get('status'), 'The Google instance was not cancelled by the scope=this delete.');
    } else {
        System.assert(false, 'Unknown phase: ' + phase);
    }
}
}

System.debug(LoggingLevel.ERROR, 'LIVE_SMOKE_RESULT=' + JSON.serializePretty(result));