/**
 * @description       :
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             :
 * @last modified on  : 04-10-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@IsTest
private class TeamCalendarBoardControllerTest {
    @IsTest(SeeAllData=true)
    static void getCalendars_returnsCalendarViewRowsWhenAvailable() {
        Test.startTest();
        List<TeamCalendarBoardController.CalendarOptionDTO> results =
            TeamCalendarBoardController.getCalendars();
        Test.stopTest();

        System.assertNotEquals(null, results, 'Calendar view results should never be null.');

        if (!results.isEmpty()) {
            System.assertNotEquals(null, results[0].id, 'Expected a calendar id.');
            System.assertNotEquals(null, results[0].name, 'Expected a calendar name.');
        }
    }

    @IsTest
    static void getActiveUsers_returnsOnlyActiveUsers() {
        User createdUser = createUser('active.user.one');

        Test.startTest();
        List<TeamCalendarBoardController.UserOptionDTO> results =
            TeamCalendarBoardController.getActiveUsers();
        Test.stopTest();

        Set<Id> returnedIds = new Set<Id>();
        for (TeamCalendarBoardController.UserOptionDTO row : results) {
            returnedIds.add(row.id);
        }

        System.assert(
            returnedIds.contains(UserInfo.getUserId()),
            'Current user should be returned.'
        );
        System.assert(
            returnedIds.contains(createdUser.Id),
            'Created active user should be returned.'
        );

        List<User> returnedUsers = [
            SELECT Id, IsActive
            FROM User
            WHERE Id IN :returnedIds
        ];

        for (User returnedUser : returnedUsers) {
            System.assertEquals(
                true,
                returnedUser.IsActive,
                'Only active users should be returned.'
            );
        }
    }

    @IsTest
    static void getActiveUsers_filtersByAllowedSelectedUsersWhenConfigured() {
        User approvedUser = createUser('active.user.approved');
        User blockedUser = createUser('active.user.blocked');

        insert new Calendar_User_Preference__c(
            Target_User__c = UserInfo.getUserId(),
            Default_View__c = 'month',
            Allowed_Selected_User_Ids__c = JSON.serialize(
                new List<String>{ String.valueOf(approvedUser.Id) }
            ),
            Is_Active__c = true
        );

        Test.startTest();
        List<TeamCalendarBoardController.UserOptionDTO> results =
            TeamCalendarBoardController.getActiveUsers();
        Test.stopTest();

        Set<Id> returnedIds = new Set<Id>();
        for (TeamCalendarBoardController.UserOptionDTO row : results) {
            returnedIds.add(row.id);
        }

        System.assert(returnedIds.contains(UserInfo.getUserId()));
        System.assert(returnedIds.contains(approvedUser.Id));
        System.assert(!returnedIds.contains(blockedUser.Id));
    }

    @IsTest(SeeAllData=true)
    static void getUserCalendars_returnsEmptyForNoUsers() {
        Test.startTest();
        List<TeamCalendarBoardController.CalendarOptionDTO> emptyResults =
            TeamCalendarBoardController.getUserCalendars(new List<String>());
        Test.stopTest();

        System.assertEquals(
            0,
            emptyResults.size(),
            'Empty selected users should return no calendars.'
        );
    }

    @IsTest(SeeAllData=true)
    static void getUserCalendars_returnsScopedResultsWhenCalendarViewsExist() {
        List<CalendarView> candidates = [
            SELECT Id, Name, OwnerId
            FROM CalendarView
            WHERE OwnerId != null
            LIMIT 1
        ];

        if (candidates.isEmpty()) {
            return;
        }

        Id ownerId = candidates[0].OwnerId;

        Test.startTest();
        List<TeamCalendarBoardController.CalendarOptionDTO> scopedResults =
            TeamCalendarBoardController.getUserCalendars(
                new List<String>{ String.valueOf(ownerId) }
            );
        Test.stopTest();

        System.assertNotEquals(
            null,
            scopedResults,
            'Scoped calendar view results should not be null.'
        );
        System.assert(
            scopedResults.size() > 0,
            'Expected at least one calendar option for the selected user.'
        );

        for (TeamCalendarBoardController.CalendarOptionDTO row : scopedResults) {
            System.assertEquals(ownerId, row.assignedUserId);
            System.assertNotEquals(null, row.name);
        }
    }

    @IsTest(SeeAllData=true)
    static void getUserCalendars_includesSharedCalendarViewsForTargetUsers() {
        List<CalendarView> candidates = [
            SELECT Id, Name, OwnerId
            FROM CalendarView
            WHERE OwnerId != null
            LIMIT 1
        ];

        if (candidates.isEmpty()) {
            return;
        }

        User targetUser = createUser('shared.view.target');

        insert new Calendar_Access_Rule__c(
            Target_User__c = targetUser.Id,
            Calendar_View_Id__c = String.valueOf(candidates[0].Id),
            Calendar_View_Name__c = candidates[0].Name,
            Calendar_View_Owner_Id__c = candidates[0].OwnerId,
            Can_View__c = true,
            Can_Create__c = true,
            Can_Edit__c = false,
            Is_Active__c = true
        );

        Test.startTest();
        List<TeamCalendarBoardController.CalendarOptionDTO> results =
            TeamCalendarBoardController.getUserCalendars(
                new List<String>{ String.valueOf(targetUser.Id) }
            );
        Test.stopTest();

        Boolean foundSharedView = false;
        for (TeamCalendarBoardController.CalendarOptionDTO row : results) {
            if (row.id == candidates[0].Id && row.assignedUserId == targetUser.Id) {
                foundSharedView = true;
                System.assertNotEquals(null, row.canCreate);
                System.assertNotEquals(null, row.canEdit);
                break;
            }
        }

        System.assertEquals(
            true,
            foundSharedView,
            'Expected the granted shared calendar view to be returned for the target user.'
        );
    }

    @IsTest
    static void getEventsForRange_includesOverlapsAndAppliesFilters() {
        User ownerAlpha = createUser('calendar.owner.alpha');
        User ownerBeta = createUser('calendar.owner.beta');

        Team_Calendar__c alphaCalendarOne = createCalendar(
            'Avail - Conroe',
            '#0176d3',
            true,
            true,
            'alpha.one@example.com',
            ownerAlpha.Id
        );
        Team_Calendar__c alphaCalendarTwo = createCalendar(
            'Working Deals',
            '#1b96ff',
            true,
            true,
            'alpha.two@example.com',
            ownerAlpha.Id
        );
        Team_Calendar__c betaCalendar = createCalendar(
            'Avail - Beaumont',
            '#2e844a',
            true,
            true,
            'beta@example.com',
            ownerBeta.Id
        );

        Calendar_Event__c overlapEvent = createEvent(
            'Overlap Event',
            alphaCalendarOne.Id,
            ownerAlpha.Id,
            dt(2026, 3, 31, 23, 0),
            dt(2026, 4, 1, 1, 0),
            false,
            'Planned',
            'Starts before the visible range'
        );

        Calendar_Event__c confirmedEvent = createEvent(
            'Confirmed Event',
            alphaCalendarTwo.Id,
            ownerAlpha.Id,
            dt(2026, 4, 9, 9, 0),
            dt(2026, 4, 9, 10, 0),
            false,
            'Confirmed',
            'Inside the visible range'
        );

        Calendar_Event__c alphaSecondEvent = createEvent(
            'Alpha Second Event',
            alphaCalendarOne.Id,
            ownerAlpha.Id,
            dt(2026, 4, 12, 13, 0),
            dt(2026, 4, 12, 14, 0),
            false,
            'Planned',
            'Second alpha calendar one event'
        );

        Calendar_Event__c betaEvent = createEvent(
            'Beta Event',
            betaCalendar.Id,
            ownerBeta.Id,
            dt(2026, 4, 10, 13, 0),
            dt(2026, 4, 10, 14, 0),
            false,
            'Cancelled',
            'Beta calendar event'
        );

        insert new List<Calendar_Event__c>{
            overlapEvent,
            confirmedEvent,
            alphaSecondEvent,
            betaEvent
        };

        String perUserCalendarJson = JSON.serialize(
            new Map<String, Object>{
                String.valueOf(ownerAlpha.Id) => new List<String>{ 'Avail - Conroe' },
                String.valueOf(ownerBeta.Id) => new List<String>()
            }
        );

        Test.startTest();
        List<TeamCalendarBoardController.CalendarEventDTO> allResults =
            TeamCalendarBoardController.getEventsForRange(
                '2026-04-01',
                '2026-04-30',
                null,
                null,
                null,
                null
            );

        List<TeamCalendarBoardController.CalendarEventDTO> ownerAlphaOnly =
            TeamCalendarBoardController.getEventsForRange(
                '2026-04-01',
                '2026-04-30',
                null,
                null,
                new List<String>{ String.valueOf(ownerAlpha.Id) },
                null
            );

        List<TeamCalendarBoardController.CalendarEventDTO> confirmedOnly =
            TeamCalendarBoardController.getEventsForRange(
                '2026-04-01',
                '2026-04-30',
                null,
                'Confirmed',
                null,
                null
            );

        List<TeamCalendarBoardController.CalendarEventDTO> mixedUserCalendarFiltered =
            TeamCalendarBoardController.getEventsForRange(
                '2026-04-01',
                '2026-04-30',
                null,
                null,
                new List<String>{ String.valueOf(ownerAlpha.Id), String.valueOf(ownerBeta.Id) },
                perUserCalendarJson
            );
        Test.stopTest();

        System.assertEquals(
            4,
            allResults.size(),
            'Expected all overlapping and in-range events.'
        );

        System.assertEquals(
            3,
            ownerAlphaOnly.size(),
            'Only owner alpha events should be returned.'
        );
        for (TeamCalendarBoardController.CalendarEventDTO row : ownerAlphaOnly) {
            System.assertEquals(ownerAlpha.Id, row.ownerId);
        }

        System.assertEquals(
            1,
            confirmedOnly.size(),
            'Only confirmed events should be returned.'
        );
        System.assertEquals(confirmedEvent.Id, confirmedOnly[0].id);
        System.assertEquals('Confirmed', confirmedOnly[0].status);

        System.assertEquals(
            3,
            mixedUserCalendarFiltered.size(),
            'Alpha should be limited to one selected calendar while beta remains fully included.'
        );

        Set<Id> filteredIds = new Set<Id>();
        for (TeamCalendarBoardController.CalendarEventDTO row : mixedUserCalendarFiltered) {
            filteredIds.add(row.id);
        }

        System.assert(
            filteredIds.contains(overlapEvent.Id),
            'Alpha calendar one overlap event should remain.'
        );
        System.assert(
            filteredIds.contains(alphaSecondEvent.Id),
            'Alpha calendar one second event should remain.'
        );
        System.assert(
            filteredIds.contains(betaEvent.Id),
            'Beta event should remain.'
        );
        System.assert(
            !filteredIds.contains(confirmedEvent.Id),
            'Alpha calendar two event should be filtered out.'
        );
    }

    @IsTest
    static void getEventsForRange_requiresDates() {
        Boolean missingStartThrew = false;
        Boolean missingEndThrew = false;

        try {
            TeamCalendarBoardController.getEventsForRange(
                null,
                '2026-04-30',
                null,
                null,
                null,
                null
            );
        } catch (Exception ex) {
            missingStartThrew = true;
        }

        try {
            TeamCalendarBoardController.getEventsForRange(
                '2026-04-01',
                null,
                null,
                null,
                null,
                null
            );
        } catch (Exception ex) {
            missingEndThrew = true;
        }

        System.assertEquals(
            true,
            missingStartThrew,
            'Expected an exception when start date is missing.'
        );
        System.assertEquals(
            true,
            missingEndThrew,
            'Expected an exception when end date is missing.'
        );
    }

    @IsTest
    static void getEventsForRange_hidesPersonalEventsFromNonOwners() {
        User ownerAlpha = createUser('personal.owner.alpha');
        User viewerBeta = createUser('personal.viewer.beta');

        Team_Calendar__c alphaCalendar = createCalendar(
            'Private Alpha Calendar',
            '#1b96ff',
            true,
            false,
            null,
            ownerAlpha.Id
        );

        Calendar_Event__c personalEvent = createEvent(
            'Alpha Personal Event',
            alphaCalendar.Id,
            ownerAlpha.Id,
            dt(2026, 4, 14, 9, 0),
            dt(2026, 4, 14, 10, 0),
            false,
            'Planned',
            'Should stay owner-only.'
        );
        personalEvent.Private_To_Owner__c = true;

        Calendar_Event__c sharedEvent = createEvent(
            'Alpha Shared Event',
            alphaCalendar.Id,
            ownerAlpha.Id,
            dt(2026, 4, 14, 11, 0),
            dt(2026, 4, 14, 12, 0),
            false,
            'Planned',
            'Should remain visible to others.'
        );

        insert new List<Calendar_Event__c>{ personalEvent, sharedEvent };

        List<TeamCalendarBoardController.CalendarEventDTO> ownerResults;
        List<TeamCalendarBoardController.CalendarEventDTO> viewerResults;

        System.runAs(ownerAlpha) {
            ownerResults = TeamCalendarBoardController.getEventsForRange(
                '2026-04-01',
                '2026-04-30',
                null,
                null,
                new List<String>{ String.valueOf(ownerAlpha.Id) },
                null
            );
        }

        System.runAs(viewerBeta) {
            viewerResults = TeamCalendarBoardController.getEventsForRange(
                '2026-04-01',
                '2026-04-30',
                null,
                null,
                new List<String>{ String.valueOf(ownerAlpha.Id) },
                null
            );
        }

        Set<Id> ownerEventIds = new Set<Id>();
        for (TeamCalendarBoardController.CalendarEventDTO row : ownerResults) {
            ownerEventIds.add(row.id);
        }

        Set<Id> viewerEventIds = new Set<Id>();
        for (TeamCalendarBoardController.CalendarEventDTO row : viewerResults) {
            viewerEventIds.add(row.id);
        }

        System.assert(ownerEventIds.contains(personalEvent.Id));
        System.assert(ownerEventIds.contains(sharedEvent.Id));
        System.assert(!viewerEventIds.contains(personalEvent.Id));
        System.assert(viewerEventIds.contains(sharedEvent.Id));
    }

    @IsTest
    static void getPdfExportPageUrl_returnsVisualforcePath() {
        Test.startTest();
        String pdfUrl = TeamCalendarBoardController.getPdfExportPageUrl();
        Test.stopTest();

        System.assertNotEquals(null, pdfUrl);
        System.assertEquals(true, String.isNotBlank(pdfUrl));
    }

    private static Team_Calendar__c createCalendar(
        String nameValue,
        String colorValue,
        Boolean isActive,
        Boolean googleSyncEnabled,
        String googleCalendarId,
        Id ownerId
    ) {
        Team_Calendar__c row = new Team_Calendar__c();
        row.Name = nameValue;
        row.OwnerId = ownerId;
        row.Color__c = colorValue;
        row.Is_Active__c = isActive;
        row.Google_Sync_Enabled__c = googleSyncEnabled;
        row.Google_Calendar_Id__c = googleCalendarId;
        insert row;
        return row;
    }

    private static Calendar_Event__c createEvent(
        String nameValue,
        Id calendarId,
        Id ownerId,
        Datetime startValue,
        Datetime endValue,
        Boolean allDayValue,
        String statusValue,
        String notesValue
    ) {
        Calendar_Event__c row = new Calendar_Event__c();
        row.Name = nameValue;
        row.Calendar__c = calendarId;
        row.OwnerId = ownerId;
        row.Start__c = startValue;
        row.End__c = endValue;
        row.All_Day__c = allDayValue;
        row.Status__c = statusValue;
        row.Notes__c = notesValue;
        return row;
    }

    private static User createUser(String uniqueStem) {
        Profile standardProfile = [
            SELECT Id
            FROM Profile
            WHERE Id = :UserInfo.getProfileId()
            LIMIT 1
        ];

        String uniqueValue =
            uniqueStem + '.' + System.currentTimeMillis() + '.' + Math.abs(Crypto.getRandomInteger());

        User row = new User(
            FirstName = 'Calendar',
            LastName = uniqueStem.replace('.', ' '),
            Alias = uniqueStem.replace('.', '').left(8),
            Email = uniqueValue + '@example.com',
            Username = uniqueValue + '@example.com',
            TimeZoneSidKey = 'America/New_York',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US',
            ProfileId = standardProfile.Id
        );
        insert row;

        return [
            SELECT Id, Name
            FROM User
            WHERE Id = :row.Id
            LIMIT 1
        ];
    }

    private static Datetime dt(
        Integer yearValue,
        Integer monthValue,
        Integer dayValue,
        Integer hourValue,
        Integer minuteValue
    ) {
        return Datetime.newInstance(
            Date.newInstance(yearValue, monthValue, dayValue),
            Time.newInstance(hourValue, minuteValue, 0, 0)
        );
    }
}