/**
 * @description       :
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             :
 * @last modified on  : 04-11-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@IsTest
private class TeamCalendarUserPreferenceServiceTest {
    @IsTest
    static void getPreferenceForCurrentUser_returnsDefaultsWhenNoRecordExists() {
        Test.startTest();
        TeamCalendarUserPreferenceService.UserPreferenceDTO dto =
            TeamCalendarUserPreferenceService.getPreferenceForCurrentUser();
        Test.stopTest();

        System.assertNotEquals(null, dto);
        System.assertEquals('month', dto.defaultView);
        System.assertEquals(true, dto.showSecurityButton);
        System.assertEquals(true, dto.showRefreshButton);
        System.assertEquals(true, dto.showTodayButton);
        System.assertEquals(true, dto.showPrevNextButtons);
        System.assertEquals(true, dto.showNewButton);
        System.assertEquals(true, dto.showFiltersButton);
        System.assertEquals(true, dto.showSelectUsersBox);
        System.assertEquals(true, dto.showFilterControls);
    }

    @IsTest
    static void savePreferenceForTargetUser_roundTripsValues() {
        Id targetUserId = UserInfo.getUserId();

        TeamCalendarUserPreferenceService.UserPreferenceInput inputRow =
            new TeamCalendarUserPreferenceService.UserPreferenceInput();
        inputRow.defaultView = 'agenda';
        inputRow.defaultCalendarViewId = '03AV000000TEST01';
        inputRow.defaultStatus = 'Confirmed';
        inputRow.showSecurityButton = false;
        inputRow.showRefreshButton = true;
        inputRow.showTodayButton = false;
        inputRow.showPrevNextButtons = true;
        inputRow.showNewButton = false;
        inputRow.showFiltersButton = true;
        inputRow.showSelectUsersBox = false;
        inputRow.showFilterControls = true;
        inputRow.showWeekends = false;
        inputRow.autoExpandDayHeight = true;
        inputRow.wrapEventTitles = false;
        inputRow.compactEventDensity = true;
        inputRow.allowedSelectedUserIds = new List<String>{
            String.valueOf(targetUserId),
            '005000000000001'
        };
        inputRow.isActive = true;

        Test.startTest();
        TeamCalendarUserPreferenceService.UserPreferenceDTO saved =
            TeamCalendarUserPreferenceService.savePreferenceForTargetUser(targetUserId, inputRow);

        TeamCalendarUserPreferenceService.UserPreferenceDTO loaded =
            TeamCalendarUserPreferenceService.getPreferenceForTargetUser(targetUserId);
        Test.stopTest();

        System.assertNotEquals(null, saved);
        System.assertNotEquals(null, loaded);
        System.assertEquals('agenda', loaded.defaultView);
        System.assertEquals('03AV000000TEST01', loaded.defaultCalendarViewId);
        System.assertEquals('Confirmed', loaded.defaultStatus);
        System.assertEquals(false, loaded.showSecurityButton);
        System.assertEquals(true, loaded.showRefreshButton);
        System.assertEquals(false, loaded.showTodayButton);
        System.assertEquals(true, loaded.showPrevNextButtons);
        System.assertEquals(false, loaded.showNewButton);
        System.assertEquals(true, loaded.showFiltersButton);
        System.assertEquals(false, loaded.showSelectUsersBox);
        System.assertEquals(true, loaded.showFilterControls);
        System.assertEquals(false, loaded.showWeekends);
        System.assertEquals(true, loaded.autoExpandDayHeight);
        System.assertEquals(false, loaded.wrapEventTitles);
        System.assertEquals(true, loaded.compactEventDensity);
        System.assertEquals(2, loaded.allowedSelectedUserIds.size());
        System.assertEquals(String.valueOf(targetUserId), loaded.allowedSelectedUserIds[0]);
    }

    @IsTest
    static void setShowSecurityButtonForAllUsers_updatesExistingAndDefaultRows() {
        Id targetUserId = UserInfo.getUserId();

        insert new Calendar_User_Preference__c(
            Target_User__c = targetUserId,
            Default_View__c = 'week',
            Show_Security_Button__c = true,
            Show_Refresh_Button__c = true,
            Show_Today_Button__c = true,
            Show_Prev_Next_Buttons__c = true,
            Show_New_Button__c = true,
            Show_Filters_Button__c = true,
            Show_Select_Users_Box__c = true,
            Show_Filter_Controls__c = true,
            Show_Weekends__c = true,
            Auto_Expand_Day_Height__c = true,
            Wrap_Event_Titles__c = true,
            Compact_Event_Density__c = false,
            Is_Active__c = true
        );

        Test.startTest();
        Integer updatedCount = TeamCalendarUserPreferenceService.setShowSecurityButtonForAllUsers(false);
        TeamCalendarUserPreferenceService.UserPreferenceDTO loaded =
            TeamCalendarUserPreferenceService.getPreferenceForTargetUser(targetUserId);
        Test.stopTest();

        System.assert(updatedCount > 0, 'Expected at least one user preference row to be updated.');
        System.assertEquals(false, loaded.showSecurityButton);
        System.assertEquals('week', loaded.defaultView, 'Other preferences should be preserved.');
    }

    @IsTest
    static void setLayoutFieldForAllUsers_updatesSupportedBooleanFields() {
        Id targetUserId = UserInfo.getUserId();

        insert new Calendar_User_Preference__c(
            Target_User__c = targetUserId,
            Default_View__c = 'month',
            Show_Filters_Button__c = true,
            Is_Active__c = true
        );

        Test.startTest();
        Integer updatedCount = TeamCalendarUserPreferenceService.setLayoutFieldForAllUsers(
            'showFiltersButton',
            false
        );
        TeamCalendarUserPreferenceService.UserPreferenceDTO loaded =
            TeamCalendarUserPreferenceService.getPreferenceForTargetUser(targetUserId);
        Test.stopTest();

        System.assert(updatedCount > 0, 'Expected at least one user preference row to be updated.');
        System.assertEquals(false, loaded.showFiltersButton);
        System.assertEquals('month', loaded.defaultView);
    }
}