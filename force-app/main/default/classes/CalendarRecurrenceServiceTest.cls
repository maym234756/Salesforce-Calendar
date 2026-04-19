@IsTest
private class CalendarRecurrenceServiceTest {

    // -------------------------------------------------------------------------
    // DAILY
    // -------------------------------------------------------------------------

    @IsTest
    static void expandOccurrences_daily_returnsMatchingDatesInRange() {
        Calendar_Event__c template = buildTemplate('2026-04-01T09:00:00Z', 'FREQ=DAILY;COUNT=7');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 4, 3),
            Date.newInstance(2026, 4, 5)
        );
        Test.stopTest();

        System.assertEquals(3, result.size(), 'Expected Apr 3, 4, 5');
        System.assertEquals(Date.newInstance(2026, 4, 3), result[0].date());
        System.assertEquals(Date.newInstance(2026, 4, 5), result[2].date());
    }

    @IsTest
    static void expandOccurrences_daily_respectsCount() {
        Calendar_Event__c template = buildTemplate('2026-04-01T09:00:00Z', 'FREQ=DAILY;COUNT=3');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 4, 1),
            Date.newInstance(2026, 4, 30)
        );
        Test.stopTest();

        System.assertEquals(3, result.size(), 'COUNT=3 should stop at 3 occurrences');
    }

    @IsTest
    static void expandOccurrences_daily_respectsUntil() {
        Calendar_Event__c template = buildTemplate('2026-04-01T09:00:00Z', 'FREQ=DAILY;UNTIL=20260405');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 4, 1),
            Date.newInstance(2026, 4, 30)
        );
        Test.stopTest();

        System.assertEquals(5, result.size(), 'UNTIL=Apr 5 → 5 occurrences (Apr 1-5)');
    }

    @IsTest
    static void expandOccurrences_daily_interval2() {
        Calendar_Event__c template = buildTemplate('2026-04-01T09:00:00Z', 'FREQ=DAILY;INTERVAL=2;COUNT=4');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 4, 1),
            Date.newInstance(2026, 4, 30)
        );
        Test.stopTest();

        System.assertEquals(4, result.size());
        System.assertEquals(Date.newInstance(2026, 4, 1), result[0].date());
        System.assertEquals(Date.newInstance(2026, 4, 3), result[1].date());
        System.assertEquals(Date.newInstance(2026, 4, 5), result[2].date());
        System.assertEquals(Date.newInstance(2026, 4, 7), result[3].date());
    }

    // -------------------------------------------------------------------------
    // WEEKLY
    // -------------------------------------------------------------------------

    @IsTest
    static void expandOccurrences_weekly_noByDay_usesTemplateDay() {
        // Apr 1 2026 is a Wednesday
        Calendar_Event__c template = buildTemplate('2026-04-01T10:00:00Z', 'FREQ=WEEKLY;COUNT=3');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 4, 1),
            Date.newInstance(2026, 4, 30)
        );
        Test.stopTest();

        System.assertEquals(3, result.size());
        // Each should be 7 days apart
        Long diff1 = result[0].getTime();
        Long diff2 = result[1].getTime();
        System.assertEquals(7 * 24 * 60 * 60 * 1000, diff2 - diff1);
    }

    @IsTest
    static void expandOccurrences_weekly_byDay_MWF() {
        // Series starts Monday Apr 6 2026
        Calendar_Event__c template = buildTemplate('2026-04-06T09:00:00Z', 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=9');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 4, 6),
            Date.newInstance(2026, 4, 20)
        );
        Test.stopTest();

        // Apr 6(Mon),8(Wed),10(Fri), 13(Mon),15(Wed),17(Fri), 20(Mon)
        System.assertEquals(7, result.size());
        System.assertEquals(Date.newInstance(2026, 4, 6), result[0].date());
        System.assertEquals(Date.newInstance(2026, 4, 8), result[1].date());
        System.assertEquals(Date.newInstance(2026, 4, 10), result[2].date());
        System.assertEquals(Date.newInstance(2026, 4, 20), result[6].date());
    }

    @IsTest
    static void expandOccurrences_weekly_byDay_returnsEmptyBeforeSeriesStart() {
        Calendar_Event__c template = buildTemplate('2026-04-10T09:00:00Z', 'FREQ=WEEKLY;BYDAY=FR;COUNT=3');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 4, 1),
            Date.newInstance(2026, 4, 8)
        );
        Test.stopTest();

        // Series starts Apr 10, range ends Apr 8 — no occurrences
        System.assertEquals(0, result.size());
    }

    // -------------------------------------------------------------------------
    // MONTHLY
    // -------------------------------------------------------------------------

    @IsTest
    static void expandOccurrences_monthly_byMonthDay() {
        Calendar_Event__c template = buildTemplate('2026-01-15T09:00:00Z', 'FREQ=MONTHLY;BYMONTHDAY=15;COUNT=4');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 1, 1),
            Date.newInstance(2026, 4, 30)
        );
        Test.stopTest();

        System.assertEquals(4, result.size());
        System.assertEquals(Date.newInstance(2026, 1, 15), result[0].date());
        System.assertEquals(Date.newInstance(2026, 2, 15), result[1].date());
        System.assertEquals(Date.newInstance(2026, 3, 15), result[2].date());
        System.assertEquals(Date.newInstance(2026, 4, 15), result[3].date());
    }

    @IsTest
    static void expandOccurrences_monthly_clampsDayToLastDayOfMonth() {
        // Day 31 — February only has 28/29 days
        Calendar_Event__c template = buildTemplate('2026-01-31T09:00:00Z', 'FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 1, 1),
            Date.newInstance(2026, 3, 31)
        );
        Test.stopTest();

        System.assertEquals(3, result.size());
        // Jan 31, Feb 28, Mar 31
        System.assertEquals(31, result[0].date().day());
        System.assertEquals(28, result[1].date().day()); // Feb clamped
        System.assertEquals(31, result[2].date().day());
    }

    // -------------------------------------------------------------------------
    // YEARLY
    // -------------------------------------------------------------------------

    @IsTest
    static void expandOccurrences_yearly() {
        Calendar_Event__c template = buildTemplate('2024-03-20T12:00:00Z', 'FREQ=YEARLY;COUNT=3');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2024, 1, 1),
            Date.newInstance(2027, 12, 31)
        );
        Test.stopTest();

        System.assertEquals(3, result.size());
        System.assertEquals(2024, result[0].date().year());
        System.assertEquals(2025, result[1].date().year());
        System.assertEquals(2026, result[2].date().year());
    }

    // -------------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------------

    @IsTest
    static void expandOccurrences_nullTemplate_returnsEmpty() {
        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            null,
            Date.newInstance(2026, 4, 1),
            Date.newInstance(2026, 4, 30)
        );
        Test.stopTest();

        System.assertEquals(0, result.size());
    }

    @IsTest
    static void expandOccurrences_blankRRule_returnsEmpty() {
        Calendar_Event__c template = buildTemplate('2026-04-01T09:00:00Z', '');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 4, 1),
            Date.newInstance(2026, 4, 30)
        );
        Test.stopTest();

        System.assertEquals(0, result.size());
    }

    @IsTest
    static void expandOccurrences_noMatchInRange_returnsEmpty() {
        Calendar_Event__c template = buildTemplate('2026-04-01T09:00:00Z', 'FREQ=DAILY;COUNT=5');

        Test.startTest();
        List<Datetime> result = CalendarRecurrenceService.expandOccurrences(
            template,
            Date.newInstance(2026, 5, 1),
            Date.newInstance(2026, 5, 31)
        );
        Test.stopTest();

        System.assertEquals(0, result.size());
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private static Calendar_Event__c buildTemplate(String startIso, String rrule) {
        Calendar_Event__c ev = new Calendar_Event__c();
        ev.Start__c = (Datetime) JSON.deserialize('"' + startIso + '"', Datetime.class);
        ev.Recurrence_Rule__c = rrule;
        return ev;
    }
}
