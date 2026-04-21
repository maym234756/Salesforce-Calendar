@IsTest
private class GoogleCalendarSyncSchedulerTest {
    @IsTest
    static void execute_returnsWithoutQueueWhenDisabled() {
        try {
            GoogleCalendarSyncScheduler.setTestConfig(false, '0 0 * * * ?', true, true, 3, 30, 5);

            Test.startTest();
            (new GoogleCalendarSyncScheduler()).execute(null);
            System.assertEquals(0, Limits.getQueueableJobs());
            Test.stopTest();
        } finally {
            GoogleCalendarSyncScheduler.clearTestConfig();
        }
    }

    @IsTest
    static void execute_returnsWithoutQueueWhenNoEligibleCalendars() {
        try {
            GoogleCalendarSyncScheduler.setTestConfig(true, '0 0 * * * ?', true, true, 3, 30, 5);
            createCalendar('Disabled Sync Calendar', false, null);

            Test.startTest();
            (new GoogleCalendarSyncScheduler()).execute(null);
            System.assertEquals(0, Limits.getQueueableJobs());
            Test.stopTest();
        } finally {
            GoogleCalendarSyncScheduler.clearTestConfig();
        }
    }

    @IsTest
    static void execute_importsEventsForEligibleCalendars() {
        try {
            GoogleCalendarSyncScheduler.setTestConfig(true, '0 0 * * * ?', true, false, 3, 30, 5);

            Team_Calendar__c calendarRow = createCalendar('Scheduled Import Calendar', true, 'outbound@example.com');
            calendarRow.Google_Import_Calendar_Ids__c = '["primary"]';
            update calendarRow;

            Test.setMock(HttpCalloutMock.class, new ScheduledImportMock());

            Test.startTest();
            (new GoogleCalendarSyncScheduler()).execute(null);
            Test.stopTest();

            List<Calendar_Event__c> importedRows = [
                SELECT Name, External_Event_Id__c, Sync_Source__c, Sync_Status__c
                FROM Calendar_Event__c
                WHERE Calendar__c = :calendarRow.Id
                  AND Sync_Source__c = 'Google'
            ];

            System.assertEquals(1, importedRows.size());
            System.assertEquals('scheduled-import-id', importedRows[0].External_Event_Id__c);
            System.assertEquals('Imported', importedRows[0].Sync_Status__c);
        } finally {
            GoogleCalendarSyncScheduler.clearTestConfig();
        }
    }

    @IsTest
    static void loadEligibleCalendarIds_respectsConfiguredDirections() {
        Team_Calendar__c exportCalendar = createCalendar('Export Calendar', true, 'export@example.com');
        Team_Calendar__c importCalendar = createCalendar('Import Calendar', true, null);
        importCalendar.Google_Import_Calendar_Ids__c = '["primary"]';
        update importCalendar;
        createCalendar('Ignored Calendar', true, null);

        try {
            GoogleCalendarSyncScheduler.setTestConfig(true, '0 0 * * * ?', true, false, 3, 30, 5);
            Set<Id> importIds = new Set<Id>(GoogleCalendarSyncScheduler.loadEligibleCalendarIds());
            System.assertEquals(new Set<Id>{ importCalendar.Id }, importIds);

            GoogleCalendarSyncScheduler.setTestConfig(true, '0 0 * * * ?', false, true, 3, 30, 5);
            Set<Id> exportIds = new Set<Id>(GoogleCalendarSyncScheduler.loadEligibleCalendarIds());
            System.assertEquals(new Set<Id>{ exportCalendar.Id }, exportIds);
        } finally {
            GoogleCalendarSyncScheduler.clearTestConfig();
        }
    }

    @IsTest
    static void scheduleConfiguredJob_replacesExistingJobUsingDefaultConfig() {
        GoogleCalendarSyncScheduler.clearTestConfig();

        Test.startTest();
        Id originalJobId = System.schedule(
            GoogleCalendarSyncScheduler.JOB_NAME,
            '0 0 12 * * ? 2099',
            new GoogleCalendarSyncScheduler()
        );
        Id replacementJobId = GoogleCalendarSyncScheduler.scheduleConfiguredJob();
        List<CronTrigger> activeJobs = [
            SELECT Id, State, CronExpression, CronJobDetail.Name
            FROM CronTrigger
            WHERE CronJobDetail.Name = :GoogleCalendarSyncScheduler.JOB_NAME
              AND State != 'DELETED'
        ];
        Test.stopTest();

        System.assertNotEquals(null, originalJobId);
        System.assertNotEquals(null, replacementJobId);
        System.assertNotEquals(originalJobId, replacementJobId);
        System.assertEquals(1, activeJobs.size());
        System.assertEquals(replacementJobId, activeJobs[0].Id);
        System.assertEquals('0 0 * * * ?', activeJobs[0].CronExpression);
    }

