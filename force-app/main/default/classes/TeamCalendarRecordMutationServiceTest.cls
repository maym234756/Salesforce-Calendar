@IsTest
private class TeamCalendarRecordMutationServiceTest {
    private static Boolean googleDeleteCalled = false;
    private static Integer googleDeleteCallCount = 0;
    private static Integer googleGetCallCount = 0;
    private static Integer googlePatchCallCount = 0;
    private static Integer googlePostCallCount = 0;

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
    static void createCalendarEventSeries_autoQueuesGoogleSyncForEnabledCalendar() {
        Team_Calendar__c calendarRow = new Team_Calendar__c(
            Name = 'Google Create Calendar',
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = true,
            Google_Calendar_Id__c = 'create@example.com'
        );
        insert calendarRow;

        TeamCalendarRecordMutationService.CalendarEventMutationInput primaryEvent =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        primaryEvent.calendarId = String.valueOf(calendarRow.Id);
        primaryEvent.ownerId = String.valueOf(UserInfo.getUserId());
        primaryEvent.name = 'Google Created Event';
        primaryEvent.startValue = '2026-04-22T15:00:00.000Z';
        primaryEvent.endValue = '2026-04-22T16:00:00.000Z';
        primaryEvent.status = 'Confirmed';
        primaryEvent.allDay = false;

        TeamCalendarRecordMutationService.CalendarEventSeriesInput request =
            new TeamCalendarRecordMutationService.CalendarEventSeriesInput();
        request.primaryEvent = primaryEvent;
        request.followUpEvents = new List<TeamCalendarRecordMutationService.CalendarEventMutationInput>();

        Test.setMock(HttpCalloutMock.class, new GoogleMutationSyncMock('POST', 'created-google-id'));

        Test.startTest();
        TeamCalendarRecordMutationService.MutationResultDTO result =
            TeamCalendarRecordMutationService.createCalendarEventSeries(JSON.serialize(request));
        Test.stopTest();

        Calendar_Event__c createdEvent = [
            SELECT External_Event_Id__c, Sync_Status__c
            FROM Calendar_Event__c
            WHERE Id = :result.recordId
        ];
        System.assertEquals('created-google-id', createdEvent.External_Event_Id__c);
        System.assertEquals('Synced', createdEvent.Sync_Status__c);
    }

    @IsTest
    static void updateCalendarEvent_cancelledStatusRemovesGoogleEvent() {
        Team_Calendar__c calendarRow = new Team_Calendar__c(
            Name = 'Google Cancel Calendar',
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = true,
            Google_Calendar_Id__c = 'cancel@example.com'
        );
        insert calendarRow;

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Cancel Through Mutation',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.today(), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.today(), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            External_Event_Id__c = 'cancel-through-mutation'
        );
        insert eventRow;

        TeamCalendarRecordMutationService.CalendarEventMutationInput inputRow =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        inputRow.recordId = String.valueOf(eventRow.Id);
        inputRow.calendarId = String.valueOf(calendarRow.Id);
        inputRow.name = 'Cancel Through Mutation';
        inputRow.startValue = '2026-04-23T16:00:00.000Z';
        inputRow.endValue = '2026-04-23T17:00:00.000Z';
        inputRow.status = 'Cancelled';
        inputRow.notes = 'Cancelled from update';
        inputRow.allDay = false;

        Test.setMock(HttpCalloutMock.class, new GoogleMutationSyncMock('DELETE', 'cancel-through-mutation'));

        Test.startTest();
        TeamCalendarRecordMutationService.updateCalendarEvent(JSON.serialize(inputRow));
        Test.stopTest();

        Calendar_Event__c refreshedEvent = [
            SELECT External_Event_Id__c, Sync_Status__c, Sync_Error__c
            FROM Calendar_Event__c
            WHERE Id = :eventRow.Id
        ];
        System.assertEquals(null, refreshedEvent.External_Event_Id__c);
        System.assertEquals('Synced', refreshedEvent.Sync_Status__c);
        System.assertEquals(null, refreshedEvent.Sync_Error__c);
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

