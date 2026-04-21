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
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Boolean result;

        Test.startTest();
        System.runAs(securityAdmin) {
            result = TeamCalendarSecurityController.canCurrentUserManageSecurity();
        }
        Test.stopTest();

        System.assertEquals(true, result);
    }

    @IsTest
    static void getSecurityUsers_returnsRows() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        List<TeamCalendarSecurityController.SecurityUserDTO> rows;

        Test.startTest();
        System.runAs(securityAdmin) {
            rows = TeamCalendarSecurityController.getSecurityUsers();
        }
        Test.stopTest();

        System.assert(rows.size() > 0, 'Expected at least one active user.');
    }

    @IsTest
    static void saveAndLoadUserCalendarAccess_roundTripsRules() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
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

        TeamCalendarSecurityController.SecurityUserAccessDTO loaded;

        Test.startTest();
        System.runAs(securityAdmin) {
            TeamCalendarSecurityController.saveUserCalendarAccess(
                targetUserId,
                JSON.serialize(payload)
            );

            loaded = TeamCalendarSecurityController.getUserCalendarAccess(targetUserId);
        }
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
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Id targetUserId = UserInfo.getUserId();

        insert new Calendar_Access_Rule__c(
            Target_User__c = targetUserId,
            Calendar_View_Id__c = '03AV000000TEST99',
            Calendar_View_Name__c = 'Old Rule',
            Calendar_View_Owner_Id__c = UserInfo.getUserId(),
            Can_View__c = true,
            Is_Active__c = true
        );

        TeamCalendarSecurityController.SecurityUserAccessDTO loaded;

        Test.startTest();
        System.runAs(securityAdmin) {
            TeamCalendarSecurityController.saveUserCalendarAccess(
                targetUserId,
                '[]'
            );

            loaded = TeamCalendarSecurityController.getUserCalendarAccess(targetUserId);
        }
        Test.stopTest();

        System.assertEquals(0, loaded.rules.size(), 'Expected no active rules after replace.');
    }

    @IsTest
    static void getCalendarViewsForSecurity_runs() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        List<TeamCalendarSecurityController.SecurityCalendarViewDTO> rows;

        Test.startTest();
        System.runAs(securityAdmin) {
            rows = TeamCalendarSecurityController.getCalendarViewsForSecurity();
        }
        Test.stopTest();

        System.assertNotEquals(null, rows);
    }

    @IsTest
    static void saveAndLoadLayoutPreferences_roundTripsValues() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
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

        TeamCalendarUserPreferenceService.UserPreferenceDTO loaded;

        Test.startTest();
        System.runAs(securityAdmin) {
            TeamCalendarSecurityController.saveUserLayoutPreference(
                targetUserId,
                JSON.serialize(inputRow)
            );

            loaded = TeamCalendarSecurityController.getUserLayoutPreference(targetUserId);
        }
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
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Id targetUserId = UserInfo.getUserId();

        TeamCalendarUserPreferenceService.UserPreferenceInput inputRow =
            new TeamCalendarUserPreferenceService.UserPreferenceInput();
        inputRow.defaultView = 'month';
        inputRow.showSecurityButton = true;

        System.runAs(securityAdmin) {
            TeamCalendarSecurityController.saveUserLayoutPreference(
                targetUserId,
                JSON.serialize(inputRow)
            );
        }

        Integer updatedCount;
        TeamCalendarUserPreferenceService.UserPreferenceDTO loaded;

        Test.startTest();
        System.runAs(securityAdmin) {
            updatedCount = TeamCalendarSecurityController.setShowSecurityButtonForAllUsers(false);
            loaded = TeamCalendarSecurityController.getUserLayoutPreference(targetUserId);
        }
        Test.stopTest();

        System.assert(updatedCount > 0, 'Expected at least one user to be updated.');
        System.assertEquals(false, loaded.showSecurityButton);
    }

    @IsTest
    static void setLayoutFieldForAllUsers_updatesRequestedField() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Id targetUserId = UserInfo.getUserId();

        TeamCalendarUserPreferenceService.UserPreferenceInput inputRow =
            new TeamCalendarUserPreferenceService.UserPreferenceInput();
        inputRow.defaultView = 'month';
        inputRow.showRefreshButton = true;

        System.runAs(securityAdmin) {
            TeamCalendarSecurityController.saveUserLayoutPreference(
                targetUserId,
                JSON.serialize(inputRow)
            );
        }

        Integer updatedCount;
        TeamCalendarUserPreferenceService.UserPreferenceDTO loaded;

        Test.startTest();
        System.runAs(securityAdmin) {
            updatedCount = TeamCalendarSecurityController.setLayoutFieldForAllUsers(
                'showRefreshButton',
                false
            );
            loaded = TeamCalendarSecurityController.getUserLayoutPreference(targetUserId);
        }
        Test.stopTest();

        System.assert(updatedCount > 0, 'Expected at least one user to be updated.');
        System.assertEquals(false, loaded.showRefreshButton);
    }

    @IsTest
    static void saveCurrentUserLayoutPreference_savesColorOverridesWithoutSecurityAdmin() {
        TeamCalendarUserPreferenceService.UserPreferenceInput inputRow =
            new TeamCalendarUserPreferenceService.UserPreferenceInput();
        inputRow.defaultView = 'month';
        inputRow.calendarColorOverrides = new Map<String, String>{
            'a0B000000000001AAA' => '#ff6600'
        };

        TeamCalendarUserPreferenceService.UserPreferenceDTO loaded;

        Test.startTest();
        TeamCalendarSecurityController.saveCurrentUserLayoutPreference(JSON.serialize(inputRow));
        loaded = TeamCalendarSecurityController.getCurrentUserLayoutPreference();
        Test.stopTest();

        System.assertEquals('#ff6600', loaded.calendarColorOverrides.get('a0B000000000001AAA'));
    }
}