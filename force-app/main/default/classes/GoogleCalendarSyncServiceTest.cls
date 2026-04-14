/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 04-09-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@IsTest
private class GoogleCalendarSyncServiceTest {
    @IsTest
    static void pushEvent_timedInsert_successfullySyncsEvent() {
        Team_Calendar__c calendarRow = createCalendar('Sync Calendar', true, 'team-sync@example.com');

        Calendar_Event__c evt = createEvent(
            'Timed Event',
            calendarRow.Id,
            dt(2026, 4, 9, 9, 0),
            dt(2026, 4, 9, 10, 0),
            false,
            'Confirmed',
            null,
            'Timed notes'
        );
        insert evt;

        Test.setMock(HttpCalloutMock.class, new GoogleCalendarMock(200, 'google-event-001', false, 'POST'));

        Test.startTest();
        GoogleCalendarSyncService.SyncResult result = GoogleCalendarSyncService.pushEvent(evt.Id);
        Test.stopTest();

        System.assertEquals(true, result.success);
        System.assertEquals('google-event-001', result.externalEventId);
        System.assertEquals(1, result.processedCount);
        System.assertEquals(0, result.errorCount);

        Calendar_Event__c refreshed = [
            SELECT External_Event_Id__c, Sync_Status__c, Sync_Error__c, Sync_Source__c, Last_Synced_At__c
            FROM Calendar_Event__c
            WHERE Id = :evt.Id
        ];

        System.assertEquals('google-event-001', refreshed.External_Event_Id__c);
        System.assertEquals('Synced', refreshed.Sync_Status__c);
        System.assertEquals(null, refreshed.Sync_Error__c);
        System.assertEquals('Salesforce', refreshed.Sync_Source__c);
        System.assertNotEquals(null, refreshed.Last_Synced_At__c);
    }

    @IsTest
    static void pushEvent_allDayPatch_successfullySyncsEvent() {
        Team_Calendar__c calendarRow = createCalendar('All Day Calendar', true, 'all-day@example.com');

        Calendar_Event__c evt = createEvent(
            'All Day Event',
            calendarRow.Id,
            dt(2026, 4, 15, 0, 0),
            dt(2026, 4, 16, 0, 0),
            true,
            'Planned',
            'existing-google-event',
            'All day notes'
        );
        insert evt;

        Test.setMock(HttpCalloutMock.class, new GoogleCalendarMock(200, 'existing-google-event', true, 'PATCH'));

        Test.startTest();
        GoogleCalendarSyncService.SyncResult result = GoogleCalendarSyncService.pushEvent(evt.Id);
        Test.stopTest();

        System.assertEquals(true, result.success);
        System.assertEquals('existing-google-event', result.externalEventId);

        Calendar_Event__c refreshed = [
            SELECT External_Event_Id__c, Sync_Status__c, Sync_Error__c
            FROM Calendar_Event__c
            WHERE Id = :evt.Id
        ];

        System.assertEquals('existing-google-event', refreshed.External_Event_Id__c);
        System.assertEquals('Synced', refreshed.Sync_Status__c);
        System.assertEquals(null, refreshed.Sync_Error__c);
    }

    @IsTest
    static void pushEvent_googleImportedEventSyncsBackToItsSourceCalendar() {
        Team_Calendar__c calendarRow = createCalendar('Imported Source Calendar', true, 'default-destination@example.com');

        Calendar_Event__c evt = createEvent(
            'Imported Google Event',
            calendarRow.Id,
            dt(2026, 4, 18, 9, 0),
            dt(2026, 4, 18, 10, 0),
            false,
            'Confirmed',
            'google-imported-id',
            'Imported notes'
        );
        evt.Sync_Source__c = 'Google';
        evt.Google_Source_Calendar_Id__c = 'source-calendar@example.com';
        insert evt;

        Test.setMock(HttpCalloutMock.class, new GoogleImportedEventPatchMock());

        Test.startTest();
        GoogleCalendarSyncService.SyncResult result = GoogleCalendarSyncService.pushEvent(evt.Id);
        Test.stopTest();

        System.assertEquals(true, result.success);
    }

