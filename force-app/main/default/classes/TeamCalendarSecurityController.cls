/**
 * @description       :
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             :
 * @last modified on  : 04-11-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class TeamCalendarSecurityController {
    public class SecurityUserDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String username;
        @AuraEnabled public String profileName;
        @AuraEnabled public String roleName;
    }

    public class SecurityCalendarViewDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public Id ownerId;
        @AuraEnabled public String ownerName;
        @AuraEnabled public String startField;
        @AuraEnabled public String endField;
        @AuraEnabled public String displayField;
        @AuraEnabled public Id listViewFilterId;
        @AuraEnabled public Boolean isDisplayed;
    }

    public class SecurityRuleDTO {
        @AuraEnabled public String calendarViewId;
        @AuraEnabled public String calendarViewName;
        @AuraEnabled public String calendarViewOwnerId;
        @AuraEnabled public Boolean canView;
        @AuraEnabled public Boolean canCreate;
        @AuraEnabled public Boolean canEdit;
        @AuraEnabled public Boolean canDelete;
        @AuraEnabled public Boolean canAssignUsers;
        @AuraEnabled public Boolean canManageSecurity;
        @AuraEnabled public Boolean isActive;
        @AuraEnabled public String notes;
    }

    public class SecurityUserAccessDTO {
        @AuraEnabled public Id userId;
        @AuraEnabled public String userName;
        @AuraEnabled public Boolean canManageSecurity;
        @AuraEnabled public List<SecurityRuleDTO> rules;
    }

    public class SecurityRuleInput {
        @AuraEnabled public String calendarViewId;
        @AuraEnabled public String calendarViewName;
        @AuraEnabled public String calendarViewOwnerId;
        @AuraEnabled public Boolean canView;
        @AuraEnabled public Boolean canCreate;
        @AuraEnabled public Boolean canEdit;
        @AuraEnabled public Boolean canDelete;
        @AuraEnabled public Boolean canAssignUsers;
        @AuraEnabled public Boolean canManageSecurity;
        @AuraEnabled public Boolean isActive;
        @AuraEnabled public String notes;
    }

    @AuraEnabled(cacheable=true)
    public static Boolean canCurrentUserManageSecurity() {
        return TeamCalendarUserPreferenceService.isSecurityAdmin(UserInfo.getUserId());
    }

    @AuraEnabled(cacheable=true)
    public static List<SecurityUserDTO> getSecurityUsers() {
        TeamCalendarUserPreferenceService.enforceSecurityAdmin();

        List<SecurityUserDTO> rows = new List<SecurityUserDTO>();

        for (User userRow : [
            SELECT Id, Name, Username, Profile.Name, UserRole.Name
            FROM User
            WHERE IsActive = true
            AND UserType = 'Standard'
            ORDER BY Name
            LIMIT 500
        ]) {
            SecurityUserDTO dto = new SecurityUserDTO();
            dto.id = userRow.Id;
            dto.name = userRow.Name;
            dto.username = userRow.Username;
            dto.profileName = userRow.Profile != null ? userRow.Profile.Name : null;
            dto.roleName = userRow.UserRole != null ? userRow.UserRole.Name : null;
            rows.add(dto);
        }

        return rows;
    }

    @AuraEnabled(cacheable=true)
    public static List<SecurityCalendarViewDTO> getCalendarViewsForSecurity() {
        TeamCalendarUserPreferenceService.enforceSecurityAdmin();

        List<SecurityCalendarViewDTO> rows = new List<SecurityCalendarViewDTO>();

        for (CalendarView calendarViewRow : [
            SELECT Id,
                   Name,
                   OwnerId,
                   Owner.Name,
                   StartField,
                   EndField,
                   DisplayField,
                   ListViewFilterId,
                   IsDisplayed
            FROM CalendarView
            ORDER BY Name
            LIMIT 500
        ]) {
            SecurityCalendarViewDTO dto = new SecurityCalendarViewDTO();
            dto.id = calendarViewRow.Id;
            dto.name = calendarViewRow.Name;
            dto.ownerId = calendarViewRow.OwnerId;
            dto.ownerName = calendarViewRow.Owner != null ? calendarViewRow.Owner.Name : null;
            dto.startField = calendarViewRow.StartField;
            dto.endField = calendarViewRow.EndField;
            dto.displayField = calendarViewRow.DisplayField;
            dto.listViewFilterId = calendarViewRow.ListViewFilterId;
            dto.isDisplayed = calendarViewRow.IsDisplayed;
            rows.add(dto);
        }

        return rows;
    }

    @AuraEnabled(cacheable=true)
    public static SecurityUserAccessDTO getUserCalendarAccess(Id userId) {
        TeamCalendarUserPreferenceService.enforceSecurityAdmin();

        if (userId == null) {
            throw new AuraHandledException('A user id is required.');
        }

        List<User> targetUsers = [
            SELECT Id, Name
            FROM User
            WHERE Id = :userId
            LIMIT 1
        ];
        if (targetUsers.isEmpty()) {
            throw new AuraHandledException('User not found.');
        }
        User targetUser = targetUsers[0];

        SecurityUserAccessDTO response = new SecurityUserAccessDTO();
        response.userId = targetUser.Id;
        response.userName = targetUser.Name;
        response.canManageSecurity = TeamCalendarUserPreferenceService.isSecurityAdmin(UserInfo.getUserId());
        response.rules = new List<SecurityRuleDTO>();

        for (Calendar_Access_Rule__c ruleRow : [
            SELECT Id,
                   Calendar_View_Id__c,
                   Calendar_View_Name__c,
                   Calendar_View_Owner_Id__c,
                   Can_View__c,
                   Can_Create__c,
                   Can_Edit__c,
                   Can_Delete__c,
                   Can_Assign_Users__c,
                   Can_Manage_Security__c,
                   Is_Active__c,
                   Notes__c
            FROM Calendar_Access_Rule__c
            WHERE Target_User__c = :userId
            AND Is_Active__c = true
            ORDER BY Calendar_View_Name__c
        ]) {
            SecurityRuleDTO dto = new SecurityRuleDTO();
            dto.calendarViewId = ruleRow.Calendar_View_Id__c;
            dto.calendarViewName = ruleRow.Calendar_View_Name__c;
            dto.calendarViewOwnerId = ruleRow.Calendar_View_Owner_Id__c;
            dto.canView = ruleRow.Can_View__c;
            dto.canCreate = ruleRow.Can_Create__c;
            dto.canEdit = ruleRow.Can_Edit__c;
            dto.canDelete = ruleRow.Can_Delete__c;
            dto.canAssignUsers = ruleRow.Can_Assign_Users__c;
            dto.canManageSecurity = ruleRow.Can_Manage_Security__c;
            dto.isActive = ruleRow.Is_Active__c;
            dto.notes = ruleRow.Notes__c;
            response.rules.add(dto);
        }

        return response;
    }

    @AuraEnabled
    public static void saveUserCalendarAccess(Id userId, String rulesJson) {
        TeamCalendarUserPreferenceService.enforceSecurityAdmin();

        if (userId == null) {
            throw new AuraHandledException('A user id is required.');
        }

        List<SecurityRuleInput> incomingRules = new List<SecurityRuleInput>();
        if (String.isNotBlank(rulesJson)) {
            incomingRules = (List<SecurityRuleInput>) JSON.deserialize(
                rulesJson,
                List<SecurityRuleInput>.class
            );
        }
        if (incomingRules == null) {
            incomingRules = new List<SecurityRuleInput>();
        }

        Map<String, Calendar_Access_Rule__c> existingByCalendarViewId = new Map<String, Calendar_Access_Rule__c>();

        for (Calendar_Access_Rule__c existingRule : [
            SELECT Id,
                   Calendar_View_Id__c,
                   Calendar_View_Name__c,
                   Calendar_View_Owner_Id__c,
                   Can_View__c,
                   Can_Create__c,
                   Can_Edit__c,
                   Can_Delete__c,
                   Can_Assign_Users__c,
                   Can_Manage_Security__c,
                   Is_Active__c,
                   Notes__c
            FROM Calendar_Access_Rule__c
            WHERE Target_User__c = :userId
        ]) {
            if (String.isNotBlank(existingRule.Calendar_View_Id__c)) {
                existingByCalendarViewId.put(existingRule.Calendar_View_Id__c, existingRule);
            }
        }

        Set<String> payloadCalendarIds = new Set<String>();
        List<Calendar_Access_Rule__c> rowsToUpsert = new List<Calendar_Access_Rule__c>();

        for (SecurityRuleInput inputRow : incomingRules) {
            if (inputRow == null || String.isBlank(inputRow.calendarViewId)) {
                continue;
            }

            payloadCalendarIds.add(inputRow.calendarViewId);

            Calendar_Access_Rule__c workingRow = existingByCalendarViewId.containsKey(inputRow.calendarViewId)
                ? existingByCalendarViewId.get(inputRow.calendarViewId)
                : new Calendar_Access_Rule__c(
                    Target_User__c = userId,
                    Calendar_View_Id__c = inputRow.calendarViewId
                );

            workingRow.Calendar_View_Name__c = inputRow.calendarViewName;
            workingRow.Calendar_View_Owner_Id__c = inputRow.calendarViewOwnerId;
            workingRow.Can_View__c = inputRow.canView == true;
            workingRow.Can_Create__c = inputRow.canCreate == true;
            workingRow.Can_Edit__c = inputRow.canEdit == true;
            workingRow.Can_Delete__c = inputRow.canDelete == true;
            workingRow.Can_Assign_Users__c = inputRow.canAssignUsers == true;
            workingRow.Can_Manage_Security__c = inputRow.canManageSecurity == true;
            workingRow.Is_Active__c = inputRow.isActive == true;
            workingRow.Notes__c = inputRow.notes;

            Boolean hasAnySignal =
                workingRow.Can_View__c ||
                workingRow.Can_Create__c ||
                workingRow.Can_Edit__c ||
                workingRow.Can_Delete__c ||
                workingRow.Can_Assign_Users__c ||
                workingRow.Can_Manage_Security__c ||
                workingRow.Is_Active__c ||
                String.isNotBlank(workingRow.Notes__c);

            if (workingRow.Id != null || hasAnySignal) {
                rowsToUpsert.add(workingRow);
            }
        }

        for (Calendar_Access_Rule__c existingRule : existingByCalendarViewId.values()) {
            if (!payloadCalendarIds.contains(existingRule.Calendar_View_Id__c)) {
                existingRule.Can_View__c = false;
                existingRule.Can_Create__c = false;
                existingRule.Can_Edit__c = false;
                existingRule.Can_Delete__c = false;
                existingRule.Can_Assign_Users__c = false;
                existingRule.Can_Manage_Security__c = false;
                existingRule.Is_Active__c = false;
                rowsToUpsert.add(existingRule);
            }
        }

        if (!rowsToUpsert.isEmpty()) {
            upsert rowsToUpsert;
        }
    }

    @AuraEnabled(cacheable=true)
    public static TeamCalendarUserPreferenceService.UserPreferenceDTO getUserLayoutPreference(Id userId) {
        return TeamCalendarUserPreferenceService.getPreferenceForTargetUser(userId);
    }

    @AuraEnabled
    public static TeamCalendarUserPreferenceService.UserPreferenceDTO saveUserLayoutPreference(
        Id userId,
        String preferenceJson
    ) {
        TeamCalendarUserPreferenceService.UserPreferenceInput inputRow =
            String.isBlank(preferenceJson)
                ? new TeamCalendarUserPreferenceService.UserPreferenceInput()
                : (TeamCalendarUserPreferenceService.UserPreferenceInput) JSON.deserialize(
                    preferenceJson,
                    TeamCalendarUserPreferenceService.UserPreferenceInput.class
                );

        return TeamCalendarUserPreferenceService.savePreferenceForTargetUser(userId, inputRow);
    }

    @AuraEnabled
    public static Integer setShowSecurityButtonForAllUsers(Boolean showSecurityButton) {
        return TeamCalendarUserPreferenceService.setShowSecurityButtonForAllUsers(
            showSecurityButton
        );
    }

    @AuraEnabled
    public static Integer setLayoutFieldForAllUsers(String fieldName, Boolean fieldValue) {
        return TeamCalendarUserPreferenceService.setLayoutFieldForAllUsers(
            fieldName,
            fieldValue
        );
    }

    @AuraEnabled(cacheable=true)
    public static TeamCalendarUserPreferenceService.UserPreferenceDTO getCurrentUserLayoutPreference() {
        return TeamCalendarUserPreferenceService.getPreferenceForCurrentUser();
    }
}