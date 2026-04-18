const {
  buildAssignableUserOptions,
  buildEventTemplateOptions,
  buildFollowUpPreviewRows,
  buildResolvedCalendarLabel,
  buildFollowUpSeries,
  buildTemplatePreset,
  normalizeFollowUpCount,
  resolveDefaultAssignedUserId,
  resolveFollowUpAppointmentType,
  shiftDateTimeValue
} = require('c/calendarCreateModal');

describe('c-calendar-create-modal helpers', () => {
  it('keeps assign-to options inside the shared security-filtered active-user list', () => {
    const rows = buildAssignableUserOptions([
      { id: '005A', label: 'Afton' },
      { id: '005B', name: 'Miles' },
      { id: null, label: 'Ignore Me' }
    ]);

    expect(rows).toEqual([
      { label: 'Afton', value: '005A' },
      { label: 'Miles', value: '005B' }
    ]);
  });

  it('defaults assign-to to the current user only when they are inside the allowed list', () => {
    expect(
      resolveDefaultAssignedUserId('005B', [
        { label: 'Afton', value: '005A' },
        { label: 'Miles', value: '005B' }
      ])
    ).toBe('005B');

    expect(
      resolveDefaultAssignedUserId('005Z', [
        { label: 'Afton', value: '005A' },
        { label: 'Miles', value: '005B' }
      ])
    ).toBe('005A');
  });

  it('exposes the expected event templates and presets', () => {
    expect(buildEventTemplateOptions().map((option) => option.value)).toEqual([
      'custom',
      'salesCall',
      'serviceFollowUp',
      'internalReview'
    ]);

    expect(buildTemplatePreset('serviceFollowUp')).toMatchObject({
      appointmentType: 'Follow-Up',
      reminderOffset: '1 Day',
      durationMinutes: 30,
      followUpFrequency: 'weekly',
      followUpCount: 3
    });
  });

  it('normalizes follow-up counts into the supported range', () => {
    expect(normalizeFollowUpCount('-2')).toBe(0);
    expect(normalizeFollowUpCount('3')).toBe(3);
    expect(normalizeFollowUpCount('50')).toBe(12);
  });

  it('shifts date times by the requested cadence', () => {
    expect(shiftDateTimeValue('2026-04-15T14:00:00.000Z', 'weekly', 2)).toBe(
      '2026-04-29T14:00:00.000Z'
    );
    expect(shiftDateTimeValue('2026-04-15T14:00:00.000Z', 'monthly', 1)).toBe(
      '2026-05-15T14:00:00.000Z'
    );
  });

  it('converts customer follow-up appointments into follow-up series rows', () => {
    const rows = buildFollowUpSeries(
      {
        Name: 'Customer Check-In',
        Calendar__c: 'a01000000000001AAA',
        Start__c: '2026-04-15T14:00:00.000Z',
        End__c: '2026-04-15T15:00:00.000Z',
        All_Day__c: false,
        Status__c: 'Planned',
        Notes__c: 'Bring service quote.',
        OwnerId: '005000000000001AAA',
        Appointment_Type__c: 'Customer',
        Reminder_Offset_Minutes__c: '30 Minutes',
        Customer_Account__c: '001000000000001AAA',
        Customer_Contact__c: '003000000000001AAA'
      },
      'weekly',
      2
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      Name: 'Customer Check-In (Follow-up 1)',
      Appointment_Type__c: 'Follow-Up',
      OwnerId: '005000000000001AAA',
      Customer_Account__c: '001000000000001AAA',
      Customer_Contact__c: '003000000000001AAA'
    });
    expect(rows[0].Start__c).toBe('2026-04-22T14:00:00.000Z');
    expect(rows[1].Start__c).toBe('2026-04-29T14:00:00.000Z');
  });

  it('builds a recurrence preview from the selected cadence', () => {
    const rows = buildFollowUpPreviewRows(
      '2026-04-15T14:00:00.000Z',
      '2026-04-15T15:00:00.000Z',
      'weekly',
      3
    );

    expect(rows).toHaveLength(3);
    expect(rows[0].startValue).toBe('2026-04-22T14:00:00.000Z');
    expect(rows[2].endValue).toBe('2026-05-06T15:00:00.000Z');
  });

  it('shows save-time resolution guidance when a team calendar is not yet resolved', () => {
    expect(buildResolvedCalendarLabel('a01000000000001AAA')).toBe('a01000000000001AAA');
    expect(buildResolvedCalendarLabel(null)).toBe('Will resolve or be created on save');
  });

  it('leaves non-customer appointment types unchanged when creating follow-ups', () => {
    expect(resolveFollowUpAppointmentType('Internal')).toBe('Internal');
    expect(resolveFollowUpAppointmentType('Customer')).toBe('Follow-Up');
  });
});