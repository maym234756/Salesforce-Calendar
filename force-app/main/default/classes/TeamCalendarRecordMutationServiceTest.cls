@IsTest
private class TeamCalendarRecordMutationServiceTest {
    @IsTest
    static void createCalendarEventSeries_createsOwnersCalendarWhenMissing() {
        TeamCalendarRecordMutationService.CalendarEventMutationInput primaryEvent =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        primaryEvent.ownerId = String.valueOf(UserInfo.getUserId());
        primaryEvent.name = 'Self Scheduled Event';
        primaryEvent.startValue = '2026-04-15T14:00:00.000Z';
        primaryEvent.endValue = '2026-04-15T15:00:00.000Z';
        primaryEvent.status = 'Planned';
        primaryEvent.appointmentType = 'Personal';
        primaryEvent.privateToOwner = true;
        primaryEvent.reminderOffset = 'None';

        TeamCalendarRecordMutationService.CalendarEventSeriesInput request =
            new TeamCalendarRecordMutationService.CalendarEventSeriesInput();
        request.primaryEvent = primaryEvent;
        request.followUpEvents = new List<TeamCalendarRecordMutationService.CalendarEventMutationInput>();

        Test.startTest();
        TeamCalendarRecordMutationService.MutationResultDTO result =
            TeamCalendarRecordMutationService.createCalendarEventSeries(JSON.serialize(request));
        Test.stopTest();

        System.assertNotEquals(null, result.recordId);

        List<Team_Calendar__c> calendars = [
            SELECT Id, OwnerId
            FROM Team_Calendar__c
            WHERE OwnerId = :UserInfo.getUserId()
        ];
        System.assertEquals(1, calendars.size());

        Calendar_Event__c savedRow = [
            SELECT Id, Calendar__c, OwnerId, Name
            FROM Calendar_Event__c
            WHERE Id = :result.recordId
            LIMIT 1
        ];
        System.assertEquals(calendars[0].Id, savedRow.Calendar__c);
        System.assertEquals(UserInfo.getUserId(), savedRow.OwnerId);
        System.assertEquals('Self Scheduled Event', savedRow.Name);
    }

    @IsTest
    static void createCalendarEventSeries_createsFollowUpEvents() {
        Team_Calendar__c calendarRow = new Team_Calendar__c(
            Name = 'Primary Calendar',
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = false
        );
        insert calendarRow;

        TeamCalendarRecordMutationService.CalendarEventMutationInput primaryEvent =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        primaryEvent.calendarId = String.valueOf(calendarRow.Id);
        primaryEvent.ownerId = String.valueOf(UserInfo.getUserId());
        primaryEvent.name = 'Primary Event';
        primaryEvent.startValue = '2026-04-20T14:00:00.000Z';
        primaryEvent.endValue = '2026-04-20T15:00:00.000Z';
        primaryEvent.status = 'Planned';

        TeamCalendarRecordMutationService.CalendarEventMutationInput followUpEvent =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        followUpEvent.calendarId = String.valueOf(calendarRow.Id);
        followUpEvent.ownerId = String.valueOf(UserInfo.getUserId());
        followUpEvent.name = 'Follow Up Event';
        followUpEvent.startValue = '2026-04-21T14:00:00.000Z';
        followUpEvent.endValue = '2026-04-21T15:00:00.000Z';
        followUpEvent.status = 'Planned';

        TeamCalendarRecordMutationService.CalendarEventSeriesInput request =
            new TeamCalendarRecordMutationService.CalendarEventSeriesInput();
        request.primaryEvent = primaryEvent;
        request.followUpEvents = new List<TeamCalendarRecordMutationService.CalendarEventMutationInput>{
            followUpEvent
        };

        Test.startTest();
        TeamCalendarRecordMutationService.MutationResultDTO result =
            TeamCalendarRecordMutationService.createCalendarEventSeries(JSON.serialize(request));
        Test.stopTest();

        System.assertEquals(1, result.followUpRequestedCount);
        System.assertEquals(1, result.followUpCreatedCount);
        System.assertEquals(0, result.followUpFailedCount);

        Integer eventCount = [
            SELECT COUNT()
            FROM Calendar_Event__c
            WHERE Name IN ('Primary Event', 'Follow Up Event')
        ];
        System.assertEquals(2, eventCount);
    }

