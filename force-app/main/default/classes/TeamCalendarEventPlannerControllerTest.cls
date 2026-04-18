@IsTest
private class TeamCalendarEventPlannerControllerTest {
    @IsTest
    static void getPlanningContext_returnsCustomerDefaultsAndAvailability() {
        User allowedUser = createUser('planner.allowed');
        insert new Calendar_User_Preference__c(
            Target_User__c = UserInfo.getUserId(),
            Allowed_Selected_User_Ids__c = JSON.serialize(new List<String>{ String.valueOf(allowedUser.Id) })
        );

        Team_Calendar__c calendarRow = createCalendar('Planner Calendar', allowedUser.Id);
        insert createEvent(
            'Overlap Meeting',
            calendarRow.Id,
            allowedUser.Id,
            Datetime.newInstance(Date.today(), Time.newInstance(10, 0, 0, 0)),
            Datetime.newInstance(Date.today(), Time.newInstance(11, 0, 0, 0))
        );

        Account accountRow = new Account(Name = 'Premier Marine');
        insert accountRow;

        Contact contactRow = new Contact(
            FirstName = 'Afton',
            LastName = 'Parker',
            AccountId = accountRow.Id
        );
        insert contactRow;

        Test.startTest();
        TeamCalendarEventPlannerController.PlanningContextDTO context =
            TeamCalendarEventPlannerController.getPlanningContext(
                allowedUser.Id,
                Datetime.newInstance(Date.today(), Time.newInstance(10, 30, 0, 0)),
                Datetime.newInstance(Date.today(), Time.newInstance(11, 30, 0, 0)),
                contactRow.Id,
                null,
                'Customer',
                'salesCall'
            );
        Test.stopTest();

        System.assertEquals(true, context.availability.allowed);
        System.assertEquals(true, context.availability.hasConflicts);
        System.assertEquals(1, context.availability.conflictCount);
        System.assertEquals('Overlap Meeting', context.availability.conflicts[0].name);
        System.assertEquals(contactRow.Id, context.customerContext.contactId);
        System.assertEquals(accountRow.Id, context.customerContext.resolvedAccountId);
        System.assertEquals('Afton Parker Sales Call', context.customerContext.suggestedName);
    }

    @IsTest
    static void getPlanningContext_rejectsDisallowedAssignedUser() {
        User disallowedUser = createUser('planner.disallowed');

        Test.startTest();
        TeamCalendarEventPlannerController.PlanningContextDTO context =
            TeamCalendarEventPlannerController.getPlanningContext(
                disallowedUser.Id,
                Datetime.newInstance(Date.today(), Time.newInstance(8, 0, 0, 0)),
                Datetime.newInstance(Date.today(), Time.newInstance(9, 0, 0, 0)),
                null,
                null,
                'Internal',
                'custom'
            );
        Test.stopTest();

        System.assertEquals(false, context.availability.allowed);
        System.assertEquals(false, context.availability.hasConflicts);
        System.assert(context.availability.summary.contains('Calendar Security Manager access'));
    }

    @IsTest
    static void resolveCalendarIdForAssignedUser_prefersAssignedUsersActiveCalendar() {
        User ownerAlpha = createUser('planner.calendar.alpha');
        User ownerBeta = createUser('planner.calendar.beta');

        Team_Calendar__c alphaCalendar = createCalendar('Alpha Calendar', ownerAlpha.Id);
        Team_Calendar__c betaCalendar = createCalendar('Beta Calendar', ownerBeta.Id);

        Test.startTest();
        Id resolvedForBeta = TeamCalendarEventPlannerController.resolveCalendarIdForAssignedUser(
            ownerBeta.Id,
            alphaCalendar.Id
        );
        Id preservedForBeta = TeamCalendarEventPlannerController.resolveCalendarIdForAssignedUser(
            ownerBeta.Id,
            betaCalendar.Id
        );
        Test.stopTest();

        System.assertEquals(betaCalendar.Id, resolvedForBeta);
        System.assertEquals(betaCalendar.Id, preservedForBeta);
    }

    @IsTest
    static void resolveCalendarIdForAssignedUser_returnsNullWhenAssignedUserHasNoTeamCalendar() {
        User ownerAlpha = createUser('planner.calendar.none');

        Test.startTest();
        Id resolvedCalendarId = TeamCalendarEventPlannerController.resolveCalendarIdForAssignedUser(
            ownerAlpha.Id,
            null
        );
        Test.stopTest();

        System.assertEquals(null, resolvedCalendarId);
    }

    private static Team_Calendar__c createCalendar(String nameValue, Id ownerId) {
        Team_Calendar__c row = new Team_Calendar__c();
        row.Name = nameValue;
        row.OwnerId = ownerId;
        row.Color__c = '#0176D3';
        row.Is_Active__c = true;
        row.Google_Sync_Enabled__c = false;
        insert row;
        return row;
    }

    private static Calendar_Event__c createEvent(
        String nameValue,
        Id calendarId,
        Id ownerId,
        Datetime startValue,
        Datetime endValue
    ) {
        return new Calendar_Event__c(
            Name = nameValue,
            Calendar__c = calendarId,
            OwnerId = ownerId,
            Start__c = startValue,
            End__c = endValue,
            All_Day__c = false,
            Status__c = 'Confirmed'
        );
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
            FirstName = 'Planner',
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

        return row;
    }
}