const { createElement } = require('lwc');

const mockNavigate = jest.fn();

jest.mock(
  'lightning/navigation',
  () => {
    const NavigationMixin = (Base) =>
      class extends Base {
        Navigate(pageReference) {
          mockNavigate(pageReference);
        }
      };

    NavigationMixin.Navigate = 'Navigate';

    return {
      NavigationMixin
    };
  },
  { virtual: true }
);

jest.mock(
  'lightning/pageReferenceUtils',
  () => ({
    encodeDefaultFieldValues: jest.fn((values) => JSON.stringify(values))
  }),
  { virtual: true }
);

jest.mock(
  'lightning/uiListsApi',
  () => {
    const { createLdsTestWireAdapter } = require('@salesforce/wire-service-jest-util');

    return {
      getListRecordsByName: createLdsTestWireAdapter(jest.fn())
    };
  },
  { virtual: true }
);

jest.mock(
  '@salesforce/apex/TeamCalendarBoardController.getCalendars',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarBoardController.getActiveUsers',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarBoardController.getUserCalendars',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarBoardController.getEventsForRange',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarBoardController.getPdfExportPageUrl',
  () => ({ default: jest.fn(() => Promise.resolve('/apex/TeamCalendarPdfExport')) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarSecurityController.getCurrentUserLayoutPreference',
  () => ({ default: jest.fn(() => Promise.resolve({ defaultView: 'month' })) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/GoogleCalendarSyncService.pushEventsForCalendar',
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/GoogleCalendarSyncService.importEventsFromGoogle',
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/GoogleCalendarConnectionService.getConnectionState',
  () => ({ default: jest.fn(() => Promise.resolve({ configured: false })) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/GoogleCalendarConnectionService.getAuthenticationUrl',
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/GoogleCalendarConnectionService.disconnectGoogle',
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/GoogleCalendarConnectionService.listAvailableCalendars',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/GoogleCalendarConnectionService.saveCalendarSelection',
  () => ({ default: jest.fn(() => Promise.resolve({ success: true } )) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/GoogleCalendarConnectionService.saveImportCalendarSelections',
  () => ({ default: jest.fn(() => Promise.resolve({ success: true })) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarRecordMutationService.deleteCalendarEvent',
  () => ({ default: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent',
  () => ({ default: jest.fn(() => Promise.resolve('a1B000000000001AAA')) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarRecordMutationService.deleteTask',
  () => ({ default: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);
jest.mock('@salesforce/user/Id', () => ({ default: '005000000000001AAA' }), {
  virtual: true
});

const TeamCalendarBoard = require('c/teamCalendarBoard').default;
const getCalendars = require('@salesforce/apex/TeamCalendarBoardController.getCalendars').default;
const getEventsForRange = require('@salesforce/apex/TeamCalendarBoardController.getEventsForRange').default;
const deleteCalendarEvent = require('@salesforce/apex/TeamCalendarRecordMutationService.deleteCalendarEvent').default;
const updateCalendarEvent = require('@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent').default;
const deleteTask = require('@salesforce/apex/TeamCalendarRecordMutationService.deleteTask').default;
const { encodeDefaultFieldValues } = require('lightning/pageReferenceUtils');

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('c-team-calendar-board', () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
    mockNavigate.mockReset();
  });

  it('mounts without throwing', async () => {
    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    expect(element).not.toBeNull();
  });

  it('opens an event-only context menu for deletable records', async () => {
    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    const grid = element.shadowRoot.querySelector('c-calendar-grid');
    grid.dispatchEvent(
      new CustomEvent('eventcontextmenu', {
        detail: {
          recordId: 'a1B000000000001AAA',
          recordName: 'Test Event',
          recordObjectApiName: 'Calendar_Event__c',
          recordContextId: '00U000000000001AAA',
          clientX: 140,
          clientY: 180,
          canDelete: true
        }
      })
    );
    await flushPromises();

    const menuButton = element.shadowRoot.querySelector('.event-context-menu__item');
    expect(menuButton).not.toBeNull();
    expect(menuButton.textContent).toContain('Delete Event');
  });

  it('deletes only the selected event record after confirmation', async () => {
    getEventsForRange
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'a1B000000000001AAA',
          name: 'Test Event',
          start: '2026-04-15T10:00:00.000Z',
          endDateTime: '2026-04-15T11:00:00.000Z',
          calendarColor: '#0176d3'
        }
      ])
      .mockResolvedValue([]);

    window.confirm = jest.fn(() => true);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    const grid = element.shadowRoot.querySelector('c-calendar-grid');
    grid.dispatchEvent(
      new CustomEvent('eventcontextmenu', {
        detail: {
          recordId: 'a1B000000000001AAA',
          recordName: 'Test Event',
          recordObjectApiName: 'Calendar_Event__c',
          recordContextId: '00U000000000001AAA',
          clientX: 140,
          clientY: 180,
          canDelete: true
        }
      })
    );
    await flushPromises();

    element.shadowRoot.querySelector('.event-context-menu__item').click();
    await flushPromises();

    expect(window.confirm).toHaveBeenCalled();
    expect(deleteCalendarEvent).toHaveBeenCalledWith({ recordId: 'a1B000000000001AAA' });
  });

  it('deletes task records through the mutation service when the context menu is opened', async () => {
    window.confirm = jest.fn(() => true);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    const grid = element.shadowRoot.querySelector('c-calendar-grid');
    grid.dispatchEvent(
      new CustomEvent('eventcontextmenu', {
        detail: {
          recordId: '00T000000000002AAA',
          recordName: 'Recon Meeting - AP/CC/SA',
          recordObjectApiName: 'Task',
          recordContextId: '00U000000000009AAA',
          clientX: 140,
          clientY: 180,
          canDelete: true
        }
      })
    );
    await flushPromises();

    const menuButton = element.shadowRoot.querySelector('.event-context-menu__item');
    expect(menuButton.textContent).toContain('Delete Task');

    menuButton.click();
    await flushPromises();

    expect(deleteTask).toHaveBeenCalledWith({
      recordId: '00T000000000002AAA',
      calendarViewId: '00U000000000009AAA'
    });
  });

  it('does not open the event modal for task views without create access', async () => {
    getCalendars.mockResolvedValueOnce([
      {
        id: '00U000000000001AAA',
        name: 'Open Tasks',
        assignedUserId: '005000000000001AAA',
        listViewFilterId: '00B000000000001AAA',
        listViewApiName: 'OpenTasks',
        listViewObjectApiName: 'Task',
        sobjectType: 'Task',
        startField: 'ActivityDate',
        canCreate: false,
        canEdit: false
      }
    ]);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    element.shadowRoot.querySelector('c-calendar-toolbar').dispatchEvent(
      new CustomEvent('calendarchange', {
        detail: '00U000000000001AAA',
        bubbles: true,
        composed: true
      })
    );
    await flushPromises();

    element.shadowRoot.querySelector('c-calendar-toolbar').dispatchEvent(
      new CustomEvent('new', { bubbles: true, composed: true })
    );
    await flushPromises();

    expect(element.shadowRoot.querySelector('c-calendar-create-modal')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('routes task create through standard Task navigation when access is allowed', async () => {
    getCalendars.mockResolvedValueOnce([
      {
        id: '00U000000000001AAA',
        name: 'Open Tasks',
        assignedUserId: '005000000000009AAA',
        listViewFilterId: '00B000000000001AAA',
        listViewApiName: 'OpenTasks',
        listViewObjectApiName: 'Task',
        sobjectType: 'Task',
        startField: 'ActivityDate',
        canCreate: true,
        canEdit: true
      }
    ]);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    element.shadowRoot.querySelector('c-calendar-toolbar').dispatchEvent(
      new CustomEvent('calendarchange', {
        detail: '00U000000000001AAA',
        bubbles: true,
        composed: true
      })
    );
    element.shadowRoot.querySelector('c-calendar-grid').dispatchEvent(
      new CustomEvent('dayselect', {
        detail: { dateKey: '2026-04-15' },
        bubbles: true,
        composed: true
      })
    );
    await flushPromises();

    await flushPromises();

    expect(encodeDefaultFieldValues).toHaveBeenCalledWith({
      ActivityDate: '2026-04-15',
      OwnerId: '005000000000009AAA'
    });
    expect(mockNavigate).toHaveBeenCalledWith({
      type: 'standard__objectPage',
      attributes: {
        objectApiName: 'Task',
        actionName: 'new'
      },
      state: {
        defaultFieldValues: JSON.stringify({
          ActivityDate: '2026-04-15',
          OwnerId: '005000000000009AAA'
        })
      }
    });
  });

  it('opens task records in the drawer with edit access disabled when the row is read only', async () => {
    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    const grid = element.shadowRoot.querySelector('c-calendar-grid');
    grid.dispatchEvent(
      new CustomEvent('eventopen', {
        detail: {
          recordId: '00T000000000001AAA',
          recordObjectApiName: 'Task',
          canEdit: false
        }
      })
    );
    await flushPromises();

    const drawer = element.shadowRoot.querySelector('c-calendar-event-drawer');
    expect(drawer).not.toBeNull();
    expect(drawer.recordId).toBe('00T000000000001AAA');
    expect(drawer.objectApiName).toBe('Task');
    expect(drawer.canEdit).toBe(false);
  });

  it('infers task object type from record context when the open event omits it', async () => {
    getCalendars.mockResolvedValueOnce([
      {
        id: '00U000000000009AAA',
        name: 'Open Tasks',
        listViewFilterId: '00B000000000009AAA',
        listViewApiName: 'OpenTasks',
        listViewObjectApiName: 'Task',
        sobjectType: 'Task',
        startField: 'ActivityDate',
        canCreate: true,
        canEdit: true
      }
    ]);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    const grid = element.shadowRoot.querySelector('c-calendar-grid');
    grid.dispatchEvent(
      new CustomEvent('eventopen', {
        detail: {
          recordId: '00T000000000003AAA',
          recordContextId: '00U000000000009AAA',
          canEdit: true,
          canDelete: true
        }
      })
    );
    await flushPromises();

    const drawer = element.shadowRoot.querySelector('c-calendar-event-drawer');
    expect(drawer.objectApiName).toBe('Task');
    expect(drawer.canDelete).toBe(true);
  });

  it('moves a calendar event to a dropped day and preserves its duration', async () => {
    getEventsForRange.mockResolvedValue([
      {
        id: 'a1B000000000001AAA',
        name: 'Test Event',
        start: '2026-03-02T09:00:00.000Z',
        endDateTime: '2026-03-02T10:00:00.000Z',
        allDay: false,
        status: 'Planned',
        notes: 'Dragged',
        calendarId: 'a1x000000000001AAA',
        calendarColor: '#0176d3',
        recordObjectApiName: 'Calendar_Event__c',
        canEdit: true,
        canDelete: true
      }
    ]);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    const grid = element.shadowRoot.querySelector('c-calendar-grid');
    grid.dispatchEvent(
      new CustomEvent('eventdrop', {
        detail: {
          recordId: 'a1B000000000001AAA',
          targetDateKey: '2026-03-05'
        },
        bubbles: true,
        composed: true
      })
    );
    await flushPromises();

    expect(updateCalendarEvent).toHaveBeenCalledTimes(1);

    const request = JSON.parse(updateCalendarEvent.mock.calls[0][0].requestJson);
    expect(request.recordId).toBe('a1B000000000001AAA');
    expect(request.calendarId).toBe('a1x000000000001AAA');
    expect(request.name).toBe('Test Event');
    expect(request.status).toBe('Planned');
    expect(request.notes).toBe('Dragged');
    expect(request.startValue).toContain('2026-03-05');
    expect(request.endValue).toContain('2026-03-05');
  });
});