    @IsTest
    static void updateTask_updatesWhenCalendarViewRuleAllowsEdit() {
        Task taskRow = new Task(
            Subject = 'Original Task',
            Status = 'Not Started',
            Priority = 'Normal',
            ActivityDate = Date.today()
        );
        insert taskRow;

        insert new Calendar_Access_Rule__c(
            Target_User__c = UserInfo.getUserId(),
            Calendar_View_Id__c = '00B000000000001AAA',
            Calendar_View_Name__c = 'Open Tasks',
            Can_Edit__c = true,
            Is_Active__c = true
        );

        TeamCalendarRecordMutationService.TaskMutationInput inputRow =
            new TeamCalendarRecordMutationService.TaskMutationInput();
        inputRow.recordId = String.valueOf(taskRow.Id);
        inputRow.calendarViewId = '00B000000000001AAA';
        inputRow.subject = 'Updated Task';
        inputRow.status = 'Completed';
        inputRow.priority = 'High';
        inputRow.activityDate = String.valueOf(Date.today().addDays(1));

        Test.startTest();
        Id savedTaskId = TeamCalendarRecordMutationService.updateTask(JSON.serialize(inputRow));
        Test.stopTest();

        Task savedTask = [
            SELECT Id, Subject, Status, Priority, ActivityDate
            FROM Task
            WHERE Id = :savedTaskId
            LIMIT 1
        ];
        System.assertEquals('Updated Task', savedTask.Subject);
        System.assertEquals('Completed', savedTask.Status);
        System.assertEquals('High', savedTask.Priority);
        System.assertEquals(Date.today().addDays(1), savedTask.ActivityDate);
    }

    @IsTest
    static void updateTask_preservesOwnerWhenOwnerIdIsOmitted() {
        Task taskRow = new Task(
            Subject = 'Owner Preserved Task',
            Status = 'Not Started',
            Priority = 'Normal',
            ActivityDate = Date.today()
        );
        insert taskRow;

        Id originalOwnerId = [
            SELECT OwnerId
            FROM Task
            WHERE Id = :taskRow.Id
            LIMIT 1
        ].OwnerId;

        insert new Calendar_Access_Rule__c(
            Target_User__c = UserInfo.getUserId(),
            Calendar_View_Id__c = '00B000000000009AAA',
            Calendar_View_Name__c = 'Preserve Owner',
            Can_Edit__c = true,
            Is_Active__c = true
        );

        TeamCalendarRecordMutationService.TaskMutationInput inputRow =
            new TeamCalendarRecordMutationService.TaskMutationInput();
        inputRow.recordId = String.valueOf(taskRow.Id);
        inputRow.calendarViewId = '00B000000000009AAA';
        inputRow.subject = 'Owner Still Preserved';
        inputRow.status = 'In Progress';
        inputRow.priority = 'High';

        Test.startTest();
        Id savedTaskId = TeamCalendarRecordMutationService.updateTask(JSON.serialize(inputRow));
        Test.stopTest();

        Task savedTask = [
            SELECT Id, OwnerId, Subject, Status, Priority
            FROM Task
            WHERE Id = :savedTaskId
            LIMIT 1
        ];
        System.assertEquals(originalOwnerId, savedTask.OwnerId);
        System.assertEquals('Owner Still Preserved', savedTask.Subject);
        System.assertEquals('In Progress', savedTask.Status);
        System.assertEquals('High', savedTask.Priority);
    }

    @IsTest
    static void updateCalendarEvent_updatesSelfOwnedEvent() {
        Team_Calendar__c calendarRow = new Team_Calendar__c(
            Name = 'Self Calendar',
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = false
        );
        insert calendarRow;

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Original Event',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.today(), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.today(), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Planned',
            All_Day__c = false
        );
        insert eventRow;

