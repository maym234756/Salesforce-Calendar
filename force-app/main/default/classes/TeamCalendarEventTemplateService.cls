public with sharing class TeamCalendarEventTemplateService {
    private static final Set<String> ALLOWED_STATUS_VALUES = new Set<String>{
        'Planned',
        'Confirmed',
        'Cancelled'
    };

    public class EventTemplateDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public Integer durationMinutes;
        @AuraEnabled public Id calendarId;
        @AuraEnabled public String calendarName;
        @AuraEnabled public String defaultStatus;
        @AuraEnabled public String notes;
        @AuraEnabled public Boolean isActive;
    }

    public class EventTemplateInput {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public Integer durationMinutes;
        @AuraEnabled public String calendarId;
        @AuraEnabled public String defaultStatus;
        @AuraEnabled public String notes;
        @AuraEnabled public Boolean isActive;
    }

    public class TemplateCalendarDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public Id ownerId;
        @AuraEnabled public String ownerName;
    }

    @AuraEnabled(cacheable=true)
    public static List<EventTemplateDTO> getActiveEventTemplates() {
        return queryTemplates(true);
    }

    @AuraEnabled(cacheable=true)
    public static List<EventTemplateDTO> getEventTemplatesForAdmin() {
        TeamCalendarUserPreferenceService.enforceSecurityAdmin();
        return queryTemplates(false);
    }

    @AuraEnabled(cacheable=true)
    public static List<TemplateCalendarDTO> getTemplateCalendars() {
        TeamCalendarUserPreferenceService.enforceSecurityAdmin();

        List<TemplateCalendarDTO> response = new List<TemplateCalendarDTO>();
        for (Team_Calendar__c row : [
            SELECT Id, Name, OwnerId, Owner.Name
            FROM Team_Calendar__c
            WHERE Is_Active__c = true
            ORDER BY Name
            LIMIT 500
        ]) {
            TemplateCalendarDTO dto = new TemplateCalendarDTO();
            dto.id = row.Id;
            dto.name = row.Name;
            dto.ownerId = row.OwnerId;
            dto.ownerName = row.Owner != null ? row.Owner.Name : null;
            response.add(dto);
        }

        return response;
    }

    @AuraEnabled
    public static EventTemplateDTO saveEventTemplate(String templateJson) {
        TeamCalendarUserPreferenceService.enforceSecurityAdmin();

        EventTemplateInput inputRow = String.isBlank(templateJson)
            ? new EventTemplateInput()
            : (EventTemplateInput) JSON.deserialize(templateJson, EventTemplateInput.class);

        if (inputRow == null) {
            inputRow = new EventTemplateInput();
        }

        String nameValue = inputRow.name != null ? inputRow.name.trim() : '';
        if (String.isBlank(nameValue)) {
            throw new AuraHandledException('A template title is required.');
        }

        if (inputRow.durationMinutes == null || inputRow.durationMinutes <= 0) {
            throw new AuraHandledException('Template duration must be greater than 0 minutes.');
        }

        Id calendarId = parseId(inputRow.calendarId);
        if (calendarId == null) {
            throw new AuraHandledException('Choose an active Team Calendar for this template.');
        }

        Team_Calendar__c calendarRow = loadWritableCalendar(calendarId);
        String defaultStatus = normalizeStatusValue(inputRow.defaultStatus);

        Calendar_Event_Template__c workingRow;
        Id templateId = parseId(inputRow.id);
        if (templateId != null) {
            List<Calendar_Event_Template__c> templateRows = [
                SELECT Id
                FROM Calendar_Event_Template__c
                WHERE Id = :templateId
                LIMIT 1
            ];

            if (templateRows.isEmpty()) {
                throw new AuraHandledException('Event template not found.');
            }

            workingRow = templateRows[0];
        } else {
            workingRow = new Calendar_Event_Template__c();
        }

        workingRow.Name = nameValue;
        workingRow.Duration_Minutes__c = inputRow.durationMinutes;
        workingRow.Calendar__c = calendarRow.Id;
        workingRow.Default_Status__c = defaultStatus;
        workingRow.Notes__c = String.isBlank(inputRow.notes) ? null : inputRow.notes.trim();
        workingRow.Is_Active__c = inputRow.isActive == null ? true : inputRow.isActive == true;

        upsert workingRow;

        return buildTemplateDto(loadTemplateRow(workingRow.Id));
    }

    @AuraEnabled
    public static void deleteEventTemplate(Id templateId) {
        TeamCalendarUserPreferenceService.enforceSecurityAdmin();

        if (templateId == null) {
            throw new AuraHandledException('An event template id is required.');
        }

        List<Calendar_Event_Template__c> templateRows = [
            SELECT Id
            FROM Calendar_Event_Template__c
            WHERE Id = :templateId
            LIMIT 1
        ];

        if (templateRows.isEmpty()) {
            throw new AuraHandledException('Event template not found.');
        }

        delete templateRows[0];
    }

    private static List<EventTemplateDTO> queryTemplates(Boolean activeOnly) {
        String soql =
            'SELECT Id, Name, Duration_Minutes__c, Calendar__c, Calendar__r.Name, Default_Status__c, Notes__c, Is_Active__c ' +
            'FROM Calendar_Event_Template__c';

        if (activeOnly) {
            soql += ' WHERE Is_Active__c = true';
        }

        soql += ' ORDER BY Name LIMIT 200';

        List<EventTemplateDTO> response = new List<EventTemplateDTO>();
        for (Calendar_Event_Template__c row : Database.query(soql)) {
            response.add(buildTemplateDto(row));
        }

        return response;
    }

    private static EventTemplateDTO buildTemplateDto(Calendar_Event_Template__c row) {
        EventTemplateDTO dto = new EventTemplateDTO();
        dto.id = row.Id;
        dto.name = row.Name;
        dto.durationMinutes = row.Duration_Minutes__c == null
            ? null
            : Integer.valueOf(String.valueOf(row.Duration_Minutes__c));
        dto.calendarId = row.Calendar__c;
        dto.calendarName = row.Calendar__r != null ? row.Calendar__r.Name : null;
        dto.defaultStatus = row.Default_Status__c;
        dto.notes = row.Notes__c;
        dto.isActive = row.Is_Active__c;
        return dto;
    }

    private static Calendar_Event_Template__c loadTemplateRow(Id templateId) {
        return [
            SELECT Id, Name, Duration_Minutes__c, Calendar__c, Calendar__r.Name, Default_Status__c, Notes__c, Is_Active__c
            FROM Calendar_Event_Template__c
            WHERE Id = :templateId
            LIMIT 1
        ];
    }

    private static Team_Calendar__c loadWritableCalendar(Id calendarId) {
        List<Team_Calendar__c> rows = [
            SELECT Id, Name, Is_Active__c
            FROM Team_Calendar__c
            WHERE Id = :calendarId
            LIMIT 1
        ];

        if (rows.isEmpty() || rows[0].Is_Active__c != true) {
            throw new AuraHandledException('Choose an active Team Calendar for this template.');
        }

        return rows[0];
    }

    private static String normalizeStatusValue(String rawValue) {
        String candidate = String.isBlank(rawValue) ? 'Planned' : rawValue.trim();

        if (!ALLOWED_STATUS_VALUES.contains(candidate)) {
            throw new AuraHandledException('Choose a supported default status for this template.');
        }

        return candidate;
    }

    private static Id parseId(String rawValue) {
        if (String.isBlank(rawValue)) {
            return null;
        }

        try {
            return (Id) rawValue.trim();
        } catch (Exception ex) {
            throw new AuraHandledException('Invalid record id.');
        }
    }
}