    @IsTest
    static void pushEvent_returnsValidationErrors() {
        System.assertEquals(
            false,
            GoogleCalendarSyncService.pushEvent(null).success,
            'Null event id should fail.'
        );

        Team_Calendar__c disabledCalendar = createCalendar('Disabled Calendar', false, 'disabled@example.com');
        Calendar_Event__c disabledEvent = createEvent(
            'Disabled Sync Event',
            disabledCalendar.Id,
            dt(2026, 4, 9, 11, 0),
            dt(2026, 4, 9, 12, 0),
            false,
            'Planned',
            null,
            null
        );
        insert disabledEvent;

        GoogleCalendarSyncService.SyncResult disabledResult =
            GoogleCalendarSyncService.pushEvent(disabledEvent.Id);
        System.assertEquals(false, disabledResult.success);
        System.assert(disabledResult.message.contains('not enabled'));

        Team_Calendar__c blankGoogleIdCalendar = createCalendar('Blank Google Id', true, null);
        Calendar_Event__c blankIdEvent = createEvent(
            'Blank Google Event',
            blankGoogleIdCalendar.Id,
            dt(2026, 4, 9, 13, 0),
            dt(2026, 4, 9, 14, 0),
            false,
            'Planned',
            null,
            null
        );
        insert blankIdEvent;

        GoogleCalendarSyncService.SyncResult blankIdResult =
            GoogleCalendarSyncService.pushEvent(blankIdEvent.Id);
        System.assertEquals(false, blankIdResult.success);
        System.assert(blankIdResult.message.contains('configured'));
    }

    @IsTest
    static void pushEvent_handlesCalloutFailureAndMarksRecordError() {
        Team_Calendar__c calendarRow = createCalendar('Error Calendar', true, 'error@example.com');

        Calendar_Event__c evt = createEvent(
            'Broken Event',
            calendarRow.Id,
            dt(2026, 4, 20, 9, 0),
            dt(2026, 4, 20, 10, 0),
            false,
            'Confirmed',
            null,
            'This should fail'
        );
        insert evt;

        Test.setMock(HttpCalloutMock.class, new GoogleCalendarErrorMock());

        Test.startTest();
        GoogleCalendarSyncService.SyncResult result = GoogleCalendarSyncService.pushEvent(evt.Id);
        Test.stopTest();

        System.assertEquals(false, result.success);
        System.assert(result.message.contains('HTTP 500'));

        Calendar_Event__c refreshed = [
            SELECT Sync_Status__c, Sync_Error__c, Last_Synced_At__c
            FROM Calendar_Event__c
            WHERE Id = :evt.Id
        ];

        System.assertEquals('Error', refreshed.Sync_Status__c);
        System.assert(refreshed.Sync_Error__c.contains('HTTP 500'));
        System.assertNotEquals(null, refreshed.Last_Synced_At__c);
    }

    @IsTest
    static void pushEventsForCalendar_queuesAndProcessesEvents() {
        Team_Calendar__c calendarRow = createCalendar('Queue Calendar', true, 'queue@example.com');

        insert new List<Calendar_Event__c>{
            createEvent(
                'Queued Event 1',
                calendarRow.Id,
                dt(2026, 4, 11, 9, 0),
                dt(2026, 4, 11, 10, 0),
                false,
                'Planned',
                null,
                'First queued event'
            ),
            createEvent(
                'Queued Event 2',
                calendarRow.Id,
                dt(2026, 4, 11, 10, 30),
                dt(2026, 4, 11, 11, 30),
                false,
                'Confirmed',
                null,
                'Second queued event'
            )
        };

        Test.setMock(HttpCalloutMock.class, new GoogleCalendarMock(200, 'queued-google-id', false, 'POST'));

        Test.startTest();
        GoogleCalendarSyncService.SyncResult result =
            GoogleCalendarSyncService.pushEventsForCalendar(calendarRow.Id, null, null);
        Test.stopTest();

        System.assertEquals(true, result.success);
        System.assertEquals(2, result.processedCount);
        System.assertEquals(0, result.errorCount);

        List<Calendar_Event__c> refreshed = [
            SELECT External_Event_Id__c, Sync_Status__c, Sync_Error__c
            FROM Calendar_Event__c
            WHERE Calendar__c = :calendarRow.Id
            ORDER BY Start__c ASC
        ];

        System.assertEquals(2, refreshed.size());
        for (Calendar_Event__c row : refreshed) {
            System.assertEquals('Synced', row.Sync_Status__c);
            System.assertEquals('queued-google-id', row.External_Event_Id__c);
            System.assertEquals(null, row.Sync_Error__c);
        }
    }

