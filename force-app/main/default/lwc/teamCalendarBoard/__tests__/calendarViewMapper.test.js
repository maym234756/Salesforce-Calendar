const {
    getUiFieldValue,
    getUiFieldDisplayValue,
    toUiDateTimeValue,
    formatUiDateForBoard,
    toTime,
    getDefinitionObjectApiName,
    buildCalendarViewOptionalFields,
    extractListRecords,
    mapCalendarViewRecord,
    buildCalendarViewContextLinks,
    buildCalendarViewHoverDetails,
    dedupeNormalizedEvents
} = require('../calendarViewMapper');

function buildRecord(id, fields) {
    return {
        id,
        fields: Object.entries(fields).reduce((result, [fieldApiName, value]) => {
            result[fieldApiName] =
                value && typeof value === 'object' && ('value' in value || 'displayValue' in value)
                    ? value
                    : { value };
            return result;
        }, {})
    };
}

describe('teamCalendarBoard calendarViewMapper', () => {
    it('reads raw and display field values safely', () => {
        const record = buildRecord('a01', {
            Name: { value: 'Boat Alpha', displayValue: 'Boat Alpha Display' }
        });

        expect(getUiFieldValue(record, 'Name')).toBe('Boat Alpha');
        expect(getUiFieldDisplayValue(record, 'Name')).toBe('Boat Alpha Display');
        expect(getUiFieldValue(record, 'Missing__c')).toBeNull();
        expect(getUiFieldDisplayValue(record, 'Missing__c')).toBeNull();
    });

    it('normalizes date helper inputs for calendar view records', () => {
        const dateOnly = toUiDateTimeValue('2026-04-18');
        const dateTime = toUiDateTimeValue('2026-04-18T13:30:00.000Z');

        expect(dateOnly).toBeInstanceOf(Date);
        expect(dateOnly.getFullYear()).toBe(2026);
        expect(dateOnly.getMonth()).toBe(3);
        expect(dateOnly.getDate()).toBe(18);
        expect(dateTime.toISOString()).toBe('2026-04-18T13:30:00.000Z');
        expect(formatUiDateForBoard('2026-04-18')).toBe('2026-04-18T00:00:00');
        expect(formatUiDateForBoard('2026-04-18T13:30:00.000Z')).toBe('2026-04-18T13:30:00.000Z');
        expect(toUiDateTimeValue(null)).toBeNull();
        expect(toTime('2026-04-18T13:30:00.000Z')).toBe(new Date('2026-04-18T13:30:00.000Z').getTime());
    });

    it('builds optional fields and definition object names from the calendar definition', () => {
        const definition = {
            listViewObjectApiName: 'Marine__Boat__c',
            sobjectType: 'Marine__Boat__c',
            startField: 'Name',
            endField: 'Marine__Close_Date__c',
            displayField: 'Name'
        };

        const optionalFields = buildCalendarViewOptionalFields(definition);

        expect(getDefinitionObjectApiName(definition)).toBe('Marine__Boat__c');
        expect(getDefinitionObjectApiName({ sobjectType: 'Task' })).toBe('Task');
        expect(getDefinitionObjectApiName(null)).toBeNull();
        expect(optionalFields).toEqual(expect.arrayContaining([
            'Marine__Boat__c.Name',
            'Marine__Boat__c.Marine__Close_Date__c',
            'Marine__Boat__c.OwnerId',
            'Marine__Boat__c.Appraisal__c',
            'Marine__Boat__c.Deal__c',
            'Marine__Boat__c.In_Contract__c',
            'Marine__Boat__c.Unit_Deal_Stage__c',
            'Marine__Boat__c.Stage__c',
            'Marine__Boat__c.Marine__Stock_Number__c'
        ]));
        expect(optionalFields.filter((fieldName) => fieldName === 'Marine__Boat__c.Name')).toHaveLength(1);
        expect(buildCalendarViewOptionalFields({})).toEqual([]);
    });

    it('extracts records from the supported payload shapes', () => {
        const first = [{ id: '1' }];
        const second = [{ id: '2' }];
        const third = [{ id: '3' }];
        const fourth = [{ id: '4' }];

        expect(extractListRecords({ records: first })).toBe(first);
        expect(extractListRecords({ records: { records: second } })).toBe(second);
        expect(extractListRecords({ items: third })).toBe(third);
        expect(extractListRecords({ records: { items: fourth } })).toBe(fourth);
        expect(extractListRecords({})).toEqual([]);
    });

    it('maps boat calendar view records into normalized board events', () => {
        const record = buildRecord('a01boat', {
            Start__c: { value: '2026-04-18' },
            Name: { value: 'Boat Alpha', displayValue: 'Boat Alpha' },
            OwnerId: { value: '005owner', displayValue: 'Taylor Owner' },
            Appraisal__c: { value: 'a01appraisal', displayValue: 'Appraisal 42' },
            Deal__c: { value: 'a01deal', displayValue: 'Deal 77' },
            In_Contract__c: { value: true },
            Unit_Deal_Stage__c: { value: 'In Contract' },
            Stage__c: { value: 'Ready' },
            Marine__Stock_Number__c: { value: 'STK-42' }
        });
        const definition = {
            id: '00Uboat',
            name: 'Boat Schedule',
            sobjectType: 'Marine__Boat__c',
            listViewObjectApiName: 'Marine__Boat__c',
            startField: 'Start__c',
            displayField: 'Name',
            color: '#ff5500',
            canEdit: true
        };

        const event = mapCalendarViewRecord(
            record,
            definition,
            new Date('2026-04-01T00:00:00.000Z'),
            new Date('2026-05-01T00:00:00.000Z')
        );

        expect(event).toMatchObject({
            id: 'a01boat',
            name: 'Boat Alpha',
            ownerId: '005owner',
            ownerName: 'Taylor Owner',
            start: '2026-04-18T00:00:00',
            endDateTime: null,
            allDay: true,
            status: 'Calendar View',
            notes: 'Boat Schedule • Marine__Boat__c',
            calendarId: '00Uboat',
            calendarName: 'Boat Schedule',
            calendarColor: '#ff5500',
            recordObjectApiName: 'Marine__Boat__c',
            recordContextId: '00Uboat',
            canEdit: true,
            canDelete: false
        });
        expect(event.contextLinks.map((link) => link.label)).toEqual(['Unit', 'Appraisal', 'Sales Deal']);
        expect(event.hoverDetails).toEqual(['Boat Schedule', 'Stock #: STK-42', 'Stage: Ready']);
    });

    it('falls back to Name when the display field looks like a Salesforce id', () => {
        const record = buildRecord('00Ttask', {
            ActivityDate: { value: '2026-04-20' },
            Subject__c: { value: '001000000000000AAA' },
            Name: { value: 'Friendly Task Name', displayValue: 'Friendly Task Name' },
            OwnerId: { value: '005owner', displayValue: 'Jamie Owner' }
        });
        const definition = {
            id: '00Utask',
            name: 'Task Schedule',
            sobjectType: 'Task',
            listViewObjectApiName: 'Task',
            startField: 'ActivityDate',
            displayField: 'Subject__c'
        };

        const event = mapCalendarViewRecord(
            record,
            definition,
            new Date('2026-04-01T00:00:00.000Z'),
            new Date('2026-05-01T00:00:00.000Z')
        );

        expect(event.name).toBe('Friendly Task Name');
    });

    it('skips records that are missing or outside the requested date window', () => {
        const definition = {
            id: '00Uwindow',
            name: 'Window Test',
            sobjectType: 'Task',
            listViewObjectApiName: 'Task',
            startField: 'Start__c',
            endField: 'End__c'
        };
        const startBoundary = new Date('2026-04-10T00:00:00.000Z');
        const endBoundaryExclusive = new Date('2026-04-20T00:00:00.000Z');

        expect(mapCalendarViewRecord(buildRecord('missing', {}), definition, startBoundary, endBoundaryExclusive)).toBeNull();
        expect(
            mapCalendarViewRecord(
                buildRecord('late', { Start__c: { value: '2026-04-25' } }),
                definition,
                startBoundary,
                endBoundaryExclusive
            )
        ).toBeNull();
        expect(
            mapCalendarViewRecord(
                buildRecord('ended', {
                    Start__c: { value: '2026-04-01' },
                    End__c: { value: '2026-04-05' }
                }),
                definition,
                startBoundary,
                endBoundaryExclusive
            )
        ).toBeNull();
        expect(
            mapCalendarViewRecord(
                buildRecord('started-before', { Start__c: { value: '2026-04-01' } }),
                { ...definition, endField: null },
                startBoundary,
                endBoundaryExclusive
            )
        ).toBeNull();
    });

    it('builds contextual links and hover details for appraisal and deal records', () => {
        const appraisalRecord = buildRecord('a01appraisal', {
            Name: { value: 'Appraisal 100', displayValue: 'Appraisal 100' },
            Boat__c: { value: 'a01boat', displayValue: 'Boat 7' },
            Deal__c: { value: 'a01deal', displayValue: 'Deal 7' },
            Deal_Stage__c: { value: 'In Contract' },
            Stage__c: { value: 'Approved' }
        });
        const dealRecord = buildRecord('a01deal', {
            Name: { value: 'Deal 200', displayValue: 'Deal 200' },
            Marine__Boat__c: { value: 'a01boat', displayValue: 'Boat 9' },
            'Marine__Boat__r.Appraisal__c': { value: 'a01appraisal', displayValue: 'Appraisal 9' },
            Marine__Stage__c: { value: 'In Contract' }
        });

        expect(buildCalendarViewContextLinks(appraisalRecord, 'Appraisal__c').map((link) => link.label)).toEqual([
            'Unit',
            'Appraisal',
            'Sales Deal'
        ]);
        expect(buildCalendarViewContextLinks(dealRecord, 'Marine__Deal__c').map((link) => link.label)).toEqual([
            'Unit',
            'Appraisal',
            'Sales Deal'
        ]);
        expect(
            buildCalendarViewHoverDetails(appraisalRecord, { name: 'Appraisal Queue' }, 'Appraisal__c')
        ).toEqual(['Appraisal Queue', 'Unit: Boat 7', 'Appraisal: Approved']);
        expect(
            buildCalendarViewHoverDetails(dealRecord, { name: 'Deals' }, 'Marine__Deal__c')
        ).toEqual(['Deals', 'Unit: Boat 9', 'Deal: In Contract']);
    });

    it('dedupes normalized events and sorts the survivors by start time and name', () => {
        const events = [
            {
                id: 'evt-2',
                name: 'Zulu',
                calendarId: 'cal-1',
                start: '2026-04-19T09:00:00.000Z'
            },
            {
                id: 'evt-1',
                name: 'Bravo',
                calendarId: 'cal-1',
                start: '2026-04-18T09:00:00.000Z'
            },
            {
                id: 'evt-1',
                name: 'Bravo Duplicate',
                calendarId: 'cal-1',
                start: '2026-04-18T10:00:00.000Z'
            },
            {
                externalEventId: 'google-1',
                name: 'Alpha',
                calendarId: 'cal-2',
                start: '2026-04-18T09:00:00.000Z'
            }
        ];

        expect(dedupeNormalizedEvents(events)).toEqual([
            {
                externalEventId: 'google-1',
                name: 'Alpha',
                calendarId: 'cal-2',
                start: '2026-04-18T09:00:00.000Z'
            },
            {
                id: 'evt-1',
                name: 'Bravo',
                calendarId: 'cal-1',
                start: '2026-04-18T09:00:00.000Z'
            },
            {
                id: 'evt-2',
                name: 'Zulu',
                calendarId: 'cal-1',
                start: '2026-04-19T09:00:00.000Z'
            }
        ]);
    });
});