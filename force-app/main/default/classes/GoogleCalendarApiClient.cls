public with sharing class GoogleCalendarApiClient {
    private static final Integer DEFAULT_TIMEOUT_MS = 20000;
    private static final Integer DEFAULT_IMPORT_PAGE_SIZE = 250;
    private static final Integer DEFAULT_MAX_IMPORT_PAGES = 40;

    public static HttpResponse upsertCalendarEvent(
        String googleCalendarId,
        String externalEventId,
        String requestBody
    ) {
        HttpRequest request = new HttpRequest();
        request.setHeader('Content-Type', 'application/json');
        request.setTimeout(DEFAULT_TIMEOUT_MS);

        String encodedCalendarId = EncodingUtil.urlEncode(googleCalendarId, 'UTF-8');

        if (String.isBlank(externalEventId)) {
            request.setMethod('POST');
            request.setEndpoint(
                'callout:' + GoogleCalendarConnectionService.NAMED_CREDENTIAL_DEVELOPER_NAME +
                '/calendar/v3/calendars/' + encodedCalendarId + '/events'
            );
        } else {
            String encodedEventId = EncodingUtil.urlEncode(externalEventId, 'UTF-8');
            request.setMethod('PATCH');
            request.setEndpoint(
                'callout:' + GoogleCalendarConnectionService.NAMED_CREDENTIAL_DEVELOPER_NAME +
                '/calendar/v3/calendars/' + encodedCalendarId + '/events/' + encodedEventId
            );
        }

        request.setBody(requestBody);
        return new Http().send(request);
    }

    public static HttpResponse deleteCalendarEvent(
        String googleCalendarId,
        String externalEventId
    ) {
        HttpRequest request = new HttpRequest();
        request.setMethod('DELETE');
        request.setTimeout(DEFAULT_TIMEOUT_MS);

        String encodedCalendarId = EncodingUtil.urlEncode(googleCalendarId, 'UTF-8');
        String encodedEventId = EncodingUtil.urlEncode(externalEventId, 'UTF-8');
        request.setEndpoint(
            'callout:' + GoogleCalendarConnectionService.NAMED_CREDENTIAL_DEVELOPER_NAME +
            '/calendar/v3/calendars/' + encodedCalendarId + '/events/' + encodedEventId
        );

        return new Http().send(request);
    }

    public static List<Object> loadRecurringEventInstances(
        String googleCalendarId,
        String recurringEventId,
        Datetime timeMin,
        Datetime timeMax,
        Integer pageSize,
        Boolean showDeleted
    ) {
        List<Object> results = new List<Object>();
        String nextPageToken;
        Integer pageCount = 0;
        Integer resolvedPageSize = pageSize == null || pageSize <= 0
            ? DEFAULT_IMPORT_PAGE_SIZE
            : pageSize;

        do {
            pageCount++;

            HttpRequest request = new HttpRequest();
            request.setMethod('GET');
            request.setEndpoint(
                buildRecurringEventInstancesEndpoint(
                    googleCalendarId,
                    recurringEventId,
                    timeMin,
                    timeMax,
                    nextPageToken,
                    resolvedPageSize,
                    showDeleted
                )
            );
            request.setTimeout(DEFAULT_TIMEOUT_MS);

            HttpResponse response = new Http().send(request);
            Integer statusCode = response.getStatusCode();

            if (statusCode < 200 || statusCode >= 300) {
                throw new AuraHandledException(
                    'Unable to load recurring Google instances. HTTP ' + statusCode + ': ' + response.getBody()
                );
            }

            Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
            List<Object> items = parsed != null ? (List<Object>) parsed.get('items') : null;

            if (items != null) {
                results.addAll(items);
            }

            nextPageToken = parsed != null ? (String) parsed.get('nextPageToken') : null;
        } while (!String.isBlank(nextPageToken) && pageCount < DEFAULT_MAX_IMPORT_PAGES);

        return results;
    }

    public static List<Object> loadCalendarEvents(
        String googleCalendarId,
        Datetime start,
        Datetime endDate,
        Integer pageSize,
        Integer maxPages
    ) {
        List<Object> results = new List<Object>();
        String nextPageToken;
        Integer pageCount = 0;
        Integer resolvedPageSize = pageSize == null || pageSize <= 0
            ? DEFAULT_IMPORT_PAGE_SIZE
            : pageSize;
        Integer resolvedMaxPages = maxPages == null || maxPages <= 0
            ? DEFAULT_MAX_IMPORT_PAGES
            : maxPages;

        do {
            pageCount++;

            HttpRequest request = new HttpRequest();
            request.setMethod('GET');
            request.setEndpoint(
                buildCalendarEventsEndpoint(
                    googleCalendarId,
                    start,
                    endDate,
                    nextPageToken,
                    resolvedPageSize
                )
            );
            request.setTimeout(DEFAULT_TIMEOUT_MS);

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
        } while (!String.isBlank(nextPageToken) && pageCount < resolvedMaxPages);

        return results;
    }

    private static String buildCalendarEventsEndpoint(
        String googleCalendarId,
        Datetime start,
        Datetime endDate,
        String nextPageToken,
        Integer pageSize
    ) {
        String encodedCalendarId = EncodingUtil.urlEncode(googleCalendarId, 'UTF-8');
        String endpoint =
            'callout:' + GoogleCalendarConnectionService.NAMED_CREDENTIAL_DEVELOPER_NAME +
            '/calendar/v3/calendars/' + encodedCalendarId +
            '/events?singleEvents=true&showDeleted=true&maxResults=' + pageSize +
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

    private static String buildRecurringEventInstancesEndpoint(
        String googleCalendarId,
        String recurringEventId,
        Datetime timeMin,
        Datetime timeMax,
        String nextPageToken,
        Integer pageSize,
        Boolean showDeleted
    ) {
        String encodedCalendarId = EncodingUtil.urlEncode(googleCalendarId, 'UTF-8');
        String encodedEventId = EncodingUtil.urlEncode(recurringEventId, 'UTF-8');
        String endpoint =
            'callout:' + GoogleCalendarConnectionService.NAMED_CREDENTIAL_DEVELOPER_NAME +
            '/calendar/v3/calendars/' + encodedCalendarId +
            '/events/' + encodedEventId +
            '/instances?maxResults=' + pageSize +
            '&showDeleted=' + (showDeleted == true ? 'true' : 'false') +
            '&fields=items(id,status,recurringEventId,originalStartTime(date,dateTime,timeZone)),nextPageToken';

        if (timeMin != null) {
            endpoint += '&timeMin=' + EncodingUtil.urlEncode(timeMin.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''), 'UTF-8');
        }

        if (timeMax != null) {
            endpoint += '&timeMax=' + EncodingUtil.urlEncode(timeMax.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''), 'UTF-8');
        }

        if (String.isNotBlank(nextPageToken)) {
            endpoint += '&pageToken=' + EncodingUtil.urlEncode(nextPageToken, 'UTF-8');
        }

        return endpoint;
    }
}