const {
    buildCsvExportContent,
    buildIcsExportContent
} = require('../calendarExportController');

describe('c-team-calendar-board calendarExportController', () => {
    it('builds CSV output for visible event records', () => {
        const csv = buildCsvExportContent([
            {
                id: 'a01AAA',
                name: 'Quarterly Review',
                start: '2026-04-21T14:30:00.000Z',
                endDateTime: '2026-04-21T15:15:00.000Z',
                allDay: false,
                status: 'Confirmed',
                calendarName: 'Sales',
                ownerName: 'Avery Stone',
                recordObjectApiName: 'Calendar_Event__c',
                notes: 'Discuss pipeline, blockers, and renewals.'
            },
            {
                id: 'a01AAB',
                name: 'Offsite',
                start: '2026-04-22T00:00:00.000Z',
                endDateTime: '2026-04-22T00:00:00.000Z',
                allDay: true,
                status: 'Tentative',
                calendarName: 'Team Calendar',
                ownerName: 'Jordan Lee',
                recordObjectApiName: 'Task',
                notes: 'Bring printed agenda.'
            }
        ]);

        expect(csv).toContain('Subject,Start Date,Start Time (UTC),End Date,End Time (UTC),All Day Event');
        expect(csv).toContain('Quarterly Review,2026-04-21,14:30,2026-04-21,15:15,FALSE,Confirmed,Sales,Avery Stone,Calendar_Event__c,a01AAA,"Discuss pipeline, blockers, and renewals."');
        expect(csv).toContain('Offsite,2026-04-22,,2026-04-22,,TRUE,Tentative,Team Calendar,Jordan Lee,Task,a01AAB,Bring printed agenda.');
    });

    it('quotes CSV fields containing commas and line breaks', () => {
        const csv = buildCsvExportContent([
            {
                id: 'a01AAC',
                name: 'Launch, Review',
                start: '2026-04-23T09:00:00.000Z',
                endDateTime: '2026-04-23T10:00:00.000Z',
                notes: 'Line one\nLine two'
            }
        ]);

        expect(csv).toContain('"Launch, Review"');
        expect(csv).toContain('"Line one\nLine two"');
    });

    it('builds iCal output with escaped text and all-day dates', () => {
        const ics = buildIcsExportContent(
            [
                {
                    id: 'a01AAD',
                    name: 'Launch Review',
                    start: '2026-04-24T09:00:00.000Z',
                    endDateTime: '2026-04-24T10:30:00.000Z',
                    status: 'Confirmed',
                    calendarName: 'Sales Ops',
                    ownerName: 'Parker Cole',
                    notes: 'Agenda: Launch, metrics\nFollow-up items.'
                },
                {
                    id: 'a01AAE',
                    name: 'Company Holiday',
                    start: '2026-04-25T00:00:00.000Z',
                    endDateTime: '2026-04-25T00:00:00.000Z',
                    allDay: true,
                    calendarName: 'Company'
                }
            ],
            { generatedAt: '2026-04-20T08:00:00.000Z' }
        );

        expect(ics).toContain('BEGIN:VCALENDAR');
        expect(ics).toContain('DTSTAMP:20260420T080000Z');
        expect(ics).toContain('SUMMARY:Launch Review');
        expect(ics).toContain('DESCRIPTION:Calendar: Sales Ops\\nStatus: Confirmed\\nOwner: Parker Cole\\nNotes: Agenda: Launch\\, metrics\\nFollow-up items.');
        expect(ics).toContain('STATUS:CONFIRMED');
        expect(ics).toContain('DTSTART:20260424T090000Z');
        expect(ics).toContain('DTEND:20260424T103000Z');
        expect(ics).toContain('DTSTART;VALUE=DATE:20260425');
        expect(ics).toContain('DTEND;VALUE=DATE:20260426');
    });
});