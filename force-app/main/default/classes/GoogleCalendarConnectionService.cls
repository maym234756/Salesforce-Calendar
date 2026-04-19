/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 04-09-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class GoogleCalendarConnectionService {
    /*
     * Update these three constants to match your org if your developer names differ.
     * The sync service below uses the same named credential alias.
     */
    public static final String NAMED_CREDENTIAL_DEVELOPER_NAME = 'GoogleCalendar';
    public static final String EXTERNAL_CREDENTIAL_DEVELOPER_NAME = 'GoogleCalendar_ExternalCredential';
    public static final String NAMED_PRINCIPAL_NAME = 'GoogleCalendarNamedPrincipal';
    public static final String CONNECTION_MODE = 'NamedPrincipal'; // NamedPrincipal or PerUserPrincipal

    public class ConnectionStateDTO {
        @AuraEnabled public Boolean configured;
        @AuraEnabled public Boolean connected;
        @AuraEnabled public Boolean requiresAuthentication;
        @AuraEnabled public String mode;
        @AuraEnabled public String status;
        @AuraEnabled public String message;
        @AuraEnabled public String namedCredential;
        @AuraEnabled public String externalCredential;
        @AuraEnabled public String principalName;
        @AuraEnabled public String googleCalendarId;
        @AuraEnabled public List<String> googleImportCalendarIds;
    }

    public class OperationResult {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
        @AuraEnabled public String authUrl;
    }

    public class GoogleCalendarOptionDTO {
        @AuraEnabled public String id;
        @AuraEnabled public String label;
        @AuraEnabled public Boolean primary;
        @AuraEnabled public String accessRole;
        @AuraEnabled public Boolean selected;
        @AuraEnabled public Boolean selectedForImport;
    }

    @AuraEnabled
    public static ConnectionStateDTO getConnectionState(Id calendarId) {
        Team_Calendar__c calendarRow = getCalendarRow(calendarId);
        ConnectionStateDTO state = buildBaseState(calendarRow);

        if (!state.configured) {
            state.status = 'Unavailable';
            state.message = 'Google connection settings are unavailable right now.';
            return state;
        }

        try {
            HttpRequest request = new HttpRequest();
            request.setMethod('GET');
            request.setEndpoint(buildConnectionProbeEndpoint(calendarRow.Google_Calendar_Id__c));
            request.setTimeout(20000);

            HttpResponse response = new Http().send(request);
            Integer statusCode = response.getStatusCode();

            if (statusCode >= 200 && statusCode < 300) {
                state.connected = true;
                state.requiresAuthentication = false;
                state.status = String.isBlank(calendarRow.Google_Calendar_Id__c)
                    ? 'Calendar Selection Required'
                    : 'Connected';
                state.message = String.isBlank(calendarRow.Google_Calendar_Id__c)
                    ? 'Google is connected. Choose which Google calendar this Team Calendar should sync to.'
                    : 'Google connection is ready.';
                return state;
            }

            if (statusCode == 401 || statusCode == 403) {
                state.connected = false;
                state.requiresAuthentication = true;
                state.status = 'Authentication Required';
                state.message = 'Google authentication is required before sync can run.';
                return state;
            }

            state.connected = false;
            state.requiresAuthentication = false;
            state.status = 'Connection Error';
            state.message = 'Google probe returned HTTP ' + statusCode + '.';
            return state;
        } catch (Exception ex) {
            state.connected = false;

            if (looksLikeAuthenticationProblem(ex.getMessage())) {
                state.requiresAuthentication = true;
                state.status = 'Authentication Required';
                state.message = 'Google authentication is required before sync can run.';
            } else {
                state.requiresAuthentication = false;
                state.status = 'Connection Error';
                state.message = ex.getMessage();
            }

            return state;
        }
    }

    @AuraEnabled
    public static OperationResult getAuthenticationUrl(Id calendarId) {
        Team_Calendar__c calendarRow = getCalendarRow(calendarId);
        OperationResult result = new OperationResult();

        validateCalendarIsConnectable(calendarRow);

        try {
            ConnectApi.OAuthCredentialAuthUrlInput input = new ConnectApi.OAuthCredentialAuthUrlInput();
            input.externalCredential = EXTERNAL_CREDENTIAL_DEVELOPER_NAME;
            input.principalType = resolvePrincipalType();

            if (isNamedPrincipalMode()) {
                input.principalName = NAMED_PRINCIPAL_NAME;
            }

            ConnectApi.OAuthCredentialAuthUrl authUrlResponse =
                ConnectApi.NamedCredentials.getOAuthCredentialAuthUrl(input);

            Map<String, Object> payload =
                (Map<String, Object>) JSON.deserializeUntyped(JSON.serialize(authUrlResponse));

            result.authUrl = (String) payload.get('url');
            result.success = !String.isBlank(result.authUrl);
            result.message = result.success
                ? 'Open the Google authentication URL to connect this calendar.'
                : 'Google authentication URL was not returned.';
            return result;
        } catch (Exception ex) {
            result.success = false;
            result.message = ex.getMessage();
            return result;
        }
    }

    @AuraEnabled
    public static OperationResult disconnectGoogle(Id calendarId) {
        Team_Calendar__c calendarRow = getCalendarRow(calendarId);
        OperationResult result = new OperationResult();

        validateCalendarIsConnectable(calendarRow);

        try {
            if (isNamedPrincipalMode()) {
                ConnectApi.NamedCredentials.deleteCredential(
                    EXTERNAL_CREDENTIAL_DEVELOPER_NAME,
                    NAMED_PRINCIPAL_NAME,
                    ConnectApi.CredentialPrincipalType.NamedPrincipal
                );
            } else {
                ConnectApi.NamedCredentials.deleteCredential(
                    EXTERNAL_CREDENTIAL_DEVELOPER_NAME,
                    null,
                    ConnectApi.CredentialPrincipalType.PerUserPrincipal
                );
            }

            result.success = true;
            result.message = 'Google connection was disconnected.';
            return result;
        } catch (Exception ex) {
            result.success = false;
            result.message = ex.getMessage();
            return result;
        }
    }

    @AuraEnabled
    public static List<GoogleCalendarOptionDTO> listAvailableCalendars(Id calendarId) {
        Team_Calendar__c calendarRow = getCalendarRow(calendarId);
        validateCalendarIsConnectable(calendarRow);
        Set<String> selectedImportIds = new Set<String>(
            parseGoogleCalendarIds(calendarRow.Google_Import_Calendar_Ids__c)
        );

        HttpRequest request = new HttpRequest();
        request.setMethod('GET');
        request.setEndpoint(buildCalendarListEndpoint());
        request.setTimeout(20000);

        try {
            HttpResponse response = new Http().send(request);
            Integer statusCode = response.getStatusCode();

            if (statusCode < 200 || statusCode >= 300) {
                throw new AuraHandledException(
                    'Unable to load Google calendars. HTTP ' + statusCode + ': ' + response.getBody()
                );
            }

            Map<String, Object> payload =
                (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
            List<Object> rawItems = (List<Object>) payload.get('items');
            List<GoogleCalendarOptionDTO> results = new List<GoogleCalendarOptionDTO>();

            if (rawItems == null) {
                return results;
            }

            for (Object rawItem : rawItems) {
                if (!(rawItem instanceof Map<String, Object>)) {
                    continue;
                }

                Map<String, Object> item = (Map<String, Object>) rawItem;
                GoogleCalendarOptionDTO dto = new GoogleCalendarOptionDTO();
                dto.id = (String) item.get('id');
                dto.label = (String) item.get('summary');
                dto.primary = item.get('primary') == true;
                dto.accessRole = (String) item.get('accessRole');
                dto.selected = dto.id == calendarRow.Google_Calendar_Id__c;
                dto.selectedForImport = selectedImportIds.contains(dto.id);

                if (String.isBlank(dto.id) || String.isBlank(dto.label)) {
                    continue;
                }

                results.add(dto);
            }

            return results;
        } catch (AuraHandledException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new AuraHandledException(ex.getMessage());
        }
    }

    @AuraEnabled
    public static OperationResult saveCalendarSelection(Id calendarId, String googleCalendarId) {
        TeamCalendarUserPreferenceService.enforceSecurityAdmin();
        Team_Calendar__c calendarRow = getCalendarRow(calendarId);
        validateCalendarIsConnectable(calendarRow);

        OperationResult result = new OperationResult();

        calendarRow.Google_Sync_Enabled__c = true;
        calendarRow.Google_Calendar_Id__c = String.isBlank(googleCalendarId)
            ? null
            : googleCalendarId.trim();
        if (!Team_Calendar__c.SObjectType.getDescribe().isUpdateable()) {
            throw new AuraHandledException('You do not have update access to Team Calendar records.');
        }
        update calendarRow;

        result.success = true;
        result.message = String.isBlank(calendarRow.Google_Calendar_Id__c)
            ? 'Google calendar selection cleared.'
            : 'Google calendar selection saved.';
        return result;
    }

    @AuraEnabled
    public static OperationResult saveImportCalendarSelections(Id calendarId, List<String> googleCalendarIds) {
        TeamCalendarUserPreferenceService.enforceSecurityAdmin();
        Team_Calendar__c calendarRow = getCalendarRow(calendarId);
        validateCalendarIsConnectable(calendarRow);

        OperationResult result = new OperationResult();
        List<String> normalizedIds = normalizeGoogleCalendarIds(googleCalendarIds);

        calendarRow.Google_Sync_Enabled__c = true;
        calendarRow.Google_Import_Calendar_Ids__c = serializeGoogleCalendarIds(normalizedIds);
        if (!Team_Calendar__c.SObjectType.getDescribe().isUpdateable()) {
            throw new AuraHandledException('You do not have update access to Team Calendar records.');
        }
        update calendarRow;

        result.success = true;
        result.message = normalizedIds.isEmpty()
            ? 'Google import calendar selection cleared.'
            : 'Google import calendar selection saved.';
        return result;
    }

    private static ConnectionStateDTO buildBaseState(Team_Calendar__c calendarRow) {
        ConnectionStateDTO state = new ConnectionStateDTO();
        state.configured =
            calendarRow != null &&
            !String.isBlank(NAMED_CREDENTIAL_DEVELOPER_NAME) &&
            !String.isBlank(EXTERNAL_CREDENTIAL_DEVELOPER_NAME);
        state.connected = false;
        state.requiresAuthentication = false;
        state.mode = CONNECTION_MODE;
        state.status = 'Not Connected';
        state.message = 'Select Connect Google to authenticate.';
        state.namedCredential = NAMED_CREDENTIAL_DEVELOPER_NAME;
        state.externalCredential = EXTERNAL_CREDENTIAL_DEVELOPER_NAME;
        state.principalName = NAMED_PRINCIPAL_NAME;
        state.googleCalendarId = calendarRow != null ? calendarRow.Google_Calendar_Id__c : null;
        state.googleImportCalendarIds = calendarRow != null
            ? parseGoogleCalendarIds(calendarRow.Google_Import_Calendar_Ids__c)
            : new List<String>();
        return state;
    }

    private static Team_Calendar__c getCalendarRow(Id calendarId) {
        if (calendarId == null) {
            throw new AuraHandledException('Calendar Id is required.');
        }

        List<Team_Calendar__c> rows = [
            SELECT Id, Name, Google_Sync_Enabled__c, Google_Calendar_Id__c, Google_Import_Calendar_Ids__c
            FROM Team_Calendar__c
            WHERE Id = :calendarId
            LIMIT 1
        ];
        if (rows.isEmpty()) {
            throw new AuraHandledException('Team Calendar not found or may have been deleted.');
        }
        return rows[0];
    }

    private static void validateCalendarIsConnectable(Team_Calendar__c calendarRow) {
        if (calendarRow == null) {
            throw new AuraHandledException('Team Calendar not found.');
        }
    }

    private static String buildConnectionProbeEndpoint(String googleCalendarId) {
        if (String.isBlank(googleCalendarId)) {
            return buildCalendarListEndpoint() + '&maxResults=1';
        }

        String encodedCalendarId = EncodingUtil.urlEncode(googleCalendarId, 'UTF-8');
        return 'callout:' + NAMED_CREDENTIAL_DEVELOPER_NAME +
            '/calendar/v3/calendars/' + encodedCalendarId + '?fields=id,summary,timeZone';
    }

    private static String buildCalendarListEndpoint() {
        return 'callout:' + NAMED_CREDENTIAL_DEVELOPER_NAME +
            '/calendar/v3/users/me/calendarList?fields=items(id,summary,primary,accessRole)&minAccessRole=writer';
    }

    private static ConnectApi.CredentialPrincipalType resolvePrincipalType() {
        return isNamedPrincipalMode()
            ? ConnectApi.CredentialPrincipalType.NamedPrincipal
            : ConnectApi.CredentialPrincipalType.PerUserPrincipal;
    }

    private static Boolean isNamedPrincipalMode() {
        return CONNECTION_MODE == 'NamedPrincipal';
    }

    private static Boolean looksLikeAuthenticationProblem(String messageText) {
        if (String.isBlank(messageText)) {
            return false;
        }

        String normalized = messageText.toLowerCase();
        return normalized.contains('authenticate') ||
            normalized.contains('authorization') ||
            normalized.contains('unauthorized') ||
            normalized.contains('access token') ||
            normalized.contains('credential') ||
            normalized.contains('token');
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

    private static List<String> normalizeGoogleCalendarIds(List<String> rawIds) {
        List<String> results = new List<String>();

        if (rawIds == null) {
            return results;
        }

        for (String rawId : rawIds) {
            String normalized = String.isBlank(rawId) ? null : rawId.trim();
            if (!String.isBlank(normalized) && !results.contains(normalized)) {
                results.add(normalized);
            }
        }

        return results;
    }

    private static String serializeGoogleCalendarIds(List<String> googleCalendarIds) {
        List<String> normalizedIds = normalizeGoogleCalendarIds(googleCalendarIds);
        return normalizedIds.isEmpty() ? null : JSON.serialize(normalizedIds);
    }
}