    @IsTest
    static void scheduleConfiguredJob_usesConfiguredCronExpression() {
        try {
            GoogleCalendarSyncScheduler.setTestConfig(true, '0 15 * * * ?', true, true, 3, 30, 5);

            Test.startTest();
            Id jobId = GoogleCalendarSyncScheduler.scheduleConfiguredJob();
            CronTrigger triggerRow = [
                SELECT CronExpression, CronJobDetail.Name
                FROM CronTrigger
                WHERE Id = :jobId
                LIMIT 1
            ];
            Test.stopTest();

            System.assertEquals('0 15 * * * ?', triggerRow.CronExpression);
            System.assertEquals(GoogleCalendarSyncScheduler.JOB_NAME, triggerRow.CronJobDetail.Name);
        } finally {
            GoogleCalendarSyncScheduler.clearTestConfig();
        }
    }

    @IsTest
    static void scheduleConfiguredJob_normalizesBlankAndInvalidValues() {
        try {
            GoogleCalendarSyncScheduler.setTestConfig(true, '   ', null, null, -5, -1, 0);

            Test.startTest();
            Id jobId = GoogleCalendarSyncScheduler.scheduleConfiguredJob();
            CronTrigger triggerRow = [
                SELECT CronExpression, CronJobDetail.Name
                FROM CronTrigger
                WHERE Id = :jobId
                LIMIT 1
            ];
            Test.stopTest();

            System.assertEquals('0 0 * * * ?', triggerRow.CronExpression);
            System.assertEquals(GoogleCalendarSyncScheduler.JOB_NAME, triggerRow.CronJobDetail.Name);
        } finally {
            GoogleCalendarSyncScheduler.clearTestConfig();
        }
    }

    @IsTest
    static void scheduleConfiguredJob_returnsNullWhenDisabled() {
        try {
            GoogleCalendarSyncScheduler.setTestConfig(false, '0 0 * * * ?', true, true, 3, 30, 5);

            Test.startTest();
            Id jobId = GoogleCalendarSyncScheduler.scheduleConfiguredJob();
            Test.stopTest();

            System.assertEquals(null, jobId);
        } finally {
            GoogleCalendarSyncScheduler.clearTestConfig();
        }
    }

    @IsTest
    static void scheduledQueueable_returnsImmediatelyWhenNoCalendarsAreProvided() {
        Test.startTest();
        (new GoogleCalendarSyncScheduler.ScheduledSyncQueueable(
            new List<Id>(),
            0,
            true,
            true,
            3,
            30,
            5,
            'scheduler@example.com'
        )).execute(null);
        System.assertEquals(0, Limits.getEmailInvocations());
        System.assertEquals(0, Limits.getQueueableJobs());
        Test.stopTest();
    }

    @IsTest
    static void scheduledQueueable_sendsFailureEmailAndQueuesRemainingCalendars() {
        List<Id> calendarIds = new List<Id>();
        List<Team_Calendar__c> calendarsToUpdate = new List<Team_Calendar__c>();

        for (Integer indexValue = 0; indexValue < 6; indexValue++) {
            Team_Calendar__c calendarRow = createCalendar(
                'Queued Import Calendar ' + indexValue,
                true,
                'outbound-' + indexValue + '@example.com'
            );
            calendarRow.Google_Import_Calendar_Ids__c = '["primary"]';
            calendarsToUpdate.add(calendarRow);
            calendarIds.add(calendarRow.Id);
        }
        update calendarsToUpdate;

        Test.startTest();
        (new GoogleCalendarSyncScheduler.ScheduledSyncQueueable(
            calendarIds,
            0,
            true,
            false,
            3,
            30,
            0,
            'scheduler@example.com'
        )).execute(null);
        System.assertEquals(1, Limits.getEmailInvocations());
        System.assertEquals(1, Limits.getQueueableJobs());
        Test.stopTest();
    }

    private class ScheduledImportMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setHeader('Content-Type', 'application/json');

            if (req.getEndpoint().contains('/calendar/v3/calendars/primary/events')) {
                response.setBody(
                    '{"items":[{"id":"scheduled-import-id","status":"confirmed","summary":"Scheduled Imported Event","description":"Imported on schedule","start":{"dateTime":"2026-04-08T15:00:00Z","timeZone":"UTC"},"end":{"dateTime":"2026-04-08T16:00:00Z","timeZone":"UTC"}}]}'
                );
                return response;
            }

            response.setStatusCode(404);
            response.setBody('{"error":"unexpected endpoint"}');
            return response;
        }
    }

    private static Team_Calendar__c createCalendar(String nameValue, Boolean googleSyncEnabled, String googleCalendarId) {
        Team_Calendar__c row = new Team_Calendar__c(
            Name = nameValue,
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = googleSyncEnabled,
            Google_Calendar_Id__c = googleCalendarId
        );
        insert row;
        return row;
    }
}