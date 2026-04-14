@IsTest
private class TeamCalendarPdfControllerTest {
    @IsTest
    static void buildsMonthPdfModelFromBoardFilters() {
        User ownerAlpha = createUser('pdf.owner.alpha');
        Team_Calendar__c alphaCalendar = createCalendar(
            'Avail - Corpus Christi',
            '#0176d3',
            true,
            true,
            'alpha.pdf@example.com',
            ownerAlpha.Id
        );

        insert new List<Calendar_Event__c>{
            createEvent(
                'Boston Whaler 130',
                alphaCalendar.Id,
                ownerAlpha.Id,
                dt(2026, 4, 7, 9, 0),
                dt(2026, 4, 7, 10, 0),
                false,
                'Planned',
                'Test event 1'
            ),
            createEvent(
                'Sportsman 247',
                alphaCalendar.Id,
                ownerAlpha.Id,
                dt(2026, 4, 7, 11, 0),
                dt(2026, 4, 7, 12, 0),
                false,
                'Confirmed',
                'Test event 2'
            )
        };

        Test.setCurrentPage(Page.TeamCalendarPdfExport);
        ApexPages.currentPage().getParameters().put('view', 'month');
        ApexPages.currentPage().getParameters().put('currentDate', '2026-04-13');
        ApexPages.currentPage().getParameters().put('calendarLabel', 'Avail - Corpus Christi');
        ApexPages.currentPage().getParameters().put('statusLabel', 'All Statuses');
        ApexPages.currentPage().getParameters().put('selectedUserIds', String.valueOf(ownerAlpha.Id));
        ApexPages.currentPage().getParameters().put('showWeekends', 'true');

        Test.startTest();
        TeamCalendarPdfController controller = new TeamCalendarPdfController();
        Test.stopTest();

        System.assertEquals('month', controller.currentView);
        System.assertEquals('April 2026', controller.rangeLabel);
        System.assertEquals('Team Calendar - April 2026', controller.documentTitle);
        System.assertEquals(2, controller.eventCount);
        System.assert(controller.getIsGridView(), 'Month export should render the grid view.');
        System.assertEquals(6, controller.weeks.size(), 'Month export should render six calendar weeks.');
        System.assert(
            controller.selectedUserLabelText.contains(ownerAlpha.Name),
            'Expected the selected user labels to include the chosen owner.'
        );

        Integer renderedEventCount = 0;
        for (TeamCalendarPdfController.PrintableWeek week : controller.weeks) {
            for (TeamCalendarPdfController.PrintableDay day : week.days) {
                renderedEventCount += day.events.size();
            }
        }

        System.assert(renderedEventCount >= 2, 'Expected the calendar grid to include the created events.');
    }

    @IsTest
    static void buildsAgendaAndTeamLoadModels() {
        User ownerAlpha = createUser('pdf.owner.agenda');
        Team_Calendar__c alphaCalendar = createCalendar(
            'Agenda Calendar',
            '#2e844a',
            true,
            true,
            'agenda.pdf@example.com',
            ownerAlpha.Id
        );

        insert new List<Calendar_Event__c>{
            createEvent(
                'Morning Delivery',
                alphaCalendar.Id,
                ownerAlpha.Id,
                dt(2026, 4, 9, 8, 30),
                dt(2026, 4, 9, 9, 30),
                false,
                'Planned',
                'Agenda event'
            ),
            createEvent(
                'All Day Prep',
                alphaCalendar.Id,
                ownerAlpha.Id,
                dt(2026, 4, 10, 0, 0),
                dt(2026, 4, 10, 23, 59),
                true,
                'Confirmed',
                'All day agenda event'
            )
        };

        Test.setCurrentPage(Page.TeamCalendarPdfExport);
        ApexPages.currentPage().getParameters().put('view', 'agenda');
        ApexPages.currentPage().getParameters().put('currentDate', '2026-04-13');

        TeamCalendarPdfController agendaController = new TeamCalendarPdfController();
        System.assert(agendaController.getIsAgendaView(), 'Agenda export should be active.');
        System.assertEquals('None', agendaController.selectedUserLabelText);
        System.assert(agendaController.getHasAgendaGroups(), 'Expected agenda groups to be present.');
        System.assertEquals('April 2026 Agenda', agendaController.rangeLabel);

        Test.setCurrentPage(Page.TeamCalendarPdfExport);
        ApexPages.currentPage().getParameters().put('view', 'teamLoad');
        ApexPages.currentPage().getParameters().put('currentDate', '2026-04-13');

        TeamCalendarPdfController teamLoadController = new TeamCalendarPdfController();
        System.assert(teamLoadController.getIsTeamLoadView(), 'Team load export should be active.');
        System.assert(teamLoadController.getHasTeamLoadRows(), 'Expected team load rows to be present.');
        System.assertEquals(1, teamLoadController.teamLoadRows.size());
        System.assertEquals(2, teamLoadController.teamLoadRows[0].total);
    }

