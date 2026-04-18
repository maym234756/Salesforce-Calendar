@IsTest
private class TeamCalendarReminderServiceTest {
    @IsTest
    static void processDueReminders_createsReminderTaskAndMarksEvent() {
        Team_Calendar__c calendarRow = createCalendar('Reminder Calendar');
        Datetime startValue = System.now().addMinutes(10);

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Service Walkthrough',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = startValue,
            End__c = startValue.addHours(1),
            Status__c = 'Planned',
            Reminder_Offset_Minutes__c = '15 Minutes'
        );
        insert eventRow;

        Test.startTest();
        Integer createdCount = TeamCalendarReminderService.processDueReminders(System.now());
        Test.stopTest();

        System.assertEquals(1, createdCount, 'Expected a reminder task to be created.');

        Task createdTask = [
            SELECT Id, OwnerId, WhatId, Subject, Description
            FROM Task
            WHERE WhatId = :eventRow.Id
            LIMIT 1
        ];

        System.assertEquals(UserInfo.getUserId(), createdTask.OwnerId);
        System.assertEquals(eventRow.Id, createdTask.WhatId);
        System.assertEquals('Calendar Reminder: Service Walkthrough', createdTask.Subject);
        System.assert(createdTask.Description.contains('Reminder Preference: 15 Minutes'));

        Calendar_Event__c refreshedEvent = [
            SELECT Reminder_Sent_At__c
            FROM Calendar_Event__c
            WHERE Id = :eventRow.Id
            LIMIT 1
        ];

        System.assertNotEquals(null, refreshedEvent.Reminder_Sent_At__c);
    }

    @IsTest
    static void processDueReminders_doesNotDuplicateExistingTask() {
        Team_Calendar__c calendarRow = createCalendar('No Duplicate Calendar');
        Datetime startValue = System.now().addMinutes(5);

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Duplicate Guard',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = startValue,
            End__c = startValue.addHours(1),
            Status__c = 'Confirmed',
            Reminder_Offset_Minutes__c = '15 Minutes'
        );
        insert eventRow;

        insert new Task(
            WhatId = eventRow.Id,
            OwnerId = UserInfo.getUserId(),
            Subject = 'Calendar Reminder: Duplicate Guard'
        );

        Test.startTest();
        Integer createdCount = TeamCalendarReminderService.processDueReminders(System.now());
        Test.stopTest();

        System.assertEquals(0, createdCount, 'Expected the service to reuse the existing reminder task.');
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Task WHERE WhatId = :eventRow.Id],
            'Expected only the original task to remain.'
        );

        Calendar_Event__c refreshedEvent = [
            SELECT Reminder_Sent_At__c
            FROM Calendar_Event__c
            WHERE Id = :eventRow.Id
            LIMIT 1
        ];

        System.assertNotEquals(null, refreshedEvent.Reminder_Sent_At__c);
    }

    @IsTest
    static void updatingReminderSettings_resetsStateAndDeletesOpenReminderTask() {
        Team_Calendar__c calendarRow = createCalendar('Reset Calendar');
        Datetime startValue = System.now().addHours(2);

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Change Me',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = startValue,
            End__c = startValue.addHours(1),
            Status__c = 'Planned',
            Reminder_Offset_Minutes__c = '30 Minutes',
            Reminder_Sent_At__c = System.now()
        );
        insert eventRow;

        insert new Task(
            WhatId = eventRow.Id,
            OwnerId = UserInfo.getUserId(),
            Subject = 'Calendar Reminder: Change Me'
        );

        eventRow.Reminder_Offset_Minutes__c = 'None';
        update eventRow;

        Calendar_Event__c refreshedEvent = [
            SELECT Reminder_Sent_At__c, Reminder_Offset_Minutes__c
            FROM Calendar_Event__c
            WHERE Id = :eventRow.Id
            LIMIT 1
        ];

        System.assertEquals('None', refreshedEvent.Reminder_Offset_Minutes__c);
        System.assertEquals(null, refreshedEvent.Reminder_Sent_At__c);
        System.assertEquals(
            0,
            [SELECT COUNT() FROM Task WHERE WhatId = :eventRow.Id],
            'Expected reminder tasks to be removed after reminders are disabled.'
        );
    }

    @IsTest
    static void scheduler_executesReminderService() {
        Team_Calendar__c calendarRow = createCalendar('Scheduler Calendar');
        Datetime startValue = System.now().addMinutes(20);

        insert new Calendar_Event__c(
            Name = 'Scheduler Event',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = startValue,
            End__c = startValue.addHours(1),
            Status__c = 'Planned',
            Reminder_Offset_Minutes__c = '30 Minutes'
        );

        Test.startTest();
        (new TeamCalendarReminderScheduler()).execute(null);
        Test.stopTest();

        System.assertEquals(
            1,
            [SELECT COUNT() FROM Task WHERE Subject = 'Calendar Reminder: Scheduler Event'],
            'Expected the scheduler to create the reminder task.'
        );
    }

    private static Team_Calendar__c createCalendar(String nameValue) {
        Team_Calendar__c row = new Team_Calendar__c();
        row.Name = nameValue;
        row.OwnerId = UserInfo.getUserId();
        row.Color__c = '#0176D3';
        row.Is_Active__c = true;
        row.Google_Sync_Enabled__c = false;
        insert row;
        return row;
    }
}