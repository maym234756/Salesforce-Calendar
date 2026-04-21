/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 04-09-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@IsTest
private class GoogleCalendarConnectionServiceTest {
    @IsTest
    static void getConnectionState_allowsActiveCalendarBeforeGoogleSyncFlagIsEnabled() {
        Team_Calendar__c calendarRow = createCalendar('Unconfigured Calendar', false, null);

        Test.setMock(HttpCalloutMock.class, new ConnectionProbeMock(401, '{"error":"unauthorized"}'));

        Test.startTest();
        GoogleCalendarConnectionService.ConnectionStateDTO state =
            GoogleCalendarConnectionService.getConnectionState(calendarRow.Id);
        Test.stopTest();

        System.assertEquals(true, state.configured);
        System.assertEquals(false, state.connected);
        System.assertEquals(true, state.requiresAuthentication);
        System.assertEquals('Authentication Required', state.status);
    }

    @IsTest
    static void getConnectionState_returnsConnectedWhenProbeSucceeds() {
        Team_Calendar__c calendarRow = createCalendar('Configured Calendar', true, 'team@example.com');

        Test.setMock(HttpCalloutMock.class, new ConnectionProbeMock(200, '{"id":"team@example.com"}'));

        Test.startTest();
        GoogleCalendarConnectionService.ConnectionStateDTO state =
            GoogleCalendarConnectionService.getConnectionState(calendarRow.Id);
        Test.stopTest();

        System.assertEquals(true, state.configured);
        System.assertEquals(true, state.connected);
        System.assertEquals(false, state.requiresAuthentication);
        System.assertEquals('Connected', state.status);
    }

    @IsTest
    static void getConnectionState_allowsConnectionBeforeCalendarIsChosen() {
        Team_Calendar__c calendarRow = createCalendar('Connect First Calendar', true, null);

        Test.setMock(
            HttpCalloutMock.class,
            new ConnectionProbeMock(200, '{"items":[{"id":"primary","summary":"Primary"}]}')
        );

        Test.startTest();
        GoogleCalendarConnectionService.ConnectionStateDTO state =
            GoogleCalendarConnectionService.getConnectionState(calendarRow.Id);
        Test.stopTest();

        System.assertEquals(true, state.configured);
        System.assertEquals(true, state.connected);
        System.assertEquals('Calendar Selection Required', state.status);
        System.assertEquals(0, state.googleImportCalendarIds.size());
    }

    @IsTest
    static void getConnectionState_returnsAuthenticationRequiredWhenProbeUnauthorized() {
        Team_Calendar__c calendarRow = createCalendar('Auth Calendar', true, 'auth@example.com');

        Test.setMock(HttpCalloutMock.class, new ConnectionProbeMock(401, '{"error":"unauthorized"}'));

        Test.startTest();
        GoogleCalendarConnectionService.ConnectionStateDTO state =
            GoogleCalendarConnectionService.getConnectionState(calendarRow.Id);
        Test.stopTest();

        System.assertEquals(true, state.configured);
        System.assertEquals(false, state.connected);
        System.assertEquals(true, state.requiresAuthentication);
        System.assertEquals('Authentication Required', state.status);
    }

    @IsTest
    static void getConnectionState_returnsConnectionErrorWhenProbeFails() {
        Team_Calendar__c calendarRow = createCalendar('Error Calendar', true, 'error@example.com');

        Test.setMock(HttpCalloutMock.class, new ConnectionProbeMock(500, '{"error":"server"}'));

        Test.startTest();
        GoogleCalendarConnectionService.ConnectionStateDTO state =
            GoogleCalendarConnectionService.getConnectionState(calendarRow.Id);
        Test.stopTest();

        System.assertEquals(false, state.connected);
        System.assertEquals(false, state.requiresAuthentication);
        System.assertEquals('Connection Error', state.status);
    }

    @IsTest
    static void getConnectionState_detectsAuthenticationExceptions() {
        Team_Calendar__c calendarRow = createCalendar('Exception Auth Calendar', true, 'auth-exception@example.com');

        Test.setMock(HttpCalloutMock.class, new ConnectionProbeExceptionMock('Access token missing'));

        Test.startTest();
        GoogleCalendarConnectionService.ConnectionStateDTO state =
            GoogleCalendarConnectionService.getConnectionState(calendarRow.Id);
        Test.stopTest();

        System.assertEquals(true, state.requiresAuthentication);
        System.assertEquals('Authentication Required', state.status);
    }