    @IsTest
    static void buildsConflictAndWeekModels() {
        User ownerAlpha = createUser('pdf.owner.conflict');
        Team_Calendar__c alphaCalendar = createCalendar(
            'Conflict Calendar',
            '#ba0517',
            true,
            true,
            'conflict.pdf@example.com',
            ownerAlpha.Id
        );

        insert new List<Calendar_Event__c>{
            createEvent(
                'Overlap One',
                alphaCalendar.Id,
                ownerAlpha.Id,
                dt(2026, 4, 14, 9, 0),
                dt(2026, 4, 14, 11, 0),
                false,
                'Planned',
                'Conflict event 1'
            ),
            createEvent(
                'Overlap Two',
                alphaCalendar.Id,
                ownerAlpha.Id,
                dt(2026, 4, 14, 10, 0),
                dt(2026, 4, 14, 12, 0),
                false,
                'Confirmed',
                'Conflict event 2'
            )
        };

        Test.setCurrentPage(Page.TeamCalendarPdfExport);
        ApexPages.currentPage().getParameters().put('view', 'conflicts');
        ApexPages.currentPage().getParameters().put('currentDate', '2026-04-13');

        TeamCalendarPdfController conflictController = new TeamCalendarPdfController();
        System.assert(conflictController.getIsConflictsView(), 'Conflicts export should be active.');
        System.assert(conflictController.getHasConflictRows(), 'Expected conflict rows to be present.');
        System.assertEquals(1, conflictController.conflictRows.size());

        Test.setCurrentPage(Page.TeamCalendarPdfExport);
        ApexPages.currentPage().getParameters().put('view', 'week');
        ApexPages.currentPage().getParameters().put('currentDate', '2026-04-13');
        ApexPages.currentPage().getParameters().put('showWeekends', 'false');
        ApexPages.currentPage().getParameters().put('selectedUserIds', String.valueOf(ownerAlpha.Id));

        TeamCalendarPdfController weekController = new TeamCalendarPdfController();
        System.assert(weekController.getIsGridView(), 'Week export should still use the grid view.');
        System.assertEquals(1, weekController.weeks.size());
        System.assertEquals(5, weekController.weekdayHeaders.size());
        System.assert(weekController.rangeLabel.contains('Apr'), 'Week range label should use the week format.');
    }

    @IsTest
    static void buildsPdfModelFromPostedSnapshotEvents() {
        Test.setCurrentPage(Page.TeamCalendarPdfExport);
        ApexPages.currentPage().getParameters().put('view', 'month');
        ApexPages.currentPage().getParameters().put('currentDate', '2026-04-13');
        ApexPages.currentPage().getParameters().put('documentTitle', 'Team Calendar - April 2026');
        ApexPages.currentPage().getParameters().put('rangeLabel', 'April 2026');
        ApexPages.currentPage().getParameters().put('calendarLabel', 'Avail - Corpus Christi');
        ApexPages.currentPage().getParameters().put('statusLabel', 'All Statuses');
        ApexPages.currentPage().getParameters().put('selectedUserLabelText', 'None');
        ApexPages.currentPage().getParameters().put('showWeekends', 'true');
        ApexPages.currentPage().getParameters().put(
            'eventsJson',
            JSON.serialize(
                new List<Map<String, Object>>{
                    new Map<String, Object>{
                        'id' => 'a01Hs00000PdfEvt1',
                        'name' => '2002 13\' Boston Whaler 130 Sport',
                        'start' => '2026-04-07T09:00:00.000Z',
                        'endDateTime' => '2026-04-07T10:00:00.000Z',
                        'allDay' => false,
                        'status' => 'Calendar View',
                        'notes' => 'Avail - Corpus Christi',
                        'calendarId' => 'a00Hs00000PdfCal1',
                        'calendarName' => 'Avail - Corpus Christi',
                        'calendarColor' => '#706e6b'
                    },
                    new Map<String, Object>{
                        'id' => 'a01Hs00000PdfEvt2',
                        'name' => '2016 24\' Sportsman 247 Masters',
                        'start' => '2026-04-07T11:00:00.000Z',
                        'endDateTime' => '2026-04-07T12:00:00.000Z',
                        'allDay' => false,
                        'status' => 'Calendar View',
                        'notes' => 'Avail - Corpus Christi',
                        'calendarId' => 'a00Hs00000PdfCal1',
                        'calendarName' => 'Avail - Corpus Christi',
                        'calendarColor' => '#706e6b'
                    }
                }
            )
        );

        TeamCalendarPdfController controller = new TeamCalendarPdfController();

        System.assertEquals(2, controller.eventCount);
        System.assertEquals('None', controller.selectedUserLabelText);

        Integer renderedEventCount = 0;
        for (TeamCalendarPdfController.PrintableWeek week : controller.weeks) {
            for (TeamCalendarPdfController.PrintableDay day : week.days) {
                renderedEventCount += day.events.size();
            }
        }

        System.assertEquals(2, renderedEventCount, 'Snapshot events should render into the PDF month grid.');
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

        return [SELECT Id, Name FROM User WHERE Id = :row.Id LIMIT 1];
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