    @IsTest
    static void pushEventsForCalendar_handlesNoEventsAndBadSetup() {
        Team_Calendar__c validCalendar = createCalendar('Valid Empty Calendar', true, 'empty@example.com');

        GoogleCalendarSyncService.SyncResult emptyResult =
            GoogleCalendarSyncService.pushEventsForCalendar(validCalendar.Id, null, null);
        System.assertEquals(true, emptyResult.success);
        System.assertEquals(0, emptyResult.processedCount);

        GoogleCalendarSyncService.SyncResult nullCalendarResult =
            GoogleCalendarSyncService.pushEventsForCalendar(null, null, null);
        System.assertEquals(false, nullCalendarResult.success);
        System.assert(nullCalendarResult.message.contains('required'));

        Team_Calendar__c disabledCalendar = createCalendar('Disabled Queue Calendar', false, 'disabled-queue@example.com');
        GoogleCalendarSyncService.SyncResult disabledResult =
            GoogleCalendarSyncService.pushEventsForCalendar(disabledCalendar.Id, null, null);
        System.assertEquals(false, disabledResult.success);
        System.assert(disabledResult.message.contains('not enabled'));

        Team_Calendar__c blankGoogleIdCalendar = createCalendar('Blank Queue Calendar', true, null);
        GoogleCalendarSyncService.SyncResult blankIdResult =
            GoogleCalendarSyncService.pushEventsForCalendar(blankGoogleIdCalendar.Id, null, null);
        System.assertEquals(false, blankIdResult.success);
        System.assert(blankIdResult.message.contains('blank'));
    }

    @IsTest
    static void importEventsFromGoogle_createsAndUpdatesSalesforceEvents() {
        Team_Calendar__c calendarRow = createCalendar('Import Calendar', true, 'outbound@example.com');
        calendarRow.Google_Import_Calendar_Ids__c = '["primary","team@example.com"]';
        update calendarRow;

        Calendar_Event__c existingRow = createEvent(
            'Old Imported Event',
            calendarRow.Id,
            dt(2026, 4, 4, 8, 0),
            dt(2026, 4, 4, 9, 0),
            false,
            'Planned',
            'existing-google-event',
            'Old notes'
        );
        existingRow.Sync_Source__c = 'Google';
        existingRow.Google_Source_Calendar_Id__c = 'team@example.com';
        insert existingRow;

        Test.setMock(HttpCalloutMock.class, new GoogleImportMock());

        Test.startTest();
        GoogleCalendarSyncService.SyncResult result = GoogleCalendarSyncService.importEventsFromGoogle(
            calendarRow.Id,
            dt(2026, 4, 1, 0, 0),
            dt(2026, 4, 30, 0, 0)
        );
        Test.stopTest();

        System.assertEquals(true, result.success);
        System.assertEquals(2, result.processedCount);

        List<Calendar_Event__c> refreshed = [
            SELECT Name,
                   Notes__c,
                   Status__c,
                   External_Event_Id__c,
                   Sync_Source__c,
                   Sync_Status__c,
                   Google_Source_Calendar_Id__c,
                   All_Day__c
            FROM Calendar_Event__c
            WHERE Calendar__c = :calendarRow.Id
              AND Sync_Source__c = 'Google'
            ORDER BY External_Event_Id__c ASC
        ];

        System.assertEquals(2, refreshed.size());
        System.assertEquals('existing-google-event', refreshed[0].External_Event_Id__c);
        System.assertEquals('Updated Imported Event', refreshed[0].Name);
        System.assertEquals('Updated notes', refreshed[0].Notes__c);
        System.assertEquals('team@example.com', refreshed[0].Google_Source_Calendar_Id__c);
        System.assertEquals('Imported', refreshed[0].Sync_Status__c);

        System.assertEquals('primary-google-event', refreshed[1].External_Event_Id__c);
        System.assertEquals('Primary Google Event', refreshed[1].Name);
        System.assertEquals(true, refreshed[1].All_Day__c);
        System.assertEquals('primary', refreshed[1].Google_Source_Calendar_Id__c);
    }

