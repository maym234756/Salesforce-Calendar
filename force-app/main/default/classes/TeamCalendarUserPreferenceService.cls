/**
 * @description       :
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             :
 * @last modified on  : 04-11-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class TeamCalendarUserPreferenceService {
    private static final Set<String> BULK_LAYOUT_FIELD_NAMES = new Set<String>{
        'showSecurityButton',
        'showRefreshButton',
        'showTodayButton',
        'showPrevNextButtons',
        'showNewButton',
        'showFiltersButton',
        'showSyncPanel',
        'showSelectUsersBox',
        'showFilterControls',
        'showWeekends',
        'autoExpandDayHeight',
        'wrapEventTitles',
        'compactEventDensity',
        'isActive'
    };

    @TestVisible
    private static final String SECURITY_ADMIN_PERMISSION = 'Calendar_Security_Admin';

    public class UserPreferenceDTO {
        @AuraEnabled public Id userId;
        @AuraEnabled public String defaultView;
        @AuraEnabled public String defaultCalendarViewId;
        @AuraEnabled public String defaultStatus;

        @AuraEnabled public Boolean showSecurityButton;
        @AuraEnabled public Boolean showRefreshButton;
        @AuraEnabled public Boolean showTodayButton;
        @AuraEnabled public Boolean showPrevNextButtons;
        @AuraEnabled public Boolean showNewButton;
        @AuraEnabled public Boolean showFiltersButton;
        @AuraEnabled public Boolean showSyncPanel;
        @AuraEnabled public Boolean showSelectUsersBox;
        @AuraEnabled public Boolean showFilterControls;

        @AuraEnabled public Boolean showWeekends;
        @AuraEnabled public Boolean autoExpandDayHeight;
        @AuraEnabled public Boolean wrapEventTitles;
        @AuraEnabled public Boolean compactEventDensity;
        @AuraEnabled public List<String> allowedSelectedUserIds = new List<String>();

        @AuraEnabled public Boolean isActive;
    }

    public class UserPreferenceInput {
        @AuraEnabled public String defaultView;
        @AuraEnabled public String defaultCalendarViewId;
        @AuraEnabled public String defaultStatus;

        @AuraEnabled public Boolean showSecurityButton;
        @AuraEnabled public Boolean showRefreshButton;
        @AuraEnabled public Boolean showTodayButton;
        @AuraEnabled public Boolean showPrevNextButtons;
        @AuraEnabled public Boolean showNewButton;
        @AuraEnabled public Boolean showFiltersButton;
        @AuraEnabled public Boolean showSyncPanel;
        @AuraEnabled public Boolean showSelectUsersBox;
        @AuraEnabled public Boolean showFilterControls;

        @AuraEnabled public Boolean showWeekends;
        @AuraEnabled public Boolean autoExpandDayHeight;
        @AuraEnabled public Boolean wrapEventTitles;
        @AuraEnabled public Boolean compactEventDensity;
        @AuraEnabled public List<String> allowedSelectedUserIds;

        @AuraEnabled public Boolean isActive;
    }

    public static Boolean isSecurityAdmin(Id userId) {
        return FeatureManagement.checkPermission(SECURITY_ADMIN_PERMISSION);
    }

    public static void enforceSecurityAdmin() {
        if (!isSecurityAdmin(UserInfo.getUserId())) {
            throw new AuraHandledException('You do not have permission to manage calendar security.');
        }
    }

    public static UserPreferenceDTO getPreferenceForCurrentUser() {
        return toDto(loadOrDefault(UserInfo.getUserId()));
    }

    public static UserPreferenceDTO getPreferenceForTargetUser(Id userId) {
        if (userId == null) {
            throw new AuraHandledException('A user id is required.');
        }

        enforceSecurityAdmin();
        return toDto(loadOrDefault(userId));
    }

    public static UserPreferenceDTO savePreferenceForTargetUser(Id userId, UserPreferenceInput inputRow) {
        if (userId == null) {
            throw new AuraHandledException('A user id is required.');
        }

        enforceSecurityAdmin();

        Calendar_User_Preference__c workingRow = loadExisting(userId);
        if (workingRow == null) {
            workingRow = new Calendar_User_Preference__c(
                Target_User__c = userId
            );
        }

        UserPreferenceDTO normalized = normalizeInput(userId, inputRow);

        workingRow.Default_View__c = normalized.defaultView;
        workingRow.Default_Calendar_View_Id__c = normalized.defaultCalendarViewId;
        workingRow.Default_Status__c = normalized.defaultStatus;

        workingRow.Show_Security_Button__c = normalized.showSecurityButton;
        workingRow.Show_Refresh_Button__c = normalized.showRefreshButton;
        workingRow.Show_Today_Button__c = normalized.showTodayButton;
        workingRow.Show_Prev_Next_Buttons__c = normalized.showPrevNextButtons;
        workingRow.Show_New_Button__c = normalized.showNewButton;
        workingRow.Show_Filters_Button__c = normalized.showFiltersButton;
        workingRow.Show_Sync_Panel__c = normalized.showSyncPanel;
        workingRow.Show_Select_Users_Box__c = normalized.showSelectUsersBox;
        workingRow.Show_Filter_Controls__c = normalized.showFilterControls;

        workingRow.Show_Weekends__c = normalized.showWeekends;
        workingRow.Auto_Expand_Day_Height__c = normalized.autoExpandDayHeight;
        workingRow.Wrap_Event_Titles__c = normalized.wrapEventTitles;
        workingRow.Compact_Event_Density__c = normalized.compactEventDensity;
        workingRow.Allowed_Selected_User_Ids__c = serializeAllowedSelectedUserIds(
            normalized.allowedSelectedUserIds
        );

        workingRow.Is_Active__c = normalized.isActive;

        upsert workingRow;

        return toDto(workingRow);
    }

    public static Integer setShowSecurityButtonForAllUsers(Boolean showSecurityButton) {
        return setLayoutFieldForAllUsers('showSecurityButton', showSecurityButton);
    }

    public static Integer setLayoutFieldForAllUsers(String fieldName, Boolean fieldValue) {
        if (String.isBlank(fieldName)) {
            throw new AuraHandledException('A layout field name is required.');
        }

        if (fieldValue == null) {
            throw new AuraHandledException('A layout field value is required.');
        }

        if (!BULK_LAYOUT_FIELD_NAMES.contains(fieldName)) {
            throw new AuraHandledException('That layout field cannot be updated for all users.');
        }

        enforceSecurityAdmin();

        List<User> targetUsers = [
            SELECT Id
            FROM User
            WHERE IsActive = true
            AND UserType = 'Standard'
            ORDER BY Name
            LIMIT 500
        ];

        if (targetUsers.isEmpty()) {
            return 0;
        }

        Set<Id> targetUserIds = new Set<Id>();
        for (User userRow : targetUsers) {
            targetUserIds.add(userRow.Id);
        }

        Map<Id, Calendar_User_Preference__c> existingByUserId = new Map<Id, Calendar_User_Preference__c>();
        for (Calendar_User_Preference__c row : [
            SELECT Id,
                   Target_User__c,
                   Default_View__c,
                   Default_Calendar_View_Id__c,
                   Default_Status__c,
                   Show_Security_Button__c,
                   Show_Refresh_Button__c,
                   Show_Today_Button__c,
                   Show_Prev_Next_Buttons__c,
                   Show_New_Button__c,
                   Show_Filters_Button__c,
                   Show_Sync_Panel__c,
                   Show_Select_Users_Box__c,
                   Show_Filter_Controls__c,
                   Show_Weekends__c,
                   Auto_Expand_Day_Height__c,
                   Wrap_Event_Titles__c,
                   Compact_Event_Density__c,
                   Allowed_Selected_User_Ids__c,
                   Is_Active__c
            FROM Calendar_User_Preference__c
            WHERE Target_User__c IN :targetUserIds
            ORDER BY Target_User__c, LastModifiedDate DESC
        ]) {
            if (!existingByUserId.containsKey(row.Target_User__c)) {
                existingByUserId.put(row.Target_User__c, row);
            }
        }

        List<Calendar_User_Preference__c> rowsToUpsert = new List<Calendar_User_Preference__c>();

        for (Id targetUserId : targetUserIds) {
            Calendar_User_Preference__c workingRow = existingByUserId.containsKey(targetUserId)
                ? existingByUserId.get(targetUserId)
                : createDefaultPreferenceRecord(targetUserId);

            applyBulkLayoutFieldValue(workingRow, fieldName, fieldValue);
            rowsToUpsert.add(workingRow);
        }

        upsert rowsToUpsert;
        return rowsToUpsert.size();
    }

    public static Set<Id> getAllowedSelectedUserIdsForCurrentUser() {
        Calendar_User_Preference__c preferenceRow = loadExisting(UserInfo.getUserId());
        return parseAllowedSelectedUserIdSet(
            preferenceRow != null ? preferenceRow.Allowed_Selected_User_Ids__c : null
        );
    }

    private static Calendar_User_Preference__c loadExisting(Id userId) {
        List<Calendar_User_Preference__c> rows = [
            SELECT Id,
                   Target_User__c,
                   Default_View__c,
                   Default_Calendar_View_Id__c,
                   Default_Status__c,
                   Show_Security_Button__c,
                   Show_Refresh_Button__c,
                   Show_Today_Button__c,
                   Show_Prev_Next_Buttons__c,
                   Show_New_Button__c,
                   Show_Filters_Button__c,
                   Show_Sync_Panel__c,
                   Show_Select_Users_Box__c,
                   Show_Filter_Controls__c,
                   Show_Weekends__c,
                   Auto_Expand_Day_Height__c,
                   Wrap_Event_Titles__c,
                   Compact_Event_Density__c,
                     Allowed_Selected_User_Ids__c,
                   Is_Active__c
            FROM Calendar_User_Preference__c
            WHERE Target_User__c = :userId
            ORDER BY LastModifiedDate DESC
            LIMIT 1
        ];

        return rows.isEmpty() ? null : rows[0];
    }

    private static Calendar_User_Preference__c loadOrDefault(Id userId) {
        Calendar_User_Preference__c existingRow = loadExisting(userId);

        if (existingRow != null) {
            return existingRow;
        }

        return createDefaultPreferenceRecord(userId);
    }

    private static Calendar_User_Preference__c createDefaultPreferenceRecord(Id userId) {
        return new Calendar_User_Preference__c(
            Target_User__c = userId,
            Default_View__c = 'month',
            Default_Calendar_View_Id__c = null,
            Default_Status__c = '',
            Show_Security_Button__c = true,
            Show_Refresh_Button__c = true,
            Show_Today_Button__c = true,
            Show_Prev_Next_Buttons__c = true,
            Show_New_Button__c = true,
            Show_Filters_Button__c = true,
            Show_Sync_Panel__c = true,
            Show_Select_Users_Box__c = true,
            Show_Filter_Controls__c = true,
            Show_Weekends__c = true,
            Auto_Expand_Day_Height__c = true,
            Wrap_Event_Titles__c = true,
            Compact_Event_Density__c = false,
            Is_Active__c = true
        );
    }

    private static UserPreferenceDTO normalizeInput(Id userId, UserPreferenceInput inputRow) {
        UserPreferenceDTO dto = new UserPreferenceDTO();
        dto.userId = userId;

        dto.defaultView = normalizeDefaultView(inputRow != null ? inputRow.defaultView : null);
        dto.defaultCalendarViewId = inputRow != null ? inputRow.defaultCalendarViewId : null;
        dto.defaultStatus = inputRow != null && inputRow.defaultStatus != null ? inputRow.defaultStatus : '';

        dto.showSecurityButton = inputRow == null || inputRow.showSecurityButton == null ? true : inputRow.showSecurityButton;
        dto.showRefreshButton = inputRow == null || inputRow.showRefreshButton == null ? true : inputRow.showRefreshButton;
        dto.showTodayButton = inputRow == null || inputRow.showTodayButton == null ? true : inputRow.showTodayButton;
        dto.showPrevNextButtons = inputRow == null || inputRow.showPrevNextButtons == null ? true : inputRow.showPrevNextButtons;
        dto.showNewButton = inputRow == null || inputRow.showNewButton == null ? true : inputRow.showNewButton;
        dto.showFiltersButton = inputRow == null || inputRow.showFiltersButton == null ? true : inputRow.showFiltersButton;
        dto.showSyncPanel = inputRow == null || inputRow.showSyncPanel == null ? true : inputRow.showSyncPanel;
        dto.showSelectUsersBox = inputRow == null || inputRow.showSelectUsersBox == null ? true : inputRow.showSelectUsersBox;
        dto.showFilterControls = inputRow == null || inputRow.showFilterControls == null ? true : inputRow.showFilterControls;

        dto.showWeekends = inputRow == null || inputRow.showWeekends == null ? true : inputRow.showWeekends;
        dto.autoExpandDayHeight = inputRow == null || inputRow.autoExpandDayHeight == null ? true : inputRow.autoExpandDayHeight;
        dto.wrapEventTitles = inputRow == null || inputRow.wrapEventTitles == null ? true : inputRow.wrapEventTitles;
        dto.compactEventDensity = inputRow != null && inputRow.compactEventDensity == true;
        dto.allowedSelectedUserIds = normalizeAllowedSelectedUserIds(
            inputRow != null ? inputRow.allowedSelectedUserIds : null
        );

        dto.isActive = inputRow == null || inputRow.isActive == null ? true : inputRow.isActive;

        return dto;
    }

    private static UserPreferenceDTO toDto(Calendar_User_Preference__c row) {
        Calendar_User_Preference__c safeRow = row == null
            ? loadOrDefault(UserInfo.getUserId())
            : row;

        UserPreferenceDTO dto = new UserPreferenceDTO();
        dto.userId = safeRow.Target_User__c;
        dto.defaultView = normalizeDefaultView(safeRow.Default_View__c);
        dto.defaultCalendarViewId = safeRow.Default_Calendar_View_Id__c;
        dto.defaultStatus = safeRow.Default_Status__c;

        dto.showSecurityButton = safeRow.Show_Security_Button__c == null ? true : safeRow.Show_Security_Button__c;
        dto.showRefreshButton = safeRow.Show_Refresh_Button__c == null ? true : safeRow.Show_Refresh_Button__c;
        dto.showTodayButton = safeRow.Show_Today_Button__c == null ? true : safeRow.Show_Today_Button__c;
        dto.showPrevNextButtons = safeRow.Show_Prev_Next_Buttons__c == null ? true : safeRow.Show_Prev_Next_Buttons__c;
        dto.showNewButton = safeRow.Show_New_Button__c == null ? true : safeRow.Show_New_Button__c;
        dto.showFiltersButton = safeRow.Show_Filters_Button__c == null ? true : safeRow.Show_Filters_Button__c;
        dto.showSyncPanel = safeRow.Show_Sync_Panel__c == null ? true : safeRow.Show_Sync_Panel__c;
        dto.showSelectUsersBox = safeRow.Show_Select_Users_Box__c == null ? true : safeRow.Show_Select_Users_Box__c;
        dto.showFilterControls = safeRow.Show_Filter_Controls__c == null ? true : safeRow.Show_Filter_Controls__c;

        dto.showWeekends = safeRow.Show_Weekends__c == null ? true : safeRow.Show_Weekends__c;
        dto.autoExpandDayHeight = safeRow.Auto_Expand_Day_Height__c == null ? true : safeRow.Auto_Expand_Day_Height__c;
        dto.wrapEventTitles = safeRow.Wrap_Event_Titles__c == null ? true : safeRow.Wrap_Event_Titles__c;
        dto.compactEventDensity = safeRow.Compact_Event_Density__c == null ? false : safeRow.Compact_Event_Density__c;
        dto.allowedSelectedUserIds = parseAllowedSelectedUserIds(safeRow.Allowed_Selected_User_Ids__c);

        dto.isActive = safeRow.Is_Active__c == null ? true : safeRow.Is_Active__c;
        return dto;
    }

    private static void applyBulkLayoutFieldValue(
        Calendar_User_Preference__c workingRow,
        String fieldName,
        Boolean fieldValue
    ) {
        switch on fieldName {
            when 'showSecurityButton' {
                workingRow.Show_Security_Button__c = fieldValue;
            }
            when 'showRefreshButton' {
                workingRow.Show_Refresh_Button__c = fieldValue;
            }
            when 'showTodayButton' {
                workingRow.Show_Today_Button__c = fieldValue;
            }
            when 'showPrevNextButtons' {
                workingRow.Show_Prev_Next_Buttons__c = fieldValue;
            }
            when 'showNewButton' {
                workingRow.Show_New_Button__c = fieldValue;
            }
            when 'showFiltersButton' {
                workingRow.Show_Filters_Button__c = fieldValue;
            }
            when 'showSyncPanel' {
                workingRow.Show_Sync_Panel__c = fieldValue;
            }
            when 'showSelectUsersBox' {
                workingRow.Show_Select_Users_Box__c = fieldValue;
            }
            when 'showFilterControls' {
                workingRow.Show_Filter_Controls__c = fieldValue;
            }
            when 'showWeekends' {
                workingRow.Show_Weekends__c = fieldValue;
            }
            when 'autoExpandDayHeight' {
                workingRow.Auto_Expand_Day_Height__c = fieldValue;
            }
            when 'wrapEventTitles' {
                workingRow.Wrap_Event_Titles__c = fieldValue;
            }
            when 'compactEventDensity' {
                workingRow.Compact_Event_Density__c = fieldValue;
            }
            when 'isActive' {
                workingRow.Is_Active__c = fieldValue;
            }
            when else {
                throw new AuraHandledException('That layout field cannot be updated for all users.');
            }
        }
    }

    private static List<String> normalizeAllowedSelectedUserIds(List<String> rawValues) {
        if (rawValues == null) {
            return null;
        }

        List<String> rows = new List<String>();
        Set<String> seenIds = new Set<String>();

        for (String rawValue : rawValues) {
            if (String.isBlank(rawValue)) {
                continue;
            }

            String trimmedValue = rawValue.trim();
            if (!seenIds.contains(trimmedValue)) {
                seenIds.add(trimmedValue);
                rows.add(trimmedValue);
            }
        }

        return rows;
    }

    private static String serializeAllowedSelectedUserIds(List<String> userIds) {
        if (userIds == null) {
            return null;
        }

        return JSON.serialize(normalizeAllowedSelectedUserIds(userIds));
    }

    private static List<String> parseAllowedSelectedUserIds(String rawValue) {
        if (String.isBlank(rawValue)) {
            return null;
        }

        try {
            List<Object> rawRows = (List<Object>) JSON.deserializeUntyped(rawValue);
            List<String> results = new List<String>();

            for (Object rawRow : rawRows) {
                if (rawRow == null) {
                    continue;
                }

                String stringValue = String.valueOf(rawRow).trim();
                if (!String.isBlank(stringValue)) {
                    results.add(stringValue);
                }
            }

            return normalizeAllowedSelectedUserIds(results);
        } catch (Exception ex) {
            return normalizeAllowedSelectedUserIds(rawValue.split(','));
        }
    }

    private static Set<Id> parseAllowedSelectedUserIdSet(String rawValue) {
        List<String> parsedIds = parseAllowedSelectedUserIds(rawValue);
        if (parsedIds == null) {
            return null;
        }

        Set<Id> results = new Set<Id>();
        for (String parsedId : parsedIds) {
            try {
                results.add((Id) parsedId);
            } catch (Exception ex) {
                // Ignore malformed ids stored in the selected user approval payload.
            }
        }

        return results;
    }

    private static String normalizeDefaultView(String rawValue) {
        String candidate = String.isBlank(rawValue) ? 'month' : rawValue.trim().toLowerCase();

        if (
            candidate == 'month' ||
            candidate == 'week' ||
            candidate == 'agenda' ||
            candidate == 'teamload' ||
            candidate == 'conflicts'
        ) {
            return candidate;
        }

        return 'month';
    }
}