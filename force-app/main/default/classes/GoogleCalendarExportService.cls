public with sharing class GoogleCalendarExportService {
    public class ExportOutcome {
        public Boolean success;
        public String externalEventId;
        public String message;
    }

    public static String validateCalendarSync(Calendar_Event__c evt, String targetGoogleCalendarId) {
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

    public static String resolveTargetGoogleCalendarId(
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

    public static ExportOutcome syncSingleEvent(Calendar_Event__c evt, String googleCalendarId) {
        ExportOutcome outcome = new ExportOutcome();

        if (evt == null) {
            outcome.success = false;
            outcome.message = 'Event not found.';
            return outcome;
        }

        if (evt.Status__c == 'Cancelled' || evt.Status__c == 'Deleted') {
            return removeSingleEvent(evt, googleCalendarId);
        }

        Map<String, Object> payload = buildEventPayload(evt, outcome);
        if (payload == null) {
            return outcome;
        }

        try {
            HttpResponse response = GoogleCalendarApiClient.upsertCalendarEvent(
                googleCalendarId,
                evt.External_Event_Id__c,
                JSON.serialize(payload)
            );
            Integer statusCode = response.getStatusCode();

            if (statusCode >= 200 && statusCode < 300) {
                Map<String, Object> responseMap =
                    (Map<String, Object>) JSON.deserializeUntyped(response.getBody());

                outcome.success = true;
                outcome.externalEventId = (String) responseMap.get('id');
                outcome.message = String.isBlank(evt.External_Event_Id__c)
                    ? 'Event created in Google Calendar.'
                    : 'Event updated in Google Calendar.';
                return outcome;
            }

            outcome.success = false;
            outcome.message = 'Google sync failed. HTTP ' + statusCode + ': ' + response.getBody();
            return outcome;
        } catch (Exception ex) {
            outcome.success = false;
            outcome.message = ex.getMessage();
            return outcome;
        }
    }

    public static ExportOutcome deleteExternalEvent(
        String googleCalendarId,
        String externalEventId,
        String successMessage
    ) {
        ExportOutcome outcome = new ExportOutcome();

        if (String.isBlank(externalEventId)) {
            outcome.success = true;
            outcome.externalEventId = null;
            outcome.message = successMessage;
            return outcome;
        }

        if (String.isBlank(googleCalendarId)) {
            outcome.success = false;
            outcome.message = 'No Google calendar is configured for this event.';
            return outcome;
        }

        try {
            HttpResponse response = GoogleCalendarApiClient.deleteCalendarEvent(
                googleCalendarId,
                externalEventId
            );
            Integer statusCode = response.getStatusCode();

            if ((statusCode >= 200 && statusCode < 300) || statusCode == 404 || statusCode == 410) {
                outcome.success = true;
                outcome.externalEventId = null;
                outcome.message = successMessage;
                return outcome;
            }

            outcome.success = false;
            outcome.message = 'Google sync failed. HTTP ' + statusCode + ': ' + response.getBody();
            return outcome;
        } catch (Exception ex) {
            outcome.success = false;
            outcome.message = ex.getMessage();
            return outcome;
        }
    }

    private static ExportOutcome removeSingleEvent(Calendar_Event__c evt, String googleCalendarId) {
        Boolean isDeleted = evt != null && evt.Status__c == 'Deleted';

        if (String.isBlank(evt.External_Event_Id__c)) {
            ExportOutcome outcome = new ExportOutcome();
            outcome.success = true;
            outcome.externalEventId = null;
            outcome.message = isDeleted
                ? 'Deleted event has no Google event to remove.'
                : 'Cancelled event has no Google event to remove.';
            return outcome;
        }

        return deleteExternalEvent(
            googleCalendarId,
            evt.External_Event_Id__c,
            isDeleted
                ? 'Deleted event removed from Google Calendar.'
                : 'Cancelled event removed from Google Calendar.'
        );
    }

    public static String resolveRecurringInstanceExternalId(
        Calendar_Event__c template,
        String occurrenceDate,
        String googleCalendarId
    ) {
        if (
            template == null ||
            String.isBlank(template.External_Event_Id__c) ||
            String.isBlank(occurrenceDate) ||
            String.isBlank(googleCalendarId) ||
            template.Start__c == null
        ) {
            return null;
        }

        try {
            Date occurrence = Date.valueOf(occurrenceDate);
            Datetime timeMin;
            Datetime timeMax;
            String expectedOriginalStartDateTime;

            if (template.All_Day__c == true) {
                timeMin = Datetime.newInstanceGmt(
                    occurrence.year(),
                    occurrence.month(),
                    occurrence.day(),
                    0,
                    0,
                    0
                );
                timeMax = timeMin.addDays(1);
                expectedOriginalStartDateTime = null;
            } else {
                expectedOriginalStartDateTime = buildOccurrenceOriginalStartDateTime(
                    template.Start__c,
                    occurrenceDate
                );
                timeMin = parseDateTimeValue(expectedOriginalStartDateTime);
                if (timeMin == null) {
                    return null;
                }
                timeMax = timeMin.addMinutes(1);
            }

            for (Object rawItem : GoogleCalendarApiClient.loadRecurringEventInstances(
                googleCalendarId,
                template.External_Event_Id__c,
                timeMin,
                timeMax,
                10,
                true
            )) {
                if (!(rawItem instanceof Map<String, Object>)) {
                    continue;
                }

                Map<String, Object> item = (Map<String, Object>) rawItem;
                if (matchesRecurringInstance(item, occurrenceDate, expectedOriginalStartDateTime)) {
                    return (String) item.get('id');
                }
            }
        } catch (Exception ex) {
            return null;
        }

        return null;
    }

    private static Map<String, Object> buildEventPayload(
        Calendar_Event__c evt,
        ExportOutcome outcome
    ) {
        Map<String, Object> payload = new Map<String, Object>();
        payload.put('summary', evt.Name);

        if (!String.isBlank(evt.Notes__c)) {
            payload.put('description', evt.Notes__c);
        }

        if (evt.All_Day__c == true) {
            if (evt.Start__c == null) {
                outcome.success = false;
                outcome.message = 'Start is required for all-day events.';
                return null;
            }

            Date startDate = evt.Start__c.date();
            Date endDateValue = evt.End__c != null ? evt.End__c.date() : startDate;

            if (endDateValue <= startDate) {
                endDateValue = startDate.addDays(1);
            }

            payload.put('start', new Map<String, Object>{ 'date' => String.valueOf(startDate) });
            payload.put('end', new Map<String, Object>{ 'date' => String.valueOf(endDateValue) });
            addRecurrencePayload(evt, payload);
            return payload;
        }

        if (evt.Start__c == null || evt.End__c == null) {
            outcome.success = false;
            outcome.message = 'Start and End are required for timed events.';
            return null;
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
        addRecurrencePayload(evt, payload);

        return payload;
    }

    private static void addRecurrencePayload(
        Calendar_Event__c evt,
        Map<String, Object> payload
    ) {
        if (
            evt == null ||
            evt.Is_Recurrence_Exception__c == true ||
            String.isBlank(evt.Recurrence_Rule__c)
        ) {
            return;
        }

        String recurrenceValue = evt.Recurrence_Rule__c.trim();
        if (!recurrenceValue.toUpperCase().startsWith('RRULE:')) {
            recurrenceValue = 'RRULE:' + recurrenceValue;
        }

        payload.put('recurrence', new List<String>{ recurrenceValue });
    }

    private static Boolean matchesRecurringInstance(
        Map<String, Object> item,
        String occurrenceDate,
        String expectedOriginalStartDateTime
    ) {
        if (item == null || String.isBlank((String) item.get('id'))) {
            return false;
        }

        Map<String, Object> originalStartTime =
            item.get('originalStartTime') instanceof Map<String, Object>
                ? (Map<String, Object>) item.get('originalStartTime')
                : null;
        if (originalStartTime == null) {
            return false;
        }

        if (expectedOriginalStartDateTime == null) {
            return (String) originalStartTime.get('date') == occurrenceDate;
        }

        Datetime expectedDateTime = parseDateTimeValue(expectedOriginalStartDateTime);
        Datetime actualDateTime = parseDateTimeValue((String) originalStartTime.get('dateTime'));

        return expectedDateTime != null &&
            actualDateTime != null &&
            expectedDateTime.getTime() == actualDateTime.getTime();
    }

    private static String buildOccurrenceOriginalStartDateTime(
        Datetime templateStart,
        String occurrenceDate
    ) {
        return occurrenceDate + 'T' + templateStart.formatGmt('HH:mm:ss') + '.000Z';
    }

    private static Datetime parseDateTimeValue(String value) {
        if (String.isBlank(value)) {
            return null;
        }

        try {
            return (Datetime) JSON.deserialize('"' + value + '"', Datetime.class);
        } catch (Exception ex) {
            return null;
        }
    }
}