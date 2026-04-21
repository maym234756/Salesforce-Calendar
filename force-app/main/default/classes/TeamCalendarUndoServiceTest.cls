@IsTest
private class TeamCalendarUndoServiceTest {
    @IsTest
    static void undeleteCalendarEvent_requiresRecordId() {
        Boolean threw = false;
        try {
            TeamCalendarUndoService.undeleteCalendarEvent(null);
        } catch (AuraHandledException ex) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Expected undeleteCalendarEvent to reject a missing id.');
    }

    @IsTest
    static void undeleteCalendarEvent_throwsWhenRecordIsMissing() {
        Boolean threw = false;
        try {
            TeamCalendarUndoService.undeleteCalendarEvent('a1B000000000999AAA');
        } catch (AuraHandledException ex) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Expected undeleteCalendarEvent to reject a missing record.');
    }

    @IsTest
    static void undeleteTask_restoresDeletedTaskWhenCalendarViewRuleAllowsEdit() {
        Task taskRow = new Task(
            Subject = 'Restore Me Task',
            Status = 'Not Started',
            Priority = 'Normal',
            ActivityDate = Date.today()
        );
        insert taskRow;

        insert new Calendar_Access_Rule__c(
            Target_User__c = UserInfo.getUserId(),
            Calendar_View_Id__c = '00B000000000012AAA',
            Calendar_View_Name__c = 'Restore Tasks',
            Can_Edit__c = true,
            Is_Active__c = true
        );

        delete taskRow;

        Test.startTest();
        Id restoredTaskId = TeamCalendarUndoService.undeleteTask(
            String.valueOf(taskRow.Id),
            '00B000000000012AAA'
        );
        Test.stopTest();

        Task restoredTask = [
            SELECT Id, Subject, IsDeleted
            FROM Task
            WHERE Id = :taskRow.Id
            LIMIT 1
            ALL ROWS
        ];
        System.assertEquals(taskRow.Id, restoredTaskId);
        System.assertEquals('Restore Me Task', restoredTask.Subject);
        System.assertEquals(false, restoredTask.IsDeleted);
    }

    @IsTest
    static void undeleteTask_requiresTaskId() {
        Boolean threw = false;
        try {
            TeamCalendarUndoService.undeleteTask(null, '00B000000000012AAA');
        } catch (AuraHandledException ex) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Expected undeleteTask to reject a missing task id.');
    }

    @IsTest
    static void undeleteTask_requiresValidCalendarViewContext() {
        Task taskRow = new Task(
            Subject = 'Invalid Calendar View Task',
            Status = 'Not Started',
            Priority = 'Normal',
            ActivityDate = Date.today()
        );
        insert taskRow;

        Boolean threw = false;
        try {
            TeamCalendarUndoService.undeleteTask(String.valueOf(taskRow.Id), 'not-an-id');
        } catch (AuraHandledException ex) {
            threw = true;
        }
        System.assertEquals(true, threw, 'Expected undeleteTask to reject an invalid calendar view id.');
    }

    @IsTest
    static void undeleteTask_returnsIdWhenTaskAlreadyActive() {
        Task taskRow = new Task(
            Subject = 'Already Active Task',
            Status = 'Not Started',
            Priority = 'Normal',
            ActivityDate = Date.today()
        );
        insert taskRow;

        insert new Calendar_Access_Rule__c(
            Target_User__c = UserInfo.getUserId(),
            Calendar_View_Id__c = '00B000000000013AAA',
            Calendar_View_Name__c = 'Active Tasks',
            Can_Edit__c = true,
            Is_Active__c = true
        );

        Test.startTest();
        Id restoredTaskId = TeamCalendarUndoService.undeleteTask(
            String.valueOf(taskRow.Id),
            '00B000000000013AAA'
        );
        Test.stopTest();

        System.assertEquals(taskRow.Id, restoredTaskId);
        System.assertEquals(1, [SELECT COUNT() FROM Task WHERE Id = :taskRow.Id]);
    }

    @IsTest
    static void undeleteCalendarEvent_restoresDeletedSelfOwnedEvent() {
        Team_Calendar__c calendarRow = new Team_Calendar__c(
            Name = 'Restore Event Calendar',
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = false
        );
        insert calendarRow;

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Restore Me Event',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.today(), Time.newInstance(11, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.today(), Time.newInstance(12, 0, 0, 0)),
            Status__c = 'Planned',
            All_Day__c = false
        );
        insert eventRow;

        delete eventRow;

        Test.startTest();
        Id restoredEventId = TeamCalendarUndoService.undeleteCalendarEvent(String.valueOf(eventRow.Id));
        Test.stopTest();

        Calendar_Event__c restoredEvent = [
            SELECT Id, Name, IsDeleted
            FROM Calendar_Event__c
            WHERE Id = :eventRow.Id
            LIMIT 1
            ALL ROWS
        ];
        System.assertEquals(eventRow.Id, restoredEventId);
        System.assertEquals('Restore Me Event', restoredEvent.Name);
        System.assertEquals(false, restoredEvent.IsDeleted);
    }

    @IsTest
    static void undeleteCalendarEvent_returnsIdWhenEventAlreadyActive() {
        Team_Calendar__c calendarRow = new Team_Calendar__c(
            Name = 'Active Event Calendar',
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = false
        );
        insert calendarRow;

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Already Active Event',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.today(), Time.newInstance(8, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.today(), Time.newInstance(9, 0, 0, 0)),
            Status__c = 'Planned',
            All_Day__c = false
        );
        insert eventRow;

        Test.startTest();
        Id restoredEventId = TeamCalendarUndoService.undeleteCalendarEvent(String.valueOf(eventRow.Id));
        Test.stopTest();

        System.assertEquals(eventRow.Id, restoredEventId);
        System.assertEquals(1, [SELECT COUNT() FROM Calendar_Event__c WHERE Id = :eventRow.Id]);
    }
}