    @IsTest
    static void deleteCalendarEvent_autoQueuesGoogleDeleteForEnabledCalendar() {
        googleDeleteCalled = false;

        Team_Calendar__c calendarRow = new Team_Calendar__c(
            Name = 'Delete Sync Calendar',
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = true,
            Google_Calendar_Id__c = 'delete@example.com'
        );
        insert calendarRow;

        Calendar_Event__c eventRow = new Calendar_Event__c(
            Name = 'Delete Synced Event',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.today(), Time.newInstance(14, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.today(), Time.newInstance(15, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            External_Event_Id__c = 'delete-synced-event'
        );
        insert eventRow;

        Test.setMock(HttpCalloutMock.class, new GoogleMutationSyncMock('DELETE', 'delete-synced-event'));

        Test.startTest();
        TeamCalendarRecordMutationService.deleteCalendarEvent(String.valueOf(eventRow.Id));
        Test.stopTest();

        System.assertEquals(true, googleDeleteCalled);
        System.assertEquals(0, [SELECT COUNT() FROM Calendar_Event__c WHERE Id = :eventRow.Id]);
    }

    @IsTest
    static void updateRecurringCalendarEvent_scopeAll_updatesTemplate() {
        Team_Calendar__c calendarRow = createRecurringCalendar('Recurring All Calendar');
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Template',
            'FREQ=WEEKLY;COUNT=10'
        );

        TeamCalendarRecordMutationService.CalendarEventMutationInput eventData =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        eventData.calendarId = String.valueOf(calendarRow.Id);
        eventData.name = 'Recurring Template Updated';
        eventData.startValue = '2026-04-28T15:00:00.000Z';
        eventData.endValue = '2026-04-28T16:00:00.000Z';
        eventData.status = 'Confirmed';
        eventData.notes = 'Updated recurring notes';
        eventData.allDay = false;

        TeamCalendarRecordMutationService.RecurrenceScopeInput request =
            new TeamCalendarRecordMutationService.RecurrenceScopeInput();
        request.recordId = String.valueOf(templateRow.Id);
        request.scope = 'all';
        request.eventData = eventData;

        Test.startTest();
        Id updatedId = TeamCalendarRecordMutationService.updateRecurringCalendarEvent(JSON.serialize(request));
        Test.stopTest();

        Calendar_Event__c updatedTemplate = [
            SELECT Name, Notes__c, Recurrence_Rule__c
            FROM Calendar_Event__c
            WHERE Id = :templateRow.Id
        ];
        System.assertEquals(templateRow.Id, updatedId);
        System.assertEquals('Recurring Template Updated', updatedTemplate.Name);
        System.assertEquals('Updated recurring notes', updatedTemplate.Notes__c);
        System.assertEquals('FREQ=WEEKLY;COUNT=10', updatedTemplate.Recurrence_Rule__c);
    }

    @IsTest
    static void updateRecurringCalendarEvent_scopeAll_enabledCalendarSyncsSeriesTemplateToGoogle() {
        Team_Calendar__c calendarRow = createRecurringCalendar(
            'Recurring All Sync Calendar',
            true,
            'recurring-all@example.com'
        );
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Sync Template',
            'FREQ=WEEKLY;COUNT=10'
        );
        update new Calendar_Event__c(Id = templateRow.Id, External_Event_Id__c = 'series-template-id');

        TeamCalendarRecordMutationService.CalendarEventMutationInput eventData =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        eventData.calendarId = String.valueOf(calendarRow.Id);
        eventData.name = 'Recurring Sync Template Updated';
        eventData.startValue = '2026-04-28T15:00:00.000Z';
        eventData.endValue = '2026-04-28T16:00:00.000Z';
        eventData.status = 'Confirmed';
        eventData.allDay = false;

        TeamCalendarRecordMutationService.RecurrenceScopeInput request =
            new TeamCalendarRecordMutationService.RecurrenceScopeInput();
        request.recordId = String.valueOf(templateRow.Id);
        request.scope = 'all';
        request.eventData = eventData;

        Test.setMock(HttpCalloutMock.class, new GoogleMutationSyncMock('PATCH', 'series-template-id'));

        Test.startTest();
        TeamCalendarRecordMutationService.updateRecurringCalendarEvent(JSON.serialize(request));
        Test.stopTest();

        Calendar_Event__c updatedTemplate = [
            SELECT Name, External_Event_Id__c, Sync_Status__c
            FROM Calendar_Event__c
            WHERE Id = :templateRow.Id
        ];
        System.assertEquals('Recurring Sync Template Updated', updatedTemplate.Name);
        System.assertEquals('series-template-id', updatedTemplate.External_Event_Id__c);
        System.assertEquals('Synced', updatedTemplate.Sync_Status__c);
    }

    @IsTest
    static void updateRecurringCalendarEvent_scopeThis_createsAndUpdatesException() {
        Team_Calendar__c calendarRow = createRecurringCalendar('Recurring This Calendar');
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring This Template',
            'FREQ=DAILY;COUNT=5'
        );

        TeamCalendarRecordMutationService.CalendarEventMutationInput eventData =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        eventData.calendarId = String.valueOf(calendarRow.Id);
        eventData.name = 'Occurrence Override';
        eventData.startValue = '2026-04-29T13:00:00.000Z';
        eventData.endValue = '2026-04-29T14:00:00.000Z';
        eventData.status = 'Confirmed';
        eventData.allDay = false;

        TeamCalendarRecordMutationService.RecurrenceScopeInput request =
            new TeamCalendarRecordMutationService.RecurrenceScopeInput();
        request.recordId = String.valueOf(templateRow.Id);
        request.scope = 'this';
        request.occurrenceDate = '2026-04-29';
        request.eventData = eventData;

        Test.startTest();
        Id createdExceptionId = TeamCalendarRecordMutationService.updateRecurringCalendarEvent(JSON.serialize(request));
        Test.stopTest();