    @IsTest
    static void importEventsFromGoogle_requiresSelectedCalendars() {
        Team_Calendar__c calendarRow = createCalendar('Import Validation Calendar', true, 'outbound@example.com');

        Test.startTest();
        GoogleCalendarSyncService.SyncResult result = GoogleCalendarSyncService.importEventsFromGoogle(
            calendarRow.Id,
            null,
            null
        );
        Test.stopTest();

        System.assertEquals(false, result.success);
        System.assert(result.message.contains('Choose at least one Google calendar'));
    }

    @IsTest
    static void getCalendarSyncSummary_returnsLatestSyncRow() {
        Team_Calendar__c calendarRow = createCalendar('Summary Calendar', true, 'summary@example.com');

        Calendar_Event__c olderEvent = createEvent(
            'Older Event',
            calendarRow.Id,
            dt(2026, 4, 1, 9, 0),
            dt(2026, 4, 1, 10, 0),
            false,
            'Planned',
            'old-google-id',
            null
        );
        Calendar_Event__c newerEvent = createEvent(
            'Newer Event',
            calendarRow.Id,
            dt(2026, 4, 2, 9, 0),
            dt(2026, 4, 2, 10, 0),
            false,
            'Confirmed',
            'new-google-id',
            null
        );
        insert new List<Calendar_Event__c>{ olderEvent, newerEvent };

        olderEvent.Last_Synced_At__c = dt(2026, 4, 3, 8, 0);
        olderEvent.Sync_Status__c = 'Synced';
        olderEvent.Sync_Error__c = null;

        newerEvent.Last_Synced_At__c = dt(2026, 4, 4, 8, 0);
        newerEvent.Sync_Status__c = 'Error';
        newerEvent.Sync_Error__c = 'Latest failure';

        update new List<Calendar_Event__c>{ olderEvent, newerEvent };

        Test.startTest();
        GoogleCalendarSyncService.SyncSummary summary =
            GoogleCalendarSyncService.getCalendarSyncSummary(calendarRow.Id);
        Test.stopTest();

        System.assertEquals(dt(2026, 4, 4, 8, 0), summary.lastSyncedAt);
        System.assertEquals('Error', summary.status);
        System.assertEquals('Latest failure', summary.lastError);
    }

    private class GoogleCalendarMock implements HttpCalloutMock {
        private Integer statusCode;
        private String eventId;
        private Boolean expectAllDay;
        private String expectedMethod;

        GoogleCalendarMock(Integer statusCode, String eventId, Boolean expectAllDay, String expectedMethod) {
            this.statusCode = statusCode;
            this.eventId = eventId;
            this.expectAllDay = expectAllDay;
            this.expectedMethod = expectedMethod;
        }

