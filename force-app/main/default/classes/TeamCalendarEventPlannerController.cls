/**
 * @description       : Provides read-only planning context for the New Calendar Event modal.
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             :
 * @last modified on  : 04-15-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class TeamCalendarEventPlannerController {
    public class AvailabilityConflictDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String calendarName;
        @AuraEnabled public String status;
        @AuraEnabled public Datetime start;
        @AuraEnabled public Datetime endDateTime;
        @AuraEnabled public String timeLabel;
    }

    public class AvailabilityInsightDTO {
        @AuraEnabled public Boolean allowed;
        @AuraEnabled public Boolean hasConflicts;
        @AuraEnabled public Integer conflictCount;
        @AuraEnabled public String summary;
        @AuraEnabled public String tone;
        @AuraEnabled public List<AvailabilityConflictDTO> conflicts = new List<AvailabilityConflictDTO>();
    }

    public class CustomerContextDTO {
        @AuraEnabled public Id contactId;
        @AuraEnabled public String contactName;
        @AuraEnabled public Id resolvedAccountId;
        @AuraEnabled public String resolvedAccountName;
        @AuraEnabled public String suggestedName;
    }

    public class PlanningContextDTO {
        @AuraEnabled public AvailabilityInsightDTO availability;
        @AuraEnabled public CustomerContextDTO customerContext;
    }

    @AuraEnabled(cacheable=true)
    public static PlanningContextDTO getPlanningContext(
        Id assignedUserId,
        Datetime startValue,
        Datetime endValue,
        Id customerContactId,
        Id customerAccountId,
        String appointmentType,
        String templateName
    ) {
        PlanningContextDTO response = new PlanningContextDTO();
        response.customerContext = loadCustomerContext(
            customerContactId,
            customerAccountId,
            appointmentType,
            templateName
        );
        response.availability = loadAvailabilityInsight(assignedUserId, startValue, endValue);
        return response;
    }

    @AuraEnabled(cacheable=true)
    public static Id resolveCalendarIdForAssignedUser(Id assignedUserId, Id currentCalendarId) {
        if (assignedUserId == null) {
            return currentCalendarId;
        }

        Id currentResolvedId = resolveMatchingCurrentCalendarId(assignedUserId, currentCalendarId);
        if (currentResolvedId != null) {
            return currentResolvedId;
        }

        List<Team_Calendar__c> assignedUserCalendars = [
            SELECT Id
            FROM Team_Calendar__c
            WHERE OwnerId = :assignedUserId
            AND Is_Active__c = true
            ORDER BY Name
            LIMIT 1
        ];

        if (!assignedUserCalendars.isEmpty()) {
            return assignedUserCalendars[0].Id;
        }

        return null;
    }

    private static Id resolveMatchingCurrentCalendarId(Id assignedUserId, Id currentCalendarId) {
        if (currentCalendarId == null) {
            return null;
        }

        List<Team_Calendar__c> currentCalendarRows = [
            SELECT Id, OwnerId, Is_Active__c
            FROM Team_Calendar__c
            WHERE Id = :currentCalendarId
            LIMIT 1
        ];

        if (
            !currentCalendarRows.isEmpty() &&
            currentCalendarRows[0].Is_Active__c == true &&
            currentCalendarRows[0].OwnerId == assignedUserId
        ) {
            return currentCalendarRows[0].Id;
        }

        List<CalendarView> currentCalendarViewRows = [
            SELECT Id, OwnerId, IsDisplayed
            FROM CalendarView
            WHERE Id = :currentCalendarId
            LIMIT 1
        ];

        if (
            !currentCalendarViewRows.isEmpty() &&
            currentCalendarViewRows[0].IsDisplayed == true &&
            currentCalendarViewRows[0].OwnerId == assignedUserId
        ) {
            return currentCalendarViewRows[0].Id;
        }

        return null;
    }

    private static CustomerContextDTO loadCustomerContext(
        Id customerContactId,
        Id customerAccountId,
        String appointmentType,
        String templateName
    ) {
        CustomerContextDTO dto = new CustomerContextDTO();

        Account accountRow;
        Contact contactRow;

        if (customerContactId != null) {
            List<Contact> contactRows = [
                SELECT Id, Name, AccountId, Account.Name
                FROM Contact
                WHERE Id = :customerContactId
                LIMIT 1
            ];

            if (!contactRows.isEmpty()) {
                contactRow = contactRows[0];
                dto.contactId = contactRow.Id;
                dto.contactName = contactRow.Name;
            }
        }

        Id resolvedAccountId = customerAccountId != null
            ? customerAccountId
            : (contactRow != null ? contactRow.AccountId : null);

        if (resolvedAccountId != null) {
            List<Account> accountRows = [
                SELECT Id, Name
                FROM Account
                WHERE Id = :resolvedAccountId
                LIMIT 1
            ];

            if (!accountRows.isEmpty()) {
                accountRow = accountRows[0];
                dto.resolvedAccountId = accountRow.Id;
                dto.resolvedAccountName = accountRow.Name;
            }
        }

        if (dto.resolvedAccountId == null && contactRow != null && contactRow.AccountId != null) {
            dto.resolvedAccountId = contactRow.AccountId;
            dto.resolvedAccountName = contactRow.Account != null ? contactRow.Account.Name : null;
        }

        dto.suggestedName = buildSuggestedEventName(
            dto.contactName,
            dto.resolvedAccountName,
            appointmentType,
            templateName
        );

        return dto;
    }

    private static AvailabilityInsightDTO loadAvailabilityInsight(
        Id assignedUserId,
        Datetime startValue,
        Datetime endValue
    ) {
        AvailabilityInsightDTO dto = new AvailabilityInsightDTO();
        dto.allowed = false;
        dto.hasConflicts = false;
        dto.conflictCount = 0;
        dto.tone = 'neutral';

        if (assignedUserId == null || startValue == null || endValue == null) {
            dto.summary = 'Choose Assign To, Start, and End to check availability.';
            return dto;
        }

        if (endValue <= startValue) {
            dto.summary = 'Availability preview needs an end time after the start time.';
            return dto;
        }

        User assignedUser = loadAllowedAssignedUser(assignedUserId);
        if (assignedUser == null) {
            dto.summary = 'Assign To only supports active users allowed by your Calendar Security Manager access.';
            dto.tone = 'warning';
            return dto;
        }

        dto.allowed = true;

        List<Calendar_Event__c> eventRows = [
            SELECT Id, Name, Calendar__r.Name, Status__c, Start__c, End__c
            FROM Calendar_Event__c
            WHERE OwnerId = :assignedUserId
            AND Status__c IN ('Planned', 'Confirmed')
            AND Start__c < :endValue
            AND (End__c = null OR End__c > :startValue)
            ORDER BY Start__c ASC
            LIMIT 5
        ];

        dto.conflictCount = eventRows.size();
        dto.hasConflicts = !eventRows.isEmpty();
        dto.tone = dto.hasConflicts ? 'warning' : 'success';
        dto.summary = dto.hasConflicts
            ? assignedUser.Name + ' has ' + eventRows.size() + ' overlapping event' + (eventRows.size() == 1 ? '' : 's') + ' in this time range.'
            : assignedUser.Name + ' looks available for this time range.';

        for (Calendar_Event__c row : eventRows) {
            AvailabilityConflictDTO conflict = new AvailabilityConflictDTO();
            conflict.id = row.Id;
            conflict.name = row.Name;
            conflict.calendarName = row.Calendar__r != null ? row.Calendar__r.Name : null;
            conflict.status = row.Status__c;
            conflict.start = row.Start__c;
            conflict.endDateTime = row.End__c;
            conflict.timeLabel = formatConflictRange(row.Start__c, row.End__c);
            dto.conflicts.add(conflict);
        }

        return dto;
    }

    private static User loadAllowedAssignedUser(Id assignedUserId) {
        Set<Id> allowedUserIds = TeamCalendarUserPreferenceService.getAllowedSelectedUserIdsForCurrentUser();
        if (allowedUserIds != null
            && !allowedUserIds.contains(assignedUserId)
            && assignedUserId != UserInfo.getUserId()) {
            return null;
        }

        List<User> rows = [
            SELECT Id, Name
            FROM User
            WHERE Id = :assignedUserId
            AND IsActive = true
            AND UserType = 'Standard'
            LIMIT 1
        ];

        return rows.isEmpty() ? null : rows[0];
    }

    private static String formatConflictRange(Datetime startValue, Datetime endValue) {
        if (startValue == null) {
            return 'Time unavailable';
        }

        String startLabel = startValue.format('MMM d, h:mm a');
        if (endValue == null) {
            return startLabel;
        }

        return startLabel + ' - ' + endValue.format('h:mm a');
    }

    private static String buildSuggestedEventName(
        String contactName,
        String accountName,
        String appointmentType,
        String templateName
    ) {
        String subject = String.isNotBlank(contactName)
            ? contactName
            : accountName;

        if (String.isBlank(subject)) {
            return null;
        }

        String suffix;
        if (String.isNotBlank(templateName)) {
            suffix = templateName.trim();
        } else if (appointmentType == 'Follow-Up') {
            suffix = 'Follow-Up';
        } else if (appointmentType == 'Customer') {
            suffix = 'Customer Appointment';
        } else {
            suffix = 'Appointment';
        }

        return subject + ' ' + suffix;
    }
}