        Calendar_Event__c createdException = [
            SELECT Name, Is_Recurrence_Exception__c, Recurrence_Parent__c, Occurrence_Date__c, Recurrence_Rule__c
            FROM Calendar_Event__c
            WHERE Id = :createdExceptionId
        ];
        System.assertEquals('Occurrence Override', createdException.Name);
        System.assertEquals(true, createdException.Is_Recurrence_Exception__c);
        System.assertEquals(templateRow.Id, createdException.Recurrence_Parent__c);
        System.assertEquals('2026-04-29', createdException.Occurrence_Date__c);
        System.assertEquals(null, createdException.Recurrence_Rule__c);

        request.eventData.name = 'Occurrence Override Updated';
        Id updatedExceptionId = TeamCalendarRecordMutationService.updateRecurringCalendarEvent(JSON.serialize(request));

        Calendar_Event__c updatedException = [
            SELECT Name
            FROM Calendar_Event__c
            WHERE Id = :createdExceptionId
        ];
        System.assertEquals(createdExceptionId, updatedExceptionId);
        System.assertEquals('Occurrence Override Updated', updatedException.Name);
    }

    @IsTest
    static void updateRecurringCalendarEvent_scopeThis_resolvesAndSyncsGoogleInstance() {
        googleGetCallCount = 0;
        googlePatchCallCount = 0;

        Team_Calendar__c calendarRow = createRecurringCalendar(
            'Recurring This Sync Calendar',
            true,
            'recurring-this@example.com'
        );
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring This Sync Template',
            'FREQ=DAILY;COUNT=5'
        );
        update new Calendar_Event__c(Id = templateRow.Id, External_Event_Id__c = 'series-template-id');

        TeamCalendarRecordMutationService.CalendarEventMutationInput eventData =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        eventData.calendarId = String.valueOf(calendarRow.Id);
        eventData.name = 'New Occurrence Override';
        eventData.startValue = '2026-04-29T13:00:00.000Z';
        eventData.endValue = '2026-04-29T14:00:00.000Z';
        eventData.status = 'Confirmed';
        eventData.allDay = false;

        TeamCalendarRecordMutationService.RecurrenceScopeInput request =
            new TeamCalendarRecordMutationService.RecurrenceScopeInput();
        request.recordId = String.valueOf(templateRow.Id);
        request.scope = 'this';
        request.occurrenceDate = '2026-04-29';
        request.eventData = eventData;

        String resolvedOccurrenceStartDateTime =
            '2026-04-29T' + templateRow.Start__c.formatGmt('HH:mm:ss') + '.000Z';

        Test.setMock(
            HttpCalloutMock.class,
            new GoogleRecurringInstanceMutationMock(
                'series-template-id',
                'resolved-occurrence-id',
                resolvedOccurrenceStartDateTime,
                'PATCH'
            )
        );

        Test.startTest();
        Id createdExceptionId = TeamCalendarRecordMutationService.updateRecurringCalendarEvent(JSON.serialize(request));
        Test.stopTest();

        Calendar_Event__c createdException = [
            SELECT Name, External_Event_Id__c, Sync_Status__c
            FROM Calendar_Event__c
            WHERE Id = :createdExceptionId
        ];
        System.assertEquals('New Occurrence Override', createdException.Name);
        System.assertEquals('resolved-occurrence-id', createdException.External_Event_Id__c);
        System.assertEquals('Synced', createdException.Sync_Status__c);
        System.assertEquals(1, googleGetCallCount);
        System.assertEquals(1, googlePatchCallCount);
    }

    @IsTest
    static void updateRecurringCalendarEvent_scopeThis_updatesMappedExceptionOnGoogle() {
        Team_Calendar__c calendarRow = createRecurringCalendar(
            'Recurring Exception Sync Calendar',
            true,
            'recurring-exception@example.com'
        );
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Exception Template',
            'FREQ=DAILY;COUNT=5'
        );
        update new Calendar_Event__c(Id = templateRow.Id, External_Event_Id__c = 'series-template-id');

        Calendar_Event__c existingException = new Calendar_Event__c(
            Name = 'Existing Override',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.newInstance(2026, 4, 29), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.newInstance(2026, 4, 29), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            Is_Recurrence_Exception__c = true,
            Recurrence_Parent__c = templateRow.Id,
            Occurrence_Date__c = '2026-04-29',
            External_Event_Id__c = 'existing-occurrence-id'
        );
        insert existingException;

        TeamCalendarRecordMutationService.CalendarEventMutationInput eventData =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        eventData.calendarId = String.valueOf(calendarRow.Id);
        eventData.name = 'Existing Override Updated';
        eventData.startValue = '2026-04-29T13:00:00.000Z';
        eventData.endValue = '2026-04-29T14:00:00.000Z';
        eventData.status = 'Confirmed';
        eventData.allDay = false;

        TeamCalendarRecordMutationService.RecurrenceScopeInput request =
            new TeamCalendarRecordMutationService.RecurrenceScopeInput();
        request.recordId = String.valueOf(templateRow.Id);
        request.scope = 'this';
        request.occurrenceDate = '2026-04-29';
        request.eventData = eventData;

        Test.setMock(HttpCalloutMock.class, new GoogleMutationSyncMock('PATCH', 'existing-occurrence-id'));

        Test.startTest();
        Id updatedExceptionId = TeamCalendarRecordMutationService.updateRecurringCalendarEvent(JSON.serialize(request));
        Test.stopTest();

        Calendar_Event__c updatedException = [
            SELECT Name, External_Event_Id__c, Sync_Status__c
            FROM Calendar_Event__c
            WHERE Id = :updatedExceptionId
        ];
        System.assertEquals('Existing Override Updated', updatedException.Name);
        System.assertEquals('existing-occurrence-id', updatedException.External_Event_Id__c);
        System.assertEquals('Synced', updatedException.Sync_Status__c);
    }

    @IsTest
    static void updateRecurringCalendarEvent_scopeThisAndFollowing_splitsSeries() {
        Team_Calendar__c calendarRow = createRecurringCalendar('Recurring Split Calendar');
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Split Template',
            'FREQ=WEEKLY;COUNT=10'
        );

        insert new Calendar_Event__c(
            Name = 'Future Exception',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.newInstance(2026, 5, 10), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.newInstance(2026, 5, 10), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            Is_Recurrence_Exception__c = true,
            Recurrence_Parent__c = templateRow.Id,
            Occurrence_Date__c = '2026-05-10'
        );

        TeamCalendarRecordMutationService.CalendarEventMutationInput eventData =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        eventData.calendarId = String.valueOf(calendarRow.Id);
        eventData.name = 'Recurring Split New Template';
        eventData.startValue = '2026-05-01T09:00:00.000Z';
        eventData.endValue = '2026-05-01T10:00:00.000Z';
        eventData.status = 'Planned';
        eventData.allDay = false;

        TeamCalendarRecordMutationService.RecurrenceScopeInput request =
            new TeamCalendarRecordMutationService.RecurrenceScopeInput();
        request.recordId = String.valueOf(templateRow.Id);
        request.scope = 'thisAndFollowing';
        request.occurrenceDate = '2026-05-01';
        request.eventData = eventData;

        Test.startTest();
        Id newTemplateId = TeamCalendarRecordMutationService.updateRecurringCalendarEvent(JSON.serialize(request));
        Test.stopTest();

        Calendar_Event__c truncatedTemplate = [
            SELECT Recurrence_Rule__c
            FROM Calendar_Event__c
            WHERE Id = :templateRow.Id
        ];
        Calendar_Event__c newTemplate = [
            SELECT Name, Recurrence_Rule__c
            FROM Calendar_Event__c
            WHERE Id = :newTemplateId
        ];
        System.assert(truncatedTemplate.Recurrence_Rule__c.contains('UNTIL=20260430'));
        System.assertEquals('Recurring Split New Template', newTemplate.Name);
        System.assertEquals('FREQ=WEEKLY;COUNT=10', newTemplate.Recurrence_Rule__c);
        System.assertEquals(
            0,
            [
                SELECT COUNT()
                FROM Calendar_Event__c
                WHERE Recurrence_Parent__c = :templateRow.Id
                AND Is_Recurrence_Exception__c = true
                AND Occurrence_Date__c >= :'2026-05-01'
            ]
        );
    }

    @IsTest
    static void updateRecurringCalendarEvent_scopeThisAndFollowing_syncsSeriesTemplatesAndDeletesMappedFutureExceptions() {
        googleDeleteCalled = false;
        googleDeleteCallCount = 0;
        googlePatchCallCount = 0;
        googlePostCallCount = 0;

        Team_Calendar__c calendarRow = createRecurringCalendar(
            'Recurring Split Sync Calendar',
            true,
            'recurring-split@example.com'
        );
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Split Sync Template',
            'FREQ=WEEKLY;COUNT=10'
        );
        update new Calendar_Event__c(Id = templateRow.Id, External_Event_Id__c = 'series-template-id');

        insert new Calendar_Event__c(
            Name = 'Mapped Future Exception',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.newInstance(2026, 5, 10), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.newInstance(2026, 5, 10), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            Is_Recurrence_Exception__c = true,
            Recurrence_Parent__c = templateRow.Id,
            Occurrence_Date__c = '2026-05-10',
            External_Event_Id__c = 'future-ex-id'
        );

        TeamCalendarRecordMutationService.CalendarEventMutationInput eventData =
            new TeamCalendarRecordMutationService.CalendarEventMutationInput();
        eventData.calendarId = String.valueOf(calendarRow.Id);
        eventData.name = 'Recurring Split New Template';
        eventData.startValue = '2026-05-01T09:00:00.000Z';
        eventData.endValue = '2026-05-01T10:00:00.000Z';
        eventData.status = 'Planned';
        eventData.allDay = false;

        TeamCalendarRecordMutationService.RecurrenceScopeInput request =
            new TeamCalendarRecordMutationService.RecurrenceScopeInput();
        request.recordId = String.valueOf(templateRow.Id);
        request.scope = 'thisAndFollowing';
        request.occurrenceDate = '2026-05-01';
        request.eventData = eventData;

        Test.setMock(
            HttpCalloutMock.class,
            new GoogleSeriesSplitSyncMock(
                'series-template-id',
                new Set<String>{ 'future-ex-id' },
                'new-series-template-id'
            )
        );

        Test.startTest();
        Id newTemplateId = TeamCalendarRecordMutationService.updateRecurringCalendarEvent(
            JSON.serialize(request)
        );
        Test.stopTest();

        Calendar_Event__c truncatedTemplate = [
            SELECT External_Event_Id__c, Sync_Status__c
            FROM Calendar_Event__c
            WHERE Id = :templateRow.Id
        ];
        Calendar_Event__c newTemplate = [
            SELECT External_Event_Id__c, Sync_Status__c
            FROM Calendar_Event__c
            WHERE Id = :newTemplateId
        ];

        System.assertEquals(true, googleDeleteCalled);
        System.assertEquals(1, googleDeleteCallCount);
        System.assertEquals(1, googlePatchCallCount);
        System.assertEquals(1, googlePostCallCount);
        System.assertEquals('series-template-id', truncatedTemplate.External_Event_Id__c);
        System.assertEquals('Synced', truncatedTemplate.Sync_Status__c);
        System.assertEquals('new-series-template-id', newTemplate.External_Event_Id__c);
        System.assertEquals('Synced', newTemplate.Sync_Status__c);
    }

    @IsTest
    static void deleteRecurringCalendarEvent_scopeThis_handlesExistingAndNewExceptions() {
        Team_Calendar__c calendarRow = createRecurringCalendar('Recurring Delete This Calendar');
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Delete This Template',
            'FREQ=DAILY;COUNT=7'
        );

        Calendar_Event__c existingException = new Calendar_Event__c(
            Name = 'Editable Exception',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.newInstance(2026, 5, 3), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.newInstance(2026, 5, 3), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            Is_Recurrence_Exception__c = true,
            Recurrence_Parent__c = templateRow.Id,
            Occurrence_Date__c = '2026-05-03'
        );
        insert existingException;

        Test.startTest();
        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'this',
            '2026-05-03'
        );
        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'this',
            '2026-05-04'
        );
        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'this',
            '2026-05-04'
        );
        Test.stopTest();

        List<Calendar_Event__c> deletedExceptions = [
            SELECT Status__c, Occurrence_Date__c
            FROM Calendar_Event__c
            WHERE Recurrence_Parent__c = :templateRow.Id
            AND Is_Recurrence_Exception__c = true
            ORDER BY Occurrence_Date__c ASC
        ];
        System.assertEquals(2, deletedExceptions.size());
        System.assertEquals('Deleted', deletedExceptions[0].Status__c);
        System.assertEquals('Deleted', deletedExceptions[1].Status__c);
    }

    @IsTest
    static void deleteRecurringCalendarEvent_scopeThis_deletesMappedExceptionOnGoogle() {
        Team_Calendar__c calendarRow = createRecurringCalendar(
            'Recurring Delete Sync Calendar',
            true,
            'recurring-delete@example.com'
        );
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Delete Sync Template',
            'FREQ=DAILY;COUNT=7'
        );
        update new Calendar_Event__c(Id = templateRow.Id, External_Event_Id__c = 'series-template-id');

        Calendar_Event__c existingException = new Calendar_Event__c(
            Name = 'Mapped Exception',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.newInstance(2026, 5, 3), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.newInstance(2026, 5, 3), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            Is_Recurrence_Exception__c = true,
            Recurrence_Parent__c = templateRow.Id,
            Occurrence_Date__c = '2026-05-03',
            External_Event_Id__c = 'mapped-occurrence-id'
        );
        insert existingException;

        Test.setMock(HttpCalloutMock.class, new GoogleMutationSyncMock('DELETE', 'mapped-occurrence-id'));

        Test.startTest();
        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'this',
            '2026-05-03'
        );
        Test.stopTest();

        Calendar_Event__c deletedException = [
            SELECT Status__c, External_Event_Id__c, Sync_Status__c
            FROM Calendar_Event__c
            WHERE Id = :existingException.Id
        ];
        System.assertEquals('Deleted', deletedException.Status__c);
        System.assertEquals(null, deletedException.External_Event_Id__c);
        System.assertEquals('Synced', deletedException.Sync_Status__c);
    }

    @IsTest
    static void deleteRecurringCalendarEvent_scopeThis_resolvesAndDeletesGoogleInstance() {
        googleDeleteCalled = false;
        googleDeleteCallCount = 0;
        googleGetCallCount = 0;

        Team_Calendar__c calendarRow = createRecurringCalendar(
            'Recurring Delete New Sync Calendar',
            true,
            'recurring-delete-new@example.com'
        );
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Delete New Sync Template',
            'FREQ=DAILY;COUNT=7'
        );
        update new Calendar_Event__c(Id = templateRow.Id, External_Event_Id__c = 'series-template-id');

        String resolvedDeleteOccurrenceStartDateTime =
            '2026-05-04T' + templateRow.Start__c.formatGmt('HH:mm:ss') + '.000Z';

        Test.setMock(
            HttpCalloutMock.class,
            new GoogleRecurringInstanceMutationMock(
                'series-template-id',
                'resolved-delete-occurrence-id',
                resolvedDeleteOccurrenceStartDateTime,
                'DELETE'
            )
        );

        Test.startTest();
        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'this',
            '2026-05-04'
        );
        Test.stopTest();

        Calendar_Event__c deletedException = [
            SELECT Status__c, External_Event_Id__c, Sync_Status__c
            FROM Calendar_Event__c
            WHERE Recurrence_Parent__c = :templateRow.Id
            AND Occurrence_Date__c = :'2026-05-04'
            LIMIT 1
        ];
        System.assertEquals('Deleted', deletedException.Status__c);
        System.assertEquals(null, deletedException.External_Event_Id__c);
        System.assertEquals('Synced', deletedException.Sync_Status__c);
        System.assertEquals(true, googleDeleteCalled);
        System.assertEquals(1, googleGetCallCount);
        System.assertEquals(1, googleDeleteCallCount);
    }

    @IsTest
    static void deleteRecurringCalendarEvent_scopeThisAndFollowing_andAll_removeFutureRows() {
        Team_Calendar__c calendarRow = createRecurringCalendar('Recurring Delete Range Calendar');
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Delete Range Template',
            'FREQ=WEEKLY;COUNT=12'
        );

        insert new Calendar_Event__c(
            Name = 'Delete Future Exception',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.newInstance(2026, 5, 15), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.newInstance(2026, 5, 15), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            Is_Recurrence_Exception__c = true,
            Recurrence_Parent__c = templateRow.Id,
            Occurrence_Date__c = '2026-05-15'
        );

        Test.startTest();
        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'thisAndFollowing',
            '2026-05-10'
        );
        Test.stopTest();

        Calendar_Event__c truncatedTemplate = [
            SELECT Recurrence_Rule__c
            FROM Calendar_Event__c
            WHERE Id = :templateRow.Id
        ];
        System.assert(truncatedTemplate.Recurrence_Rule__c.contains('UNTIL=20260509'));
        System.assertEquals(
            0,
            [
                SELECT COUNT()
                FROM Calendar_Event__c
                WHERE Recurrence_Parent__c = :templateRow.Id
                AND Is_Recurrence_Exception__c = true
                AND Occurrence_Date__c >= :'2026-05-10'
            ]
        );

        insert new Calendar_Event__c(
            Name = 'Delete All Exception',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.newInstance(2026, 5, 20), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.newInstance(2026, 5, 20), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            Is_Recurrence_Exception__c = true,
            Recurrence_Parent__c = templateRow.Id,
            Occurrence_Date__c = '2026-05-20'
        );

        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'all',
            null
        );

        System.assertEquals(
            0,
            [SELECT COUNT() FROM Calendar_Event__c WHERE Id = :templateRow.Id]
        );
        System.assertEquals(
            0,
            [SELECT COUNT() FROM Calendar_Event__c WHERE Recurrence_Parent__c = :templateRow.Id]
        );
    }

    @IsTest
    static void deleteRecurringCalendarEvent_scopeThisAndFollowing_syncsTruncatedSeriesAndDeletesMappedFutureExceptions() {
        googleDeleteCalled = false;
        googleDeleteCallCount = 0;
        googlePatchCallCount = 0;
        googlePostCallCount = 0;

        Team_Calendar__c calendarRow = createRecurringCalendar(
            'Recurring Delete Range Sync Calendar',
            true,
            'recurring-delete-range@example.com'
        );
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Delete Range Sync Template',
            'FREQ=WEEKLY;COUNT=12'
        );
        update new Calendar_Event__c(Id = templateRow.Id, External_Event_Id__c = 'series-template-id');

        insert new Calendar_Event__c(
            Name = 'Mapped Future Exception',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.newInstance(2026, 5, 15), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.newInstance(2026, 5, 15), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            Is_Recurrence_Exception__c = true,
            Recurrence_Parent__c = templateRow.Id,
            Occurrence_Date__c = '2026-05-15',
            External_Event_Id__c = 'delete-future-ex-id'
        );

        Test.setMock(
            HttpCalloutMock.class,
            new GoogleSeriesSplitSyncMock(
                'series-template-id',
                new Set<String>{ 'delete-future-ex-id' },
                null
            )
        );

        Test.startTest();
        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'thisAndFollowing',
            '2026-05-10'
        );
        Test.stopTest();

        Calendar_Event__c truncatedTemplate = [
            SELECT External_Event_Id__c, Sync_Status__c
            FROM Calendar_Event__c
            WHERE Id = :templateRow.Id
        ];

        System.assertEquals(true, googleDeleteCalled);
        System.assertEquals(1, googleDeleteCallCount);
        System.assertEquals(1, googlePatchCallCount);
        System.assertEquals(0, googlePostCallCount);
        System.assertEquals('series-template-id', truncatedTemplate.External_Event_Id__c);
        System.assertEquals('Synced', truncatedTemplate.Sync_Status__c);
        System.assertEquals(1, [SELECT COUNT() FROM Calendar_Event__c WHERE Id = :templateRow.Id]);
    }

    @IsTest
    static void deleteRecurringCalendarEvent_scopeAll_deletesMappedTemplateAndExceptionsOnGoogle() {
        googleDeleteCalled = false;
        googleDeleteCallCount = 0;

        Team_Calendar__c calendarRow = createRecurringCalendar(
            'Recurring Delete All Sync Calendar',
            true,
            'recurring-delete-all@example.com'
        );
        Calendar_Event__c templateRow = createRecurringTemplate(
            calendarRow.Id,
            'Recurring Delete All Template',
            'FREQ=WEEKLY;COUNT=12'
        );
        update new Calendar_Event__c(Id = templateRow.Id, External_Event_Id__c = 'delete-series-template-id');

        insert new Calendar_Event__c(
            Name = 'Mapped Delete All Exception',
            Calendar__c = calendarRow.Id,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.newInstance(2026, 5, 20), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.newInstance(2026, 5, 20), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Confirmed',
            All_Day__c = false,
            Is_Recurrence_Exception__c = true,
            Recurrence_Parent__c = templateRow.Id,
            Occurrence_Date__c = '2026-05-20',
            External_Event_Id__c = 'delete-series-ex-id'
        );

        Test.setMock(
            HttpCalloutMock.class,
            new GoogleMultiDeleteMock(new Set<String>{ 'delete-series-template-id', 'delete-series-ex-id' })
        );

        Test.startTest();
        TeamCalendarRecordMutationService.deleteRecurringCalendarEvent(
            String.valueOf(templateRow.Id),
            'all',
            null
        );
        Test.stopTest();

        System.assertEquals(true, googleDeleteCalled);
        System.assertEquals(2, googleDeleteCallCount);
        System.assertEquals(0, [SELECT COUNT() FROM Calendar_Event__c WHERE Id = :templateRow.Id]);
    }

    @IsTest
    static void truncateRRuleUntil_replacesCountAndUntil() {
        System.assertEquals(
            null,
            TeamCalendarRecordMutationService.truncateRRuleUntil(null, Date.newInstance(2026, 5, 1))
        );
        System.assertEquals(
            'FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260517',
            TeamCalendarRecordMutationService.truncateRRuleUntil(
                'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10;UNTIL=20260501',
                Date.newInstance(2026, 5, 17)
            )
        );
    }

    private static Team_Calendar__c createRecurringCalendar(String name) {
        return createRecurringCalendar(name, false, null);
    }

    private static Team_Calendar__c createRecurringCalendar(
        String name,
        Boolean googleSyncEnabled,
        String googleCalendarId
    ) {
        Team_Calendar__c calendarRow = new Team_Calendar__c(
            Name = name,
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = googleSyncEnabled,
            Google_Calendar_Id__c = googleCalendarId
        );
        insert calendarRow;
        return calendarRow;
    }

    private static Calendar_Event__c createRecurringTemplate(
        Id calendarId,
        String name,
        String recurrenceRule
    ) {
        Calendar_Event__c templateRow = new Calendar_Event__c(
            Name = name,
            Calendar__c = calendarId,
            OwnerId = UserInfo.getUserId(),
            Start__c = Datetime.newInstance(Date.newInstance(2026, 4, 27), Time.newInstance(9, 0, 0, 0)),
            End__c = Datetime.newInstance(Date.newInstance(2026, 4, 27), Time.newInstance(10, 0, 0, 0)),
            Status__c = 'Planned',
            All_Day__c = false,
            Recurrence_Rule__c = recurrenceRule
        );
        insert templateRow;
        return templateRow;
    }

    private class GoogleMutationSyncMock implements HttpCalloutMock {
        private String expectedMethod;
        private String responseValue;

        GoogleMutationSyncMock(String expectedMethod, String responseValue) {
            this.expectedMethod = expectedMethod;
            this.responseValue = responseValue;
        }

        public HttpResponse respond(HttpRequest req) {
            System.assertEquals(expectedMethod, req.getMethod());
            HttpResponse response = new HttpResponse();
            response.setHeader('Content-Type', 'application/json');

            if (expectedMethod != 'POST') {
                System.assert(req.getEndpoint().contains('/events/' + responseValue));
            }

            if (expectedMethod == 'DELETE') {
                googleDeleteCalled = true;
                googleDeleteCallCount += 1;
                response.setStatusCode(204);
                response.setBody('');
                return response;
            }

            response.setStatusCode(200);
            response.setBody('{"id":"' + responseValue + '"}');
            return response;
        }
    }

    private class GoogleRecurringInstanceMutationMock implements HttpCalloutMock {
        private String expectedSeriesEventId;
        private String resolvedInstanceId;
        private String originalStartDateTime;
        private String expectedMutationMethod;

        GoogleRecurringInstanceMutationMock(
            String expectedSeriesEventId,
            String resolvedInstanceId,
            String originalStartDateTime,
            String expectedMutationMethod
        ) {
            this.expectedSeriesEventId = expectedSeriesEventId;
            this.resolvedInstanceId = resolvedInstanceId;
            this.originalStartDateTime = originalStartDateTime;
            this.expectedMutationMethod = expectedMutationMethod;
        }

        public HttpResponse respond(HttpRequest req) {
            HttpResponse response = new HttpResponse();
            response.setHeader('Content-Type', 'application/json');

            if (req.getMethod() == 'GET') {
                googleGetCallCount += 1;
                System.assert(req.getEndpoint().contains('/events/' + expectedSeriesEventId + '/instances'));
                response.setStatusCode(200);
                response.setBody(
                    '{"items":[{"id":"' + resolvedInstanceId +
                    '","status":"confirmed","recurringEventId":"' + expectedSeriesEventId +
                    '","originalStartTime":{"dateTime":"' + originalStartDateTime +
                    '","timeZone":"UTC"}}]}'
                );
                return response;
            }

            System.assertEquals(expectedMutationMethod, req.getMethod());
            System.assert(req.getEndpoint().contains('/events/' + resolvedInstanceId));

            if (expectedMutationMethod == 'DELETE') {
                googleDeleteCalled = true;
                googleDeleteCallCount += 1;
                response.setStatusCode(204);
                response.setBody('');
                return response;
            }

            googlePatchCallCount += 1;
            response.setStatusCode(200);
            response.setBody('{"id":"' + resolvedInstanceId + '"}');
            return response;
        }
    }

    private class GoogleMultiDeleteMock implements HttpCalloutMock {
        private Set<String> expectedEventIds;

        GoogleMultiDeleteMock(Set<String> expectedEventIds) {
            this.expectedEventIds = expectedEventIds == null ? new Set<String>() : expectedEventIds;
        }

        public HttpResponse respond(HttpRequest req) {
            System.assertEquals('DELETE', req.getMethod());

            String matchedEventId;
            for (String eventId : expectedEventIds) {
                if (req.getEndpoint().contains('/events/' + eventId)) {
                    matchedEventId = eventId;
                    break;
                }
            }

            System.assertNotEquals(null, matchedEventId);
            expectedEventIds.remove(matchedEventId);
            googleDeleteCalled = true;
            googleDeleteCallCount += 1;

            HttpResponse response = new HttpResponse();
            response.setStatusCode(204);
            response.setHeader('Content-Type', 'application/json');
            response.setBody('');
            return response;
        }
    }

    private class GoogleSeriesSplitSyncMock implements HttpCalloutMock {
        private String expectedPatchEventId;
        private Set<String> expectedDeleteEventIds;
        private String postResponseId;

        GoogleSeriesSplitSyncMock(
            String expectedPatchEventId,
            Set<String> expectedDeleteEventIds,
            String postResponseId
        ) {
            this.expectedPatchEventId = expectedPatchEventId;
            this.expectedDeleteEventIds = expectedDeleteEventIds == null
                ? new Set<String>()
                : new Set<String>(expectedDeleteEventIds);
            this.postResponseId = postResponseId;
        }

        public HttpResponse respond(HttpRequest req) {
            HttpResponse response = new HttpResponse();
            response.setHeader('Content-Type', 'application/json');

            if (req.getMethod() == 'DELETE') {
                String matchedEventId;
                for (String eventId : expectedDeleteEventIds) {
                    if (req.getEndpoint().contains('/events/' + eventId)) {
                        matchedEventId = eventId;
                        break;
                    }
                }

                System.assertNotEquals(null, matchedEventId);
                expectedDeleteEventIds.remove(matchedEventId);
                googleDeleteCalled = true;
                googleDeleteCallCount += 1;
                response.setStatusCode(204);
                response.setBody('');
                return response;
            }

            if (req.getMethod() == 'PATCH') {
                System.assertEquals(0, googlePatchCallCount);
                System.assert(req.getEndpoint().contains('/events/' + expectedPatchEventId));
                googlePatchCallCount += 1;
                response.setStatusCode(200);
                response.setBody('{"id":"' + expectedPatchEventId + '"}');
                return response;
            }

            if (req.getMethod() == 'POST') {
                System.assertEquals(0, googlePostCallCount);
                System.assertNotEquals(null, postResponseId);
                googlePostCallCount += 1;
                response.setStatusCode(200);
                response.setBody('{"id":"' + postResponseId + '"}');
                return response;
            }

            System.assert(false, 'Unexpected HTTP method: ' + req.getMethod());
            response.setStatusCode(500);
            response.setBody('');
            return response;
        }
    }

}