        public HttpResponse respond(HttpRequest req) {
            System.assertEquals(expectedMethod, req.getMethod(), 'Unexpected HTTP method.');
            System.assert(req.getEndpoint().contains('/calendar/v3/calendars/'), 'Expected Google Calendar endpoint.');

            Map<String, Object> payload =
                (Map<String, Object>) JSON.deserializeUntyped(req.getBody());

            System.assertEquals(true, payload.containsKey('summary'), 'Summary is required.');

            Map<String, Object> startBlock = (Map<String, Object>) payload.get('start');
            Map<String, Object> endBlock = (Map<String, Object>) payload.get('end');

            if (expectAllDay) {
                System.assertEquals(true, startBlock.containsKey('date'));
                System.assertEquals(true, endBlock.containsKey('date'));
                System.assertEquals(false, startBlock.containsKey('dateTime'));
            } else {
                System.assertEquals(true, startBlock.containsKey('dateTime'));
                System.assertEquals(true, endBlock.containsKey('dateTime'));
                System.assertEquals('UTC', (String) startBlock.get('timeZone'));
                System.assertEquals('UTC', (String) endBlock.get('timeZone'));
            }

            HttpResponse response = new HttpResponse();
            response.setStatusCode(statusCode);
            response.setHeader('Content-Type', 'application/json');
            response.setBody('{"id":"' + eventId + '"}');
            return response;
        }
    }

    private class GoogleCalendarErrorMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse response = new HttpResponse();
            response.setStatusCode(500);
            response.setHeader('Content-Type', 'application/json');
            response.setBody('{"error":"server failure"}');
            return response;
        }
    }

    private class GoogleImportedEventPatchMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            System.assertEquals('PATCH', req.getMethod());
            System.assert(
                req.getEndpoint().contains('/calendar/v3/calendars/source-calendar%40example.com/events/google-imported-id')
            );

            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setHeader('Content-Type', 'application/json');
            response.setBody('{"id":"google-imported-id"}');
            return response;
        }
    }

    private class GoogleImportMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            System.assertEquals('GET', req.getMethod());

            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setHeader('Content-Type', 'application/json');

            if (req.getEndpoint().contains('/calendar/v3/calendars/primary/events')) {
                response.setBody(
                    '{"items":[{"id":"primary-google-event","status":"confirmed","summary":"Primary Google Event","description":"Primary notes","start":{"date":"2026-04-08"},"end":{"date":"2026-04-09"}}]}'
                );
                return response;
            }

            if (req.getEndpoint().contains('/calendar/v3/calendars/team%40example.com/events')) {
                response.setBody(
                    '{"items":[{"id":"existing-google-event","status":"confirmed","summary":"Updated Imported Event","description":"Updated notes","start":{"dateTime":"2026-04-04T15:00:00Z","timeZone":"UTC"},"end":{"dateTime":"2026-04-04T16:00:00Z","timeZone":"UTC"}}]}'
                );
                return response;
            }

            response.setStatusCode(404);
            response.setBody('{"error":"unexpected endpoint"}');
            return response;
        }
    }

    private static Team_Calendar__c createCalendar(String nameValue, Boolean googleSyncEnabled, String googleCalendarId) {
        Team_Calendar__c row = new Team_Calendar__c();
        row.Name = nameValue;
        row.Color__c = '#0176d3';
        row.Is_Active__c = true;
        row.Google_Sync_Enabled__c = googleSyncEnabled;
        row.Google_Calendar_Id__c = googleCalendarId;
        insert row;
        return row;
    }

    private static Calendar_Event__c createEvent(
        String nameValue,
        Id calendarId,
        Datetime startValue,
        Datetime endValue,
        Boolean allDayValue,
        String statusValue,
        String externalEventId,
        String notesValue
    ) {
        Calendar_Event__c row = new Calendar_Event__c();
        row.Name = nameValue;
        row.Calendar__c = calendarId;
        row.Start__c = startValue;
        row.End__c = endValue;
        row.All_Day__c = allDayValue;
        row.Status__c = statusValue;
        row.External_Event_Id__c = externalEventId;
        row.Notes__c = notesValue;
        return row;
    }

    private static Datetime dt(Integer yearValue, Integer monthValue, Integer dayValue, Integer hourValue, Integer minuteValue) {
        return Datetime.newInstance(
            Date.newInstance(yearValue, monthValue, dayValue),
            Time.newInstance(hourValue, minuteValue, 0, 0)
        );
    }
}