        TeamCalendarRecordMutationService.CalendarEventMutationInput inputRow =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        inputRow.recordId = String.valueOf(eventRow.Id);
        inputRow.calendarId = String.valueOf(calendarRow.Id);
        inputRow.name = 'Updated Event';
        inputRow.startValue = '2026-04-15T16:00:00.000Z';
        inputRow.endValue = '2026-04-15T17:00:00.000Z';
        inputRow.status = 'Confirmed';
        inputRow.notes = 'Updated notes';
        inputRow.allDay = false;

        Test.startTest();
        Id savedEventId = TeamCalendarRecordMutationService.updateCalendarEvent(JSON.serialize(inputRow));
        Test.stopTest();

        Calendar_Event__c savedEvent = [
            SELECT Id, Name, Status__c, Notes__c
            FROM Calendar_Event__c
            WHERE Id = :savedEventId
            LIMIT 1
        ];
        System.assertEquals('Updated Event', savedEvent.Name);
        System.assertEquals('Confirmed', savedEvent.Status__c);
        System.assertEquals('Updated notes', savedEvent.Notes__c);
    }

    @IsTest
    static void getCalendarEventEditorState_returnsSelfOwnedEventValues() {
        Team_Calendar__c calendarRow = new Team_Calendar__c(
            Name = 'Editor Calendar',
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = false
        );
        insert calendarRow;

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Editor Event',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.today(), Time.newInstance(13, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.today(), Time.newInstance(14, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            Notes__c = 'Loaded through Apex.'
        );
        insert eventRow;

        Test.startTest();
        TeamCalendarRecordMutationService.CalendarEventEditorDTO dto =
            TeamCalendarRecordMutationService.getCalendarEventEditorState(String.valueOf(eventRow.Id));
        Test.stopTest();

        System.assertEquals(eventRow.Id, dto.recordId);
        System.assertEquals(calendarRow.Id, dto.calendarId);
        System.assertEquals('Editor Event', dto.name);
        System.assertEquals('Confirmed', dto.status);
        System.assertEquals('Loaded through Apex.', dto.notes);
        System.assertEquals(false, dto.allDay);
    }

    @IsTest
    static void deleteTask_deletesWhenCalendarViewRuleAllowsEdit() {
        Task taskRow = new Task(
            Subject = 'Delete Me Task',
            Status = 'Not Started',
            Priority = 'Normal',
            ActivityDate = Date.today()
        );
        insert taskRow;

        insert new Calendar_Access_Rule__c(
            Target_User__c = UserInfo.getUserId(),
            Calendar_View_Id__c = '00B000000000011AAA',
            Calendar_View_Name__c = 'Delete Tasks',
            Can_Edit__c = true,
            Is_Active__c = true
        );

        Test.startTest();
        Id deletedTaskId = TeamCalendarRecordMutationService.deleteTask(
            String.valueOf(taskRow.Id),
            '00B000000000011AAA'
        );
        Test.stopTest();

        System.assertEquals(taskRow.Id, deletedTaskId);
        System.assertEquals(0, [SELECT COUNT() FROM Task WHERE Id = :taskRow.Id]);
    }

    @IsTest
    static void deleteCalendarEvent_deletesSelfOwnedEvent() {
        Team_Calendar__c calendarRow = new Team_Calendar__c(
            Name = 'Delete Event Calendar',
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = false
        );
        insert calendarRow;

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Delete Me Event',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.today(), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.today(), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Planned',
            All_Day__c = false
        );
        insert eventRow;

        Test.startTest();
        Id deletedEventId = TeamCalendarRecordMutationService.deleteCalendarEvent(String.valueOf(eventRow.Id));
        Test.stopTest();

        System.assertEquals(eventRow.Id, deletedEventId);
        System.assertEquals(0, [SELECT COUNT() FROM Calendar_Event__c WHERE Id = :eventRow.Id]);
    }
}