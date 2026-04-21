@IsTest
private class CalendarEventChangeServiceTest {
    @IsTest
    static void triggerPublishesCalendarEventLifecycleChanges() {
        Team_Calendar__c calendarRow = createCalendar('Realtime Notifications');
        Datetime startValue = System.now().addDays(1);

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Realtime Sync',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = startValue,
            End__c = startValue.addHours(1),
            Status__c = 'Planned',
            Notes__c = 'Initial notes'
        );

        CalendarEventChangeService.resetTestPublishedEvents();
        insert eventRow;

        System.assertEquals(1, CalendarEventChangeService.testPublishedEvents.size());
        System.assertEquals('CREATED', CalendarEventChangeService.testPublishedEvents[0].Change_Type__c);
        System.assertEquals(
            String.valueOf(eventRow.Id),
            CalendarEventChangeService.testPublishedEvents[0].Calendar_Event_Id__c
        );

        CalendarEventChangeService.resetTestPublishedEvents();
        eventRow.Status__c = 'Confirmed';
        update eventRow;

        System.assertEquals(1, CalendarEventChangeService.testPublishedEvents.size());
        System.assertEquals('UPDATED', CalendarEventChangeService.testPublishedEvents[0].Change_Type__c);

        CalendarEventChangeService.resetTestPublishedEvents();
        eventRow.Sync_Status__c = 'Synced';
        eventRow.Last_Synced_At__c = System.now();
        update eventRow;

        System.assertEquals(
            0,
            CalendarEventChangeService.testPublishedEvents.size(),
            'Sync-only updates should not trigger board refresh notifications.'
        );

        CalendarEventChangeService.resetTestPublishedEvents();
        delete eventRow;

        System.assertEquals(1, CalendarEventChangeService.testPublishedEvents.size());
        System.assertEquals('DELETED', CalendarEventChangeService.testPublishedEvents[0].Change_Type__c);

        CalendarEventChangeService.resetTestPublishedEvents();
        undelete eventRow;

        System.assertEquals(1, CalendarEventChangeService.testPublishedEvents.size());
        System.assertEquals('RESTORED', CalendarEventChangeService.testPublishedEvents[0].Change_Type__c);
    }

    @IsTest
    static void hasBoardRelevantChangesIgnoresSyncFieldNoise() {
        Datetime startValue = System.now().addDays(2);
        Calendar_Event__c oldRow = new Calendar_Event__c(
            Name = 'Baseline',
            Status__c = 'Planned',
            Start__c = startValue,
            End__c = startValue.addHours(1)
        );
        Calendar_Event__c newRow = oldRow.clone(false, true, false, false);
        newRow.Sync_Status__c = 'Error';
        newRow.Sync_Error__c = 'Transient failure';
        newRow.Last_Synced_At__c = System.now();

        System.assertEquals(false, CalendarEventChangeService.hasBoardRelevantChanges(newRow, oldRow));

        newRow.Name = 'Renamed';
        System.assertEquals(true, CalendarEventChangeService.hasBoardRelevantChanges(newRow, oldRow));
    }

    private static Team_Calendar__c createCalendar(String nameValue) {
        Team_Calendar__c row = new Team_Calendar__c(
            Name = nameValue,
            Color__c = '#0176d3',
            Is_Active__c = true
        );
        insert row;
        return row;
    }
}