public with sharing class GoogleCalendarImportService {
    private static final Integer IMPORT_PAGE_SIZE = 250;
    private static final Integer MAX_IMPORT_PAGES = 40;

    public static Map<String, Calendar_Event__c> loadExistingImportedEvents(
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

    public static List<Object> loadGoogleEvents(
        String googleCalendarId,
        Datetime start,
        Datetime endDate
    ) {
        return GoogleCalendarApiClient.loadCalendarEvents(
            googleCalendarId,
            start,
            endDate,
            IMPORT_PAGE_SIZE,
            MAX_IMPORT_PAGES
        );
    }

    public static void applyImportedGoogleEvent(
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

    public static List<String> parseGoogleCalendarIds(String rawValue) {
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

    public static String buildImportEventKey(String googleCalendarId, String externalEventId) {
        return String.valueOf(googleCalendarId) + '::' + String.valueOf(externalEventId);
    }

    private static Date parseGoogleDate(String value) {
        return (Date) JSON.deserialize(JSON.serialize(value), Date.class);
    }

    private static Datetime parseGoogleDateTime(String value) {
        return (Datetime) JSON.deserialize(JSON.serialize(value), Datetime.class);
    }
}