/**
 * @description       :
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             :
 * @last modified on  : 04-11-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@IsTest
private class TeamCalendarSecurityControllerTest {
    @IsTest
    static void canCurrentUserManageSecurity_returnsBoolean() {
        Test.startTest();
        Boolean result = TeamCalendarSecurityController.canCurrentUserManageSecurity();
        Test.stopTest();

        System.assertNotEquals(null, result);
    }

    @IsTest
    static void getSecurityUsers_returnsRows() {
        Test.startTest();
        List<TeamCalendarSecurityController.SecurityUserDTO> rows =
            TeamCalendarSecurityController.getSecurityUsers();
        Test.stopTest();

        System.assert(rows.size() > 0, 'Expected at least one active user.');
    }

    @IsTest
    static void saveAndLoadUserCalendarAccess_roundTripsRules() {
        Id targetUserId = UserInfo.getUserId();

        List<TeamCalendarSecurityController.SecurityRuleInput> payload =
            new List<TeamCalendarSecurityController.SecurityRuleInput>();

        TeamCalendarSecurityController.SecurityRuleInput row =
            new TeamCalendarSecurityController.SecurityRuleInput();
        row.calendarViewId = '03AV000000TEST01';
        row.calendarViewName = 'Test Calendar View';
        row.calendarViewOwnerId = UserInfo.getUserId();
        row.canView = true;
        row.canCreate = true;
        row.canEdit = false;
        row.canDelete = false;
        row.canAssignUsers = true;
        row.canManageSecurity = false;
        row.isActive = true;
        row.notes = 'Unit test row';
        payload.add(row);

        Test.startTest();
        TeamCalendarSecurityController.saveUserCalendarAccess(
            targetUserId,
            JSON.serialize(payload)
        );

        TeamCalendarSecurityController.SecurityUserAccessDTO loaded =
            TeamCalendarSecurityController.getUserCalendarAccess(targetUserId);
        Test.stopTest();

        System.assertNotEquals(null, loaded);
        System.assertEquals(targetUserId, loaded.userId);
        System.assertEquals(1, loaded.rules.size());
        System.assertEquals('03AV000000TEST01', loaded.rules[0].calendarViewId);
        System.assertEquals(true, loaded.rules[0].canView);
        System.assertEquals(true, loaded.rules[0].canCreate);
        System.assertEquals(true, loaded.rules[0].canAssignUsers);
    }

    @IsTest
    static void saveUserCalendarAccess_emptyPayload_deactivatesExistingRules() {
        Id targetUserId = UserInfo.getUserId();

        insert new Calendar_Access_Rule__c(
            Target_User__c = targetUserId,
            Calendar_View_Id__c = '03AV000000TEST99',
            Calendar_View_Name__c = 'Old Rule',
            Calendar_View_Owner_Id__c = UserInfo.getUserId(),
            Can_View__c = true,
            Is_Active__c = true
        );

        Test.startTest();
        TeamCalendarSecurityController.saveUserCalendarAccess(
            targetUserId,
            '[]'
        );

        TeamCalendarSecurityController.SecurityUserAccessDTO loaded =
            TeamCalendarSecurityController.getUserCalendarAccess(targetUserId);
        Test.stopTest();

        System.assertEquals(0, loaded.rules.size(), 'Expected no active rules after replace.');
    }

    @IsTest
    static void getCalendarViewsForSecurity_runs() {
        Test.startTest();
        List<TeamCalendarSecurityController.SecurityCalendarViewDTO> rows =
            TeamCalendarSecurityController.getCalendarViewsForSecurity();
        Test.stopTest();

        System.assertNotEquals(null, rows);
    }

    @IsTest
    static void saveAndLoadLayoutPreferences_roundTripsValues() {
        Id targetUserId = UserInfo.getUserId();

        TeamCalendarUserPreferenceService.UserPreferenceInput inputRow =
            new TeamCalendarUserPreferenceService.UserPreferenceInput();
        inputRow.defaultView = 'week';
        inputRow.defaultCalendarViewId = '03AV000000TEST55';
        inputRow.defaultStatus = 'Planned';
        inputRow.showSecurityButton = true;
        inputRow.showRefreshButton = false;
        inputRow.showTodayButton = true;
        inputRow.showPrevNextButtons = false;
        inputRow.showNewButton = true;
        inputRow.showFiltersButton = false;
        inputRow.showSelectUsersBox = true;
        inputRow.showFilterControls = false;
        inputRow.showWeekends = true;
        inputRow.autoExpandDayHeight = false;
        inputRow.wrapEventTitles = true;
        inputRow.compactEventDensity = true;
        inputRow.allowedSelectedUserIds = new List<String>{
            String.valueOf(targetUserId)
        };
        inputRow.isActive = true;

        Test.startTest();
        TeamCalendarSecurityController.saveUserLayoutPreference(
            targetUserId,
            JSON.serialize(inputRow)
        );

        TeamCalendarUserPreferenceService.UserPreferenceDTO loaded =
            TeamCalendarSecurityController.getUserLayoutPreference(targetUserId);
        Test.stopTest();

        System.assertEquals('week', loaded.defaultView);
        System.assertEquals('03AV000000TEST55', loaded.defaultCalendarViewId);
        System.assertEquals('Planned', loaded.defaultStatus);
        System.assertEquals(true, loaded.showSecurityButton);
        System.assertEquals(false, loaded.showRefreshButton);
        System.assertEquals(true, loaded.showTodayButton);
        System.assertEquals(false, loaded.showPrevNextButtons);
        System.assertEquals(true, loaded.showNewButton);
        System.assertEquals(false, loaded.showFiltersButton);
        System.assertEquals(true, loaded.showSelectUsersBox);
        System.assertEquals(false, loaded.showFilterControls);
        System.assertEquals(true, loaded.showWeekends);
        System.assertEquals(false, loaded.autoExpandDayHeight);
        System.assertEquals(true, loaded.wrapEventTitles);
        System.assertEquals(true, loaded.compactEventDensity);
        System.assertEquals(1, loaded.allowedSelectedUserIds.size());
        System.assertEquals(String.valueOf(targetUserId), loaded.allowedSelectedUserIds[0]);
    }

    @IsTest
    static void setShowSecurityButtonForAllUsers_updatesUserPreferences() {
        Id targetUserId = UserInfo.getUserId();

        TeamCalendarUserPreferenceService.UserPreferenceInput inputRow =
            new TeamCalendarUserPreferenceService.UserPreferenceInput();
        inputRow.defaultView = 'month';
        inputRow.showSecurityButton = true;

        TeamCalendarSecurityController.saveUserLayoutPreference(
            targetUserId,
            JSON.serialize(inputRow)
        );

        Test.startTest();
        Integer updatedCount = TeamCalendarSecurityController.setShowSecurityButtonForAllUsers(false);
        TeamCalendarUserPreferenceService.UserPreferenceDTO loaded =
            TeamCalendarSecurityController.getUserLayoutPreference(targetUserId);
        Test.stopTest();

        System.assert(updatedCount > 0, 'Expected at least one user to be updated.');
        System.assertEquals(false, loaded.showSecurityButton);
    }

    @IsTest
    static void setLayoutFieldForAllUsers_updatesRequestedField() {
        Id targetUserId = UserInfo.getUserId();

        TeamCalendarUserPreferenceService.UserPreferenceInput inputRow =
            new TeamCalendarUserPreferenceService.UserPreferenceInput();
        inputRow.defaultView = 'month';
        inputRow.showRefreshButton = true;

        TeamCalendarSecurityController.saveUserLayoutPreference(
            targetUserId,
            JSON.serialize(inputRow)
        );

        Test.startTest();
        Integer updatedCount = TeamCalendarSecurityController.setLayoutFieldForAllUsers(
            'showRefreshButton',
            false
        );
        TeamCalendarUserPreferenceService.UserPreferenceDTO loaded =
            TeamCalendarSecurityController.getUserLayoutPreference(targetUserId);
        Test.stopTest();

        System.assert(updatedCount > 0, 'Expected at least one user to be updated.');
        System.assertEquals(false, loaded.showRefreshButton);
    }
}