@IsTest
private class TeamCalendarEventTemplateServiceTest {
    @IsTest
    static void getActiveEventTemplates_returnsOnlyActiveTemplates() {
        Team_Calendar__c calendarRow = createCalendar('Alpha Template Calendar');

        insert new List<Calendar_Event_Template__c>{
            new Calendar_Event_Template__c(
                Name = 'Active Template',
                Calendar__c = calendarRow.Id,
                Duration_Minutes__c = 45,
                Default_Status__c = 'Confirmed',
                Notes__c = 'Active template note.',
                Is_Active__c = true
            ),
            new Calendar_Event_Template__c(
                Name = 'Inactive Template',
                Calendar__c = calendarRow.Id,
                Duration_Minutes__c = 30,
                Default_Status__c = 'Planned',
                Notes__c = 'Inactive template note.',
                Is_Active__c = false
            )
        };

        Test.startTest();
        List<TeamCalendarEventTemplateService.EventTemplateDTO> rows =
            TeamCalendarEventTemplateService.getActiveEventTemplates();
        Test.stopTest();

        System.assertEquals(1, rows.size());
        System.assertEquals('Active Template', rows[0].name);
        System.assertEquals('Alpha Template Calendar', rows[0].calendarName);
        System.assertEquals(45, rows[0].durationMinutes);
    }

    @IsTest
    static void saveEventTemplate_createsAndUpdatesTemplate() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Team_Calendar__c calendarRow = createCalendar('Managed Template Calendar');

        TeamCalendarEventTemplateService.EventTemplateInput inputRow =
            new TeamCalendarEventTemplateService.EventTemplateInput();
        inputRow.name = 'Quarterly Review';
        inputRow.calendarId = calendarRow.Id;
        inputRow.durationMinutes = 90;
        inputRow.defaultStatus = 'Confirmed';
        inputRow.notes = 'Bring account scorecard.';
        inputRow.isActive = true;

        TeamCalendarEventTemplateService.EventTemplateDTO saved;
        TeamCalendarEventTemplateService.EventTemplateDTO updated;

        Test.startTest();
        System.runAs(securityAdmin) {
            saved = TeamCalendarEventTemplateService.saveEventTemplate(JSON.serialize(inputRow));

            inputRow.id = saved.id;
            inputRow.notes = 'Bring account scorecard and next steps.';
            inputRow.durationMinutes = 120;

            updated = TeamCalendarEventTemplateService.saveEventTemplate(JSON.serialize(inputRow));
        }
        Test.stopTest();

        System.assertNotEquals(null, saved.id);
        System.assertEquals(saved.id, updated.id);
        System.assertEquals(120, updated.durationMinutes);
        System.assertEquals('Bring account scorecard and next steps.', updated.notes);
    }

    @IsTest
    static void saveEventTemplate_rejectsInvalidPayload() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        TeamCalendarEventTemplateService.EventTemplateInput inputRow =
            new TeamCalendarEventTemplateService.EventTemplateInput();
        inputRow.name = 'Invalid Template';
        inputRow.durationMinutes = 0;
        inputRow.defaultStatus = 'Invalid';

        Boolean threwDuration = false;
        try {
            System.runAs(securityAdmin) {
                TeamCalendarEventTemplateService.saveEventTemplate(JSON.serialize(inputRow));
            }
        } catch (Exception ex) {
            threwDuration = true;
        }

        System.assertEquals(true, threwDuration);
    }

    @IsTest
    static void deleteEventTemplate_removesTemplate() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Team_Calendar__c calendarRow = createCalendar('Delete Template Calendar');
        Calendar_Event_Template__c templateRow = new Calendar_Event_Template__c(
            Name = 'Delete Me',
            Calendar__c = calendarRow.Id,
            Duration_Minutes__c = 30,
            Default_Status__c = 'Planned',
            Is_Active__c = true
        );
        insert templateRow;

        Test.startTest();
        System.runAs(securityAdmin) {
            TeamCalendarEventTemplateService.deleteEventTemplate(templateRow.Id);
        }
        Test.stopTest();

        System.assertEquals(
            0,
            [SELECT COUNT() FROM Calendar_Event_Template__c WHERE Id = :templateRow.Id]
        );
    }

    @IsTest
    static void getTemplateCalendars_returnsActiveCalendars() {
        User securityAdmin = TeamCalendarTestSecurityHelper.getCurrentUserWithRuntimeAccess();
        Team_Calendar__c activeCalendar = createCalendar('Template Picker Calendar');
        Team_Calendar__c inactiveCalendar = new Team_Calendar__c(
            Name = 'Inactive Template Picker Calendar',
            OwnerId = UserInfo.getUserId(),
            Color__c = '#F26419',
            Is_Active__c = false,
            Google_Sync_Enabled__c = false
        );
        insert inactiveCalendar;

        List<TeamCalendarEventTemplateService.TemplateCalendarDTO> rows;

        Test.startTest();
        System.runAs(securityAdmin) {
            rows = TeamCalendarEventTemplateService.getTemplateCalendars();
        }
        Test.stopTest();

        Boolean foundActiveCalendar = false;
        Boolean foundInactiveCalendar = false;
        for (TeamCalendarEventTemplateService.TemplateCalendarDTO row : rows) {
            if (row.id == activeCalendar.Id) {
                foundActiveCalendar = true;
            }

            if (row.id == inactiveCalendar.Id) {
                foundInactiveCalendar = true;
            }
        }

        System.assert(rows.size() >= 1);
        System.assertEquals(true, foundActiveCalendar);
        System.assertEquals(false, foundInactiveCalendar);
    }

    private static Team_Calendar__c createCalendar(String nameValue) {
        Team_Calendar__c row = new Team_Calendar__c(
            Name = nameValue,
            OwnerId = UserInfo.getUserId(),
            Color__c = '#0176D3',
            Is_Active__c = true,
            Google_Sync_Enabled__c = false
        );
        insert row;
        return row;
    }
}