    @IsTest
    static void authAndDisconnect_throwFastWhenCalendarSetupIsIncomplete() {
        Team_Calendar__c disabledCalendar = createCalendar('Disabled Calendar', false, null);

        Boolean authFailed = false;
        Boolean disconnectFailed = false;

        try {
            GoogleCalendarConnectionService.OperationResult authResult =
                GoogleCalendarConnectionService.getAuthenticationUrl(disabledCalendar.Id);
            authFailed = authResult == null || authResult.success == false;
        } catch (Exception ex) {
            authFailed = true;
        }

        try {
            GoogleCalendarConnectionService.OperationResult disconnectResult =
                GoogleCalendarConnectionService.disconnectGoogle(disabledCalendar.Id);
            disconnectFailed = disconnectResult == null || disconnectResult.success == false;
        } catch (Exception ex) {
            disconnectFailed = true;
        }

        System.assertEquals(true, authFailed, 'Expected Google auth setup to fail for an incomplete calendar.');
        System.assertEquals(true, disconnectFailed, 'Expected Google disconnect to fail for an incomplete calendar.');
    }

    @IsTest
    static void authAndDisconnect_returnHandledErrorsWhenCredentialMetadataIsMissing() {
        Team_Calendar__c calendarRow = createCalendar('Enabled Calendar', true, null);

        Test.startTest();
        GoogleCalendarConnectionService.OperationResult authResult =
            GoogleCalendarConnectionService.getAuthenticationUrl(calendarRow.Id);
        GoogleCalendarConnectionService.OperationResult disconnectResult =
            GoogleCalendarConnectionService.disconnectGoogle(calendarRow.Id);
        Test.stopTest();

        System.assertEquals(false, authResult.success);
        System.assertEquals(false, disconnectResult.success);
        System.assertEquals(true, String.isNotBlank(authResult.message));
        System.assertEquals(true, String.isNotBlank(disconnectResult.message));
    }

    @IsTest
    static void extractAuthenticationUrl_prefersAuthenticationUrlAndFallsBackToUrl() {
        ConnectApi.OAuthCredentialAuthUrl currentShape =
            (ConnectApi.OAuthCredentialAuthUrl) JSON.deserialize(
                '{"authenticationUrl":"https://example.com/current"}',
                ConnectApi.OAuthCredentialAuthUrl.class
            );
        ConnectApi.OAuthCredentialAuthUrl legacyShape =
            (ConnectApi.OAuthCredentialAuthUrl) JSON.deserialize(
                '{"url":"https://example.com/legacy"}',
                ConnectApi.OAuthCredentialAuthUrl.class
            );

        System.assertEquals(
            'https://example.com/current',
            GoogleCalendarConnectionService.extractAuthenticationUrl(currentShape)
        );
        System.assertEquals(
            'https://example.com/legacy',
            GoogleCalendarConnectionService.extractAuthenticationUrl(legacyShape)
        );
        System.assertEquals(null, GoogleCalendarConnectionService.extractAuthenticationUrl(null));
    }

    @IsTest
    static void listAvailableCalendars_returnsWritableGoogleCalendars() {
        Team_Calendar__c calendarRow = createCalendar('List Calendar', true, 'team@example.com');
        calendarRow.Google_Import_Calendar_Ids__c = '["primary"]';
        update calendarRow;

        Test.setMock(
            HttpCalloutMock.class,
            new ConnectionProbeMock(
                200,
                '{"items":[{"id":"team@example.com","summary":"Team Calendar","primary":false,"accessRole":"owner"},{"id":"primary","summary":"My Calendar","primary":true,"accessRole":"owner"}]}'
            )
        );

        Test.startTest();
        List<GoogleCalendarConnectionService.GoogleCalendarOptionDTO> rows =
            GoogleCalendarConnectionService.listAvailableCalendars(calendarRow.Id);
        Test.stopTest();

        System.assertEquals(2, rows.size());
        System.assertEquals('team@example.com', rows[0].id);
        System.assertEquals(true, rows[0].selected);
        System.assertEquals(true, rows[1].primary);
        System.assertEquals(true, rows[1].selectedForImport);
    }

    @IsTest
    static void listAvailableCalendars_throwsHandledErrorWhenGoogleReturnsFailure() {
        Team_Calendar__c calendarRow = createCalendar('List Failure Calendar', true, null);
        Test.setMock(HttpCalloutMock.class, new ConnectionProbeMock(403, '{"error":"forbidden"}'));

        Boolean threw = false;

        Test.startTest();
        try {
            GoogleCalendarConnectionService.listAvailableCalendars(calendarRow.Id);
        } catch (AuraHandledException ex) {
            threw = true;
        }
        Test.stopTest();

        System.assertEquals(true, threw);
    }

    @IsTest
    static void saveCalendarSelection_updatesTeamCalendar() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Team_Calendar__c calendarRow = createCalendar('Save Calendar', true, null);
        GoogleCalendarConnectionService.OperationResult result;

        Test.startTest();
        System.runAs(securityAdmin) {
            result = GoogleCalendarConnectionService.saveCalendarSelection(calendarRow.Id, 'chosen@example.com');
        }
        Test.stopTest();

        Team_Calendar__c updatedRow = [
            SELECT Google_Sync_Enabled__c, Google_Calendar_Id__c
            FROM Team_Calendar__c
            WHERE Id = :calendarRow.Id
            LIMIT 1
        ];

        System.assertEquals(true, result.success);
        System.assertEquals(true, updatedRow.Google_Sync_Enabled__c);
        System.assertEquals('chosen@example.com', updatedRow.Google_Calendar_Id__c);
    }

    @IsTest
    static void saveCalendarSelection_clearsTeamCalendarGoogleId() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Team_Calendar__c calendarRow = createCalendar('Clear Calendar', true, 'existing@example.com');
        GoogleCalendarConnectionService.OperationResult result;

        Test.startTest();
        System.runAs(securityAdmin) {
            result = GoogleCalendarConnectionService.saveCalendarSelection(calendarRow.Id, '   ');
        }
        Test.stopTest();

        Team_Calendar__c updatedRow = [
            SELECT Google_Sync_Enabled__c, Google_Calendar_Id__c
            FROM Team_Calendar__c
            WHERE Id = :calendarRow.Id
            LIMIT 1
        ];

        System.assertEquals(true, result.success);
        System.assertEquals(true, updatedRow.Google_Sync_Enabled__c);
        System.assertEquals(null, updatedRow.Google_Calendar_Id__c);
    }

    @IsTest
    static void saveImportCalendarSelections_updatesTeamCalendar() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Team_Calendar__c calendarRow = createCalendar('Import Save Calendar', true, 'existing@example.com');
        GoogleCalendarConnectionService.OperationResult result;

        Test.startTest();
        System.runAs(securityAdmin) {
            result = GoogleCalendarConnectionService.saveImportCalendarSelections(
                calendarRow.Id,
                new List<String>{ 'primary', 'team@example.com', 'primary' }
            );
        }
        Test.stopTest();

        Team_Calendar__c updatedRow = [
            SELECT Google_Sync_Enabled__c, Google_Import_Calendar_Ids__c
            FROM Team_Calendar__c
            WHERE Id = :calendarRow.Id
            LIMIT 1
        ];

        System.assertEquals(true, result.success);
        System.assertEquals(true, updatedRow.Google_Sync_Enabled__c);
        System.assertEquals('["primary","team@example.com"]', updatedRow.Google_Import_Calendar_Ids__c);
    }

    @IsTest
    static void saveImportCalendarSelections_clearsSelection() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Team_Calendar__c calendarRow = createCalendar('Import Clear Calendar', true, 'existing@example.com');
        calendarRow.Google_Import_Calendar_Ids__c = '["primary"]';
        update calendarRow;
        GoogleCalendarConnectionService.OperationResult result;

        Test.startTest();
        System.runAs(securityAdmin) {
            result = GoogleCalendarConnectionService.saveImportCalendarSelections(
                calendarRow.Id,
                new List<String>()
            );
        }
        Test.stopTest();

        Team_Calendar__c updatedRow = [
            SELECT Google_Sync_Enabled__c, Google_Import_Calendar_Ids__c
            FROM Team_Calendar__c
            WHERE Id = :calendarRow.Id
            LIMIT 1
        ];

        System.assertEquals(true, result.success);
        System.assertEquals(true, updatedRow.Google_Sync_Enabled__c);
        System.assertEquals(null, updatedRow.Google_Import_Calendar_Ids__c);
    }

    private class ConnectionProbeMock implements HttpCalloutMock {
        private Integer statusCode;
        private String responseBody;

        ConnectionProbeMock(Integer statusCode, String responseBody) {
            this.statusCode = statusCode;
            this.responseBody = responseBody;
        }

        public HttpResponse respond(HttpRequest req) {
            System.assertEquals('GET', req.getMethod());
            System.assert(
                req.getEndpoint().contains('/calendar/v3/calendars/') ||
                req.getEndpoint().contains('/calendar/v3/users/me/calendarList')
            );

            HttpResponse response = new HttpResponse();
            response.setStatusCode(statusCode);
            response.setHeader('Content-Type', 'application/json');
            response.setBody(responseBody);
            return response;
        }
    }

    private class ConnectionProbeExceptionMock implements HttpCalloutMock {
        private String messageText;

        ConnectionProbeExceptionMock(String messageText) {
            this.messageText = messageText;
        }

        public HttpResponse respond(HttpRequest req) {
            throw new CalloutException(messageText);
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
}