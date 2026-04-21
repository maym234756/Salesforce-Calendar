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
  '@salesforce/apex/TeamCalendarSecurityController.saveCurrentUserLayoutPreference',
  () => ({ default: jest.fn(({ preferenceJson }) => Promise.resolve(JSON.parse(preferenceJson))) }),
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
  '@salesforce/apex/TeamCalendarUndoService.undeleteCalendarEvent',
  () => ({ default: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent',
  () => ({ default: jest.fn(() => Promise.resolve('a1B000000000001AAA')) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarRecordMutationService.createCalendarEventSeries',
  () => ({ default: jest.fn(() => Promise.resolve('a1B000000000001AAA')) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarRecordMutationService.deleteTask',
  () => ({ default: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarUndoService.undeleteTask',
  () => ({ default: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);
jest.mock('@salesforce/user/Id', () => ({ default: '005000000000001AAA' }), {
  virtual: true
});

const TeamCalendarBoard = require('c/teamCalendarBoard').default;
const getCalendars = require('@salesforce/apex/TeamCalendarBoardController.getCalendars').default;
const getActiveUsers = require('@salesforce/apex/TeamCalendarBoardController.getActiveUsers').default;
const getUserCalendars = require('@salesforce/apex/TeamCalendarBoardController.getUserCalendars').default;
const getEventsForRange = require('@salesforce/apex/TeamCalendarBoardController.getEventsForRange').default;
const saveCurrentUserLayoutPreference = require('@salesforce/apex/TeamCalendarSecurityController.saveCurrentUserLayoutPreference').default;
const deleteCalendarEvent = require('@salesforce/apex/TeamCalendarRecordMutationService.deleteCalendarEvent').default;
const undeleteCalendarEvent = require('@salesforce/apex/TeamCalendarUndoService.undeleteCalendarEvent').default;
const updateCalendarEvent = require('@salesforce/apex/TeamCalendarRecordMutationService.updateCalendarEvent').default;
const createCalendarEventSeries = require('@salesforce/apex/TeamCalendarRecordMutationService.createCalendarEventSeries').default;
const deleteTask = require('@salesforce/apex/TeamCalendarRecordMutationService.deleteTask').default;
const undeleteTask = require('@salesforce/apex/TeamCalendarUndoService.undeleteTask').default;
const { encodeDefaultFieldValues } = require('lightning/pageReferenceUtils');
const { getListRecordsByName } = require('lightning/uiListsApi');

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
const readGetter = (prototype, propertyName, context) =>
  Object.getOwnPropertyDescriptor(prototype, propertyName).get.call(context);

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

  it('saves current-user calendar color overrides from the legend', async () => {
    getCalendars.mockResolvedValueOnce([
      {
        id: 'a1x000000000001AAA',
        name: 'Sales',
        color: '#0176d3',
        isDisplayed: true
      }
    ]);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    const toolbar = element.shadowRoot.querySelector('c-calendar-toolbar');
    toolbar.dispatchEvent(
      new CustomEvent('calendarchange', {
        detail: 'a1x000000000001AAA',
        bubbles: true,
        composed: true
      })
    );
    await flushPromises();
    await flushPromises();

    const legend = element.shadowRoot.querySelector('c-calendar-legend');
    expect(legend).not.toBeNull();

    legend.dispatchEvent(
      new CustomEvent('calendarcolorchange', {
        detail: {
          calendarId: 'a1x000000000001AAA',
          color: '#ff6600'
        },
        bubbles: true,
        composed: true
      })
    );
    await flushPromises();

    expect(saveCurrentUserLayoutPreference).toHaveBeenCalledTimes(1);
    expect(JSON.parse(saveCurrentUserLayoutPreference.mock.calls[0][0].preferenceJson))
      .toMatchObject({
        calendarColorOverrides: {
          a1x000000000001AAA: '#ff6600'
        }
      });
  });

  it('shows the legend only for the selected calendar dropdown item', async () => {
    getCalendars.mockResolvedValueOnce([
      {
        id: 'a1x000000000001AAA',
        name: 'Sales',
        color: '#0176d3',
        isDisplayed: true
      },
      {
        id: 'a1x000000000002AAA',
        name: 'Service',
        color: '#2e844a',
        isDisplayed: true
      }
    ]);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector('c-calendar-legend')).toBeNull();

    const toolbar = element.shadowRoot.querySelector('c-calendar-toolbar');
    toolbar.dispatchEvent(
      new CustomEvent('calendarchange', {
        detail: 'a1x000000000002AAA',
        bubbles: true,
        composed: true
      })
    );
    await flushPromises();
    await flushPromises();

    const legend = element.shadowRoot.querySelector('c-calendar-legend');
    expect(legend).not.toBeNull();
    expect(legend.items).toEqual([
      {
        id: 'a1x000000000002AAA',
        label: 'Service',
        color: '#2e844a',
        defaultColor: '#2e844a'
      }
    ]);
  });

  it('loads calendar view events after selecting a calendar view once wire data arrives', async () => {
    getCalendars.mockResolvedValueOnce([
      {
        id: '00U000000000001AAA',
        name: 'Avail - Corpus Christi',
        color: '#706e6b',
        isDisplayed: true,
        canCreate: false,
        canEdit: false,
        sobjectType: 'Marine__Boat__c',
        startField: 'Available_Date__c',
        displayField: 'Name',
        listViewFilterId: '00B000000000001AAA',
        listViewApiName: 'AvailableInventory',
        listViewObjectApiName: 'Marine__Boat__c'
      }
    ]);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    element.currentDate = new Date('2026-04-10T12:00:00.000Z');
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    element.shadowRoot.querySelector('c-calendar-toolbar').dispatchEvent(
      new CustomEvent('calendarchange', {
        detail: '00U000000000001AAA',
        bubbles: true,
        composed: true
      })
    );
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector('c-calendar-toolbar').eventCount).toBe(0);

    getListRecordsByName.emit({
      records: [
        {
          id: 'a2B000000000001AAA',
          fields: {
            Name: {
              displayValue: '2023 17 TRACKER T/S D/W',
              value: '2023 17 TRACKER T/S D/W'
            },
            Available_Date__c: {
              value: '2026-04-15'
            },
            OwnerId: {
              value: '005000000000001AAA'
            }
          }
        }
      ]
    });
    await flushPromises();
    await flushPromises();

    const toolbar = element.shadowRoot.querySelector('c-calendar-toolbar');
    const grid = element.shadowRoot.querySelector('c-calendar-grid');

    expect(toolbar.eventCount).toBe(1);
    expect(
      grid.weeks.some((week) =>
        (week.days || []).some((day) =>
          (day.events || []).some((item) => item.name === '2023 17 TRACKER T/S D/W')
        )
      )
    ).toBe(true);
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

    const labels = Array.from(
      element.shadowRoot.querySelectorAll('.event-context-menu__item-label')
    ).map((node) => node.textContent.trim());
    expect(labels).toEqual(['Delete Event']);
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

    Array.from(element.shadowRoot.querySelectorAll('.event-context-menu__item'))
      .find((button) => button.dataset.actionType === 'delete')
      .click();
    await flushPromises();

    const confirmBtn = element.shadowRoot.querySelector('.slds-button_destructive');
    expect(confirmBtn).not.toBeNull();
    confirmBtn.click();
    await flushPromises();

    expect(deleteCalendarEvent).toHaveBeenCalledWith({ recordId: 'a1B000000000001AAA' });
  });

  it('deletes task records through the mutation service when the context menu is opened', async () => {
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

    const menuButton = Array.from(element.shadowRoot.querySelectorAll('.event-context-menu__item'))
      .find((button) => button.dataset.actionType === 'delete');
    expect(menuButton.textContent).toContain('Delete Task');

    menuButton.click();
    await flushPromises();

    const confirmBtn = element.shadowRoot.querySelector('.slds-button_destructive');
    expect(confirmBtn).not.toBeNull();
    confirmBtn.click();
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

  it('navigates directly to task records instead of opening the drawer', async () => {
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

    expect(mockNavigate).toHaveBeenCalledWith({
      type: 'standard__recordPage',
      attributes: {
        recordId: '00T000000000001AAA',
        objectApiName: 'Task',
        actionName: 'view'
      }
    });
    expect(element.shadowRoot.querySelector('c-calendar-event-drawer')).toBeNull();
  });

  it('infers task object type from record context and navigates directly', async () => {
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

    expect(mockNavigate).toHaveBeenCalledWith({
      type: 'standard__recordPage',
      attributes: {
        recordId: '00T000000000003AAA',
        objectApiName: 'Task',
        actionName: 'view'
      }
    });
    expect(element.shadowRoot.querySelector('c-calendar-event-drawer')).toBeNull();
  });

  it('navigates to calendar-view unit records on left click instead of opening the drawer', async () => {
    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    const grid = element.shadowRoot.querySelector('c-calendar-grid');
    grid.dispatchEvent(
      new CustomEvent('eventopen', {
        detail: {
          recordId: 'a01000000000001AAA',
          recordObjectApiName: 'Marine__Boat__c',
          recordContextId: '03A000000000001AAA',
          canEdit: false,
          canDelete: false
        }
      })
    );
    await flushPromises();

    expect(mockNavigate).toHaveBeenCalledWith({
      type: 'standard__recordPage',
      attributes: {
        recordId: 'a01000000000001AAA',
        objectApiName: 'Marine__Boat__c',
        actionName: 'view'
      }
    });
    expect(element.shadowRoot.querySelector('c-calendar-event-drawer')).toBeNull();
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

  it('supports undo after moving a calendar event', async () => {
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

    const undoButton = element.shadowRoot.querySelector('.mutation-toast__action');
    expect(undoButton).not.toBeNull();

    undoButton.click();
    await flushPromises();

    expect(updateCalendarEvent).toHaveBeenCalledTimes(2);
    const undoRequest = JSON.parse(updateCalendarEvent.mock.calls[1][0].requestJson);
    expect(undoRequest.recordId).toBe('a1B000000000001AAA');
    expect(undoRequest.startValue).toBe('2026-03-02T09:00:00.000Z');
    expect(undoRequest.endValue).toBe('2026-03-02T10:00:00.000Z');
  });

  it('supports undo after deleting a calendar event', async () => {
    getEventsForRange.mockResolvedValue([
      {
        id: 'a1B000000000001AAA',
        name: 'Test Event',
        start: '2026-04-15T10:00:00.000Z',
        endDateTime: '2026-04-15T11:00:00.000Z',
        recordObjectApiName: 'Calendar_Event__c',
        recordContextId: '00U000000000001AAA',
        canDelete: true,
        calendarColor: '#0176d3'
      }
    ]);

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

    Array.from(element.shadowRoot.querySelectorAll('.event-context-menu__item'))
      .find((button) => button.dataset.actionType === 'delete')
      .click();
    await flushPromises();

    element.shadowRoot.querySelector('.slds-button_destructive').click();
    await flushPromises();

    const undoButton = element.shadowRoot.querySelector('.mutation-toast__action');
    expect(undoButton).not.toBeNull();

    undoButton.click();
    await flushPromises();

    expect(deleteCalendarEvent).toHaveBeenCalledWith({ recordId: 'a1B000000000001AAA' });
    expect(undeleteCalendarEvent).toHaveBeenCalledWith({ recordId: 'a1B000000000001AAA' });
  });

  it('supports undo after deleting a task', async () => {
    getEventsForRange.mockResolvedValue([]);

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

    Array.from(element.shadowRoot.querySelectorAll('.event-context-menu__item'))
      .find((button) => button.dataset.actionType === 'delete')
      .click();
    await flushPromises();

    element.shadowRoot.querySelector('.slds-button_destructive').click();
    await flushPromises();

    const undoButton = element.shadowRoot.querySelector('.mutation-toast__action');
    expect(undoButton).not.toBeNull();

    undoButton.click();
    await flushPromises();

    expect(deleteTask).toHaveBeenCalledWith({
      recordId: '00T000000000002AAA',
      calendarViewId: '00U000000000009AAA'
    });
    expect(undeleteTask).toHaveBeenCalledWith({
      recordId: '00T000000000002AAA',
      calendarViewId: '00U000000000009AAA'
    });
  });

  it('shows related record actions for unit calendar-view events without a delete action', async () => {
    getEventsForRange.mockResolvedValueOnce([
      {
        id: 'a01000000000001AAA',
        name: "2024 12' YAMAHA FX",
        start: '2026-04-18T00:00:00.000Z',
        endDateTime: null,
        allDay: true,
        calendarName: 'Avail Units - All Stores',
        recordObjectApiName: 'Marine__Boat__c',
        recordContextId: '03A000000000001AAA',
        canDelete: false,
        hasContextMenu: true,
        contextLinks: [
          {
            key: 'unit',
            label: 'Unit',
            recordId: 'a01000000000001AAA',
            objectApiName: 'Marine__Boat__c',
            recordName: "2024 12' YAMAHA FX"
          },
          {
            key: 'appraisal',
            label: 'Appraisal',
            recordId: 'a09000000000001AAA',
            objectApiName: 'Appraisal__c',
            recordName: 'Conroe / Demoore'
          },
          {
            key: 'sales-deal',
            label: 'Sales Deal',
            recordId: 'a0C000000000001AAA',
            objectApiName: 'Marine__Deal__c',
            recordName: 'Beaumont / Defoore'
          }
        ]
      }
    ]);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    const grid = element.shadowRoot.querySelector('c-calendar-grid');
    grid.dispatchEvent(
      new CustomEvent('eventcontextmenu', {
        detail: {
          recordId: 'a01000000000001AAA',
          recordName: "2024 12' YAMAHA FX",
          recordObjectApiName: 'Marine__Boat__c',
          recordContextId: '03A000000000001AAA',
          clientX: 200,
          clientY: 220,
          canDelete: false,
          canContextMenu: true
        }
      })
    );
    await flushPromises();

    const labels = Array.from(element.shadowRoot.querySelectorAll('.event-context-menu__item-label')).map((node) => node.textContent.trim());
    expect(labels).toEqual(expect.arrayContaining(['Unit', 'Appraisal', 'Sales Deal']));
    expect(labels.some((label) => label.includes('Delete'))).toBe(false);
  });

  it('renders a hover preview for hovered calendar events', async () => {
    getEventsForRange.mockResolvedValueOnce([
      {
        id: 'a01000000000001AAA',
        name: '2020 20\' EXCEL 203 BAY PRO',
        start: '2026-04-18T13:00:00.000Z',
        endDateTime: '2026-04-18T14:00:00.000Z',
        allDay: false,
        calendarName: 'Avail Units - All Stores',
        recordObjectApiName: 'Marine__Boat__c',
        recordContextId: '03A000000000001AAA',
        canDelete: false,
        hasContextMenu: true,
        hoverDetails: ['Stock #: TRA-013A', 'Stage: Available for Sale']
      }
    ]);

    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    const grid = element.shadowRoot.querySelector('c-calendar-grid');
    grid.dispatchEvent(
      new CustomEvent('eventhover', {
        detail: {
          recordId: 'a01000000000001AAA',
          recordName: '2020 20\' EXCEL 203 BAY PRO',
          recordObjectApiName: 'Marine__Boat__c',
          recordContextId: '03A000000000001AAA',
          canDelete: false,
          canContextMenu: true,
          clientX: 180,
          clientY: 160
        },
        bubbles: true,
        composed: true
      })
    );
    await flushPromises();

    const hoverCard = element.shadowRoot.querySelector('.event-hover-card');
    expect(hoverCard).not.toBeNull();
    expect(hoverCard.textContent).toContain('2020 20\' EXCEL 203 BAY PRO');
    expect(hoverCard.textContent).toContain('Stock #: TRA-013A');
  });

  it('trims toolbar search input and rebuilds the view models', () => {
    const context = {
      rebuildViewModels: jest.fn()
    };

    TeamCalendarBoard.prototype.handleToolbarSearchChange.call(context, {
      detail: '  Revenue  '
    });

    expect(context._searchTerm).toBe('Revenue');
    expect(context.rebuildViewModels).toHaveBeenCalledTimes(1);
  });

  it('normalizes toolbar layout changes and ignores empty updates', () => {
    const context = {
      userLayoutPreference: {
        defaultView: 'month',
        defaultStatus: '',
        showWeekends: true,
        autoExpandDayHeight: true,
        wrapEventTitles: true,
        compactEventDensity: false,
        showSelectUsersBox: true,
        showFilterControls: true
      },
      rebuildViewModels: jest.fn()
    };

    TeamCalendarBoard.prototype.handleToolbarLayoutChange.call(context, {
      detail: {}
    });

    expect(context.rebuildViewModels).not.toHaveBeenCalled();

    TeamCalendarBoard.prototype.handleToolbarLayoutChange.call(context, {
      detail: {
        settings: {
          showWeekends: false,
          compactEventDensity: true
        }
      }
    });

    expect(context.userLayoutPreference.showWeekends).toBe(false);
    expect(context.userLayoutPreference.compactEventDensity).toBe(true);
    expect(context.rebuildViewModels).toHaveBeenCalledTimes(1);
  });

  it('routes keyboard shortcuts, escape handling, and overlay toggles', () => {
    const context = {
      showKeyboardShortcutOverlay: false,
      pendingDeleteConfirm: null,
      showCreateModal: false,
      showDrawer: false,
      showGoogleConnectModal: false,
      showGoogleImportModal: false,
      showGoogleExportModal: false,
      handleToday: jest.fn(),
      _switchView: jest.fn(),
      handleHeaderNewEvent: jest.fn(),
      handleRefresh: jest.fn(),
      handlePrev: jest.fn(),
      handleNext: jest.fn(),
      handleCancelDelete: jest.fn(),
      handleCloseModal: jest.fn(),
      handleCloseDrawer: jest.fn()
    };

    const buildKeyEvent = (key, overrides = {}) => ({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { tagName: 'DIV' },
      composedPath: () => [{ tagName: 'DIV' }],
      preventDefault: jest.fn(),
      ...overrides
    });

    context.showKeyboardShortcutOverlay = true;
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('Escape'));
    expect(context.showKeyboardShortcutOverlay).toBe(false);

    context.pendingDeleteConfirm = { recordId: 'a1B' };
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('Escape'));
    expect(context.handleCancelDelete).toHaveBeenCalledTimes(1);
    context.pendingDeleteConfirm = null;

    context.showCreateModal = true;
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('Escape'));
    expect(context.handleCloseModal).toHaveBeenCalledTimes(1);
    context.showCreateModal = false;

    context.showDrawer = true;
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('Escape'));
    expect(context.handleCloseDrawer).toHaveBeenCalledTimes(1);
    context.showDrawer = false;

    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('?'));
    expect(context.showKeyboardShortcutOverlay).toBe(true);
    context.showKeyboardShortcutOverlay = false;

    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('t'));
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('m'));
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('w'));
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('d'));
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('a'));
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('n'));
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('r'));
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('ArrowLeft'));
    TeamCalendarBoard.prototype.handleKeyDown.call(context, buildKeyEvent('ArrowRight'));

    expect(context.handleToday).toHaveBeenCalledTimes(1);
    expect(context._switchView.mock.calls).toEqual([['month'], ['week'], ['day'], ['agenda']]);
    expect(context.handleHeaderNewEvent).toHaveBeenCalledTimes(1);
    expect(context.handleRefresh).toHaveBeenCalledTimes(1);
    expect(context.handlePrev).toHaveBeenCalledTimes(1);
    expect(context.handleNext).toHaveBeenCalledTimes(1);
  });

  it('ignores keyboard shortcuts for modifiers, editable targets, and blocking modals', () => {
    const context = {
      showKeyboardShortcutOverlay: false,
      pendingDeleteConfirm: null,
      showCreateModal: false,
      showDrawer: false,
      showGoogleConnectModal: false,
      showGoogleImportModal: false,
      showGoogleExportModal: false,
      handleToday: jest.fn(),
      _switchView: jest.fn(),
      handleHeaderNewEvent: jest.fn(),
      handleRefresh: jest.fn(),
      handlePrev: jest.fn(),
      handleNext: jest.fn()
    };

    TeamCalendarBoard.prototype.handleKeyDown.call(context, {
      key: 't',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      target: { tagName: 'DIV' },
      composedPath: () => [{ tagName: 'DIV' }],
      preventDefault: jest.fn()
    });

    TeamCalendarBoard.prototype.handleKeyDown.call(context, {
      key: 't',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { tagName: 'INPUT' },
      composedPath: () => [{ tagName: 'INPUT' }],
      preventDefault: jest.fn()
    });

    context.showGoogleConnectModal = true;
    TeamCalendarBoard.prototype.handleKeyDown.call(context, {
      key: 't',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { tagName: 'DIV' },
      composedPath: () => [{ tagName: 'DIV' }],
      preventDefault: jest.fn()
    });

    expect(context.handleToday).not.toHaveBeenCalled();
    expect(context._switchView).not.toHaveBeenCalled();
  });

  it('computes quick-create, calendar-view, and selected-user derived getters', () => {
    const previousInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 260
    });

    const context = {
      _quickCreate: {
        anchorRect: {
          bottom: 12,
          left: 240
        },
        title: 'Quick Win',
        calendarId: 'a1x000000000001AAA',
        isSaving: true
      },
      calendarDefinitions: [
        {
          id: 'a1x000000000001AAA',
          name: 'Sales',
          canCreate: true
        },
        {
          id: '00U000000000001AAA',
          name: 'Open Tasks',
          canCreate: false,
          listViewFilterId: '00B000000000001AAA',
          listViewApiName: 'OpenTasks',
          listViewObjectApiName: 'Task',
          sobjectType: 'Task',
          startField: 'ActivityDate',
          endField: 'ActivityDate',
          displayField: 'Subject'
        }
      ],
      selectedCalendarId: '00U000000000001AAA',
      activeUserOptions: [{ id: 'u1', label: 'Alex' }],
      selectedUserIds: ['u1'],
      userCalendarsByUser: {
        u1: [{ id: 'c1', label: 'Revenue Team' }]
      },
      selectedCalendarsByUser: {
        u1: ['c1']
      },
      activeUserCalendarUserId: 'u1'
    };

    Object.defineProperty(context, 'selectedCalendarDefinition', {
      get() {
        return readGetter(TeamCalendarBoard.prototype, 'selectedCalendarDefinition', context);
      }
    });
    Object.defineProperty(context, 'isCalendarViewBackedSelection', {
      get() {
        return readGetter(TeamCalendarBoard.prototype, 'isCalendarViewBackedSelection', context);
      }
    });
    Object.defineProperty(context, 'calendarViewWireObjectApiName', {
      get() {
        return readGetter(TeamCalendarBoard.prototype, 'calendarViewWireObjectApiName', context);
      }
    });

    const selectedUsersDetailed = readGetter(
      TeamCalendarBoard.prototype,
      'selectedUsersDetailed',
      context
    );
    context.selectedUsersDetailed = selectedUsersDetailed;

    expect(readGetter(TeamCalendarBoard.prototype, 'quickCreateStyle', context)).toBe(
      'top:18px; left:6px;'
    );
    expect(readGetter(TeamCalendarBoard.prototype, 'quickCreateCalendarOptions', context)).toEqual([
      { label: 'Sales', value: 'a1x000000000001AAA' }
    ]);
    expect(readGetter(TeamCalendarBoard.prototype, 'quickCreateTitle', context)).toBe('Quick Win');
    expect(readGetter(TeamCalendarBoard.prototype, 'quickCreateCalendarId', context)).toBe(
      'a1x000000000001AAA'
    );
    expect(readGetter(TeamCalendarBoard.prototype, 'quickCreateIsSaving', context)).toBe(true);
    expect(context.selectedCalendarDefinition.id).toBe('00U000000000001AAA');
    expect(context.isCalendarViewBackedSelection).toBe(true);
    expect(readGetter(TeamCalendarBoard.prototype, 'calendarViewWireApiName', context)).toBe('OpenTasks');
    expect(readGetter(TeamCalendarBoard.prototype, 'calendarViewWireOptionalFields', context)).toEqual(
      expect.arrayContaining([
        'Task.ActivityDate',
        'Task.Subject',
        'Task.OwnerId',
        'Task.Name'
      ])
    );
    expect(selectedUsersDetailed[0]).toMatchObject({
      id: 'u1',
      label: 'Alex',
      selectedCalendarSummary: '1 calendar',
      chipClass: 'user-chip user-chip--active'
    });
    expect(selectedUsersDetailed[0].calendarOptions[0].checked).toBe(true);
    expect(readGetter(TeamCalendarBoard.prototype, 'activeUserCalendarMenu', context).id).toBe('u1');

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: previousInnerWidth
    });
  });

  it('routes create flow for non-task calendars, blocked task views, and allowed task views', () => {
    const standardContext = {
      isTaskCalendarSelection: false,
      showCreateModal: false
    };

    TeamCalendarBoard.prototype.openCreateFlow.call(standardContext);
    expect(standardContext.showCreateModal).toBe(true);

    const blockedTaskContext = {
      isTaskCalendarSelection: true,
      selectedCalendarDefinition: { canCreate: false },
      showToast: jest.fn()
    };

    TeamCalendarBoard.prototype.openCreateFlow.call(blockedTaskContext);
    expect(blockedTaskContext.showToast).toHaveBeenCalledWith(
      'Task Access Required',
      'Calendar Security Manager does not allow you to create Task records for this calendar view.',
      'error'
    );

    const allowedTaskContext = {
      isTaskCalendarSelection: true,
      selectedCalendarDefinition: { canCreate: true },
      navigateToTaskCreate: jest.fn()
    };

    TeamCalendarBoard.prototype.openCreateFlow.call(allowedTaskContext);
    expect(allowedTaskContext.navigateToTaskCreate).toHaveBeenCalledTimes(1);
  });

  it('encodes default task fields for Task creation and normalizes default task dates', () => {
    const context = {
      defaultStart: '2026-04-23T10:15:00.000Z',
      selectedCalendarDefinition: {
        assignedUserId: '005000000000009AAA'
      },
      resolveDefaultTaskDate: TeamCalendarBoard.prototype.resolveDefaultTaskDate,
      Navigate: mockNavigate
    };

    TeamCalendarBoard.prototype.navigateToTaskCreate.call(context);

    expect(encodeDefaultFieldValues).toHaveBeenCalledWith({
      ActivityDate: '2026-04-23',
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
          ActivityDate: '2026-04-23',
          OwnerId: '005000000000009AAA'
        })
      }
    });
    expect(TeamCalendarBoard.prototype.resolveDefaultTaskDate.call({ defaultStart: '2026-04-21' })).toBe(
      '2026-04-21'
    );
    expect(
      TeamCalendarBoard.prototype.resolveDefaultTaskDate.call({ defaultStart: 'not-a-date' })
    ).toBeNull();
  });

  it('updates quick-create state and routes more-details into the full create flow', () => {
    const context = {
      _quickCreate: {
        dateKey: '2026-04-21',
        title: '',
        calendarId: 'a1x000000000001AAA',
        isSaving: false
      },
      openCreateFlow: jest.fn()
    };

    TeamCalendarBoard.prototype.handleQuickCreateTitleChange.call(context, {
      target: { value: 'Launch Plan' }
    });
    TeamCalendarBoard.prototype.handleQuickCreateCalendarChange.call(context, {
      detail: { value: 'a1x000000000002AAA' }
    });

    expect(context._quickCreate.title).toBe('Launch Plan');
    expect(context._quickCreate.calendarId).toBe('a1x000000000002AAA');

    TeamCalendarBoard.prototype.handleQuickCreateMoreDetails.call(context);
    expect(context._quickCreate).toBeNull();
    expect(context.defaultStart).toBe('2026-04-21');
    expect(context.defaultEnd).toBe('2026-04-21');
    expect(context.openCreateFlow).toHaveBeenCalledTimes(1);

    context._quickCreate = {
      dateKey: '2026-04-22',
      title: 'Another',
      calendarId: 'a1x000000000001AAA',
      isSaving: false
    };
    TeamCalendarBoard.prototype.handleQuickCreateClose.call(context);
    expect(context._quickCreate).toBeNull();
  });

  it('validates quick-create titles before saving', async () => {
    const context = {
      _quickCreate: {
        dateKey: '2026-04-21',
        title: '   ',
        calendarId: 'a1x000000000001AAA',
        isSaving: false
      },
      selectedCalendarId: 'a1x000000000001AAA',
      showToast: jest.fn()
    };

    await TeamCalendarBoard.prototype.handleQuickCreateSave.call(context);

    expect(createCalendarEventSeries).not.toHaveBeenCalled();
    expect(context.showToast).toHaveBeenCalledWith(
      'Title required',
      'Please enter an event title before saving.',
      'warning'
    );
  });

  it('saves quick-create events and refreshes the board state', async () => {
    const context = {
      _quickCreate: {
        dateKey: '2026-04-21',
        title: 'Launch Plan',
        calendarId: 'a1x000000000001AAA',
        isSaving: false
      },
      selectedCalendarId: '',
      _announce: jest.fn(),
      _invalidateCache: jest.fn(),
      loadEvents: jest.fn(() => Promise.resolve()),
      showToast: jest.fn()
    };

    await TeamCalendarBoard.prototype.handleQuickCreateSave.call(context);

    expect(createCalendarEventSeries).toHaveBeenCalledTimes(1);
    expect(JSON.parse(createCalendarEventSeries.mock.calls[0][0].requestJson)).toEqual({
      primaryEvent: {
        name: 'Launch Plan',
        calendarId: 'a1x000000000001AAA',
        startValue: '2026-04-21',
        endValue: '2026-04-21',
        allDay: true,
        status: 'Planned'
      },
      followUpEvents: []
    });
    expect(context._quickCreate).toBeNull();
    expect(context._invalidateCache).toHaveBeenCalledTimes(1);
    expect(context.loadEvents).toHaveBeenCalledTimes(1);
    expect(context._announce).toHaveBeenCalledWith('Event "Launch Plan" created.');
  });

  it('surfaces quick-create save failures and keeps the draft open', async () => {
    createCalendarEventSeries.mockRejectedValueOnce(new Error('Create failed.'));

    const context = {
      _quickCreate: {
        dateKey: '2026-04-21',
        title: 'Launch Plan',
        calendarId: 'a1x000000000001AAA',
        isSaving: false
      },
      selectedCalendarId: '',
      showToast: jest.fn()
    };

    await TeamCalendarBoard.prototype.handleQuickCreateSave.call(context);

    expect(context._quickCreate.isSaving).toBe(false);
    expect(context.showToast).toHaveBeenCalledWith(
      'Could not save event',
      'Create failed.',
      'error'
    );
  });

  it('builds hover previews and routes event context-menu requests from event details', () => {
    const source = {
      recordId: 'evt-1',
      recordName: 'Board Review',
      recordObjectApiName: 'Calendar_Event__c',
      recordContextId: 'a1x000000000001AAA',
      canDelete: true,
      canContextMenu: true
    };
    const context = {
      buildContextMenuSourceFromDetail: jest.fn((detail) => (detail.recordId ? source : null)),
      findEventRecord: jest.fn(() => ({
        id: 'evt-1',
        name: 'Board Review',
        start: '2026-04-21T10:00:00.000Z',
        endDateTime: '2026-04-21T11:00:00.000Z',
        calendarName: 'Sales',
        status: 'Confirmed'
      })),
      openQuickActionMenu: jest.fn(),
      closeEventContextMenu: jest.fn()
    };

    TeamCalendarBoard.prototype.handleEventHover.call(context, {
      detail: {
        recordId: 'evt-1',
        recordName: 'Board Review',
        clientX: 120,
        clientY: 180,
        canContextMenu: true
      }
    });

    expect(context.hoveredQuickActionRecord).toEqual(source);
    expect(context.hoveredEventPreview.title).toBe('Board Review');

    TeamCalendarBoard.prototype.handleEventUnhover.call(context);
    expect(context.hoveredQuickActionRecord).toBeNull();
    expect(context.hoveredEventPreview).toBeNull();

    TeamCalendarBoard.prototype.handleEventContextMenu.call(context, {
      detail: {}
    });
    expect(context.closeEventContextMenu).toHaveBeenCalledTimes(1);

    TeamCalendarBoard.prototype.handleEventContextMenu.call(context, {
      detail: {
        recordId: 'evt-1',
        clientX: 200,
        clientY: 220
      }
    });
    expect(context.openQuickActionMenu).toHaveBeenCalledTimes(1);
  });

  it('opens quick action menus and board context menus from resolved sources', () => {
    const source = {
      recordId: 'evt-1',
      recordName: 'Board Review',
      recordObjectApiName: 'Calendar_Event__c',
      recordContextId: 'a1x000000000001AAA',
      canDelete: true,
      canContextMenu: true
    };
    const quickMenuContext = {
      hoveredEventPreview: { title: 'Board Review' },
      findEventRecord: jest.fn(() => ({
        id: 'evt-1',
        name: 'Board Review',
        start: '2026-04-21T10:00:00.000Z',
        endDateTime: '2026-04-21T11:00:00.000Z'
      })),
      closeEventContextMenu: jest.fn()
    };

    TeamCalendarBoard.prototype.openQuickActionMenu.call(quickMenuContext, source, {
      clientX: 150,
      clientY: 170,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      stopImmediatePropagation: jest.fn()
    });

    expect(quickMenuContext.hoveredEventPreview).toBeNull();
    expect(quickMenuContext.activeEventMenu.recordId).toBe('evt-1');
    expect(
      quickMenuContext.activeEventMenu.items.map((item) => item.actionType)
    ).toEqual(expect.arrayContaining(['export-csv', 'export-ical', 'delete']));

    const boardContext = {
      activeEventMenu: null,
      resolveNativeContextMenuSource: jest.fn(() => source)
    };
    const boardEvent = {
      clientX: 200,
      clientY: 220,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    TeamCalendarBoard.prototype.handleBoardContextMenu.call(boardContext, boardEvent);

    expect(boardContext.activeEventMenu).toMatchObject({
      recordId: 'evt-1',
      recordName: 'Board Review',
      recordObjectApiName: 'Calendar_Event__c',
      recordContextId: 'a1x000000000001AAA'
    });
    expect(boardContext.activeEventMenu.style).toContain('left:');
  });

  it('builds move mutations and extracts error messages consistently', () => {
    const baseContext = {
      buildCalendarEventPayloadFromRecord: TeamCalendarBoard.prototype.buildCalendarEventPayloadFromRecord
    };
    const eventRecord = {
      id: 'a1B000000000001AAA',
      name: 'Board Review',
      calendarId: 'a1x000000000001AAA',
      start: '2026-04-21T10:00:00.000Z',
      endDateTime: '2026-04-21T11:00:00.000Z',
      allDay: false,
      status: 'Confirmed',
      notes: 'Review'
    };

    const mutation = TeamCalendarBoard.prototype.buildMoveMutation.call(
      baseContext,
      eventRecord,
      {
        recordId: 'a1B000000000001AAA',
        calendarId: 'a1x000000000001AAA',
        name: 'Board Review',
        startValue: '2026-04-22T10:00:00.000Z',
        endValue: '2026-04-22T11:00:00.000Z',
        allDay: false,
        status: 'Confirmed',
        notes: 'Review'
      },
      '2026-04-22'
    );

    expect(mutation).toMatchObject({
      mutationType: 'calendar-update',
      recordId: 'a1B000000000001AAA',
      recordName: 'Board Review'
    });
    expect(mutation.message).toContain('Board Review was moved');
    expect(
      TeamCalendarBoard.prototype.buildMoveMutation.call(
        baseContext,
        { ...eventRecord, isRecurring: true },
        {},
        '2026-04-22'
      )
    ).toBeNull();

    expect(TeamCalendarBoard.prototype.extractErrorMessage.call({}, null)).toBe('Unknown error');
    expect(TeamCalendarBoard.prototype.extractErrorMessage.call({}, 'Plain string')).toBe('Plain string');
    expect(
      TeamCalendarBoard.prototype.extractErrorMessage.call({}, { body: { message: 'Body message' } })
    ).toBe('Body message');
    expect(
      TeamCalendarBoard.prototype.extractErrorMessage.call({}, {
        body: [{ message: 'One' }, { message: 'Two' }]
      })
    ).toBe('One, Two');
    expect(
      TeamCalendarBoard.prototype.extractErrorMessage.call({}, { detail: { message: 'Detail message' } })
    ).toBe('Detail message');
    expect(TeamCalendarBoard.prototype.extractErrorMessage.call({}, { message: 'Top level' })).toBe(
      'Top level'
    );
  });

  it('serializes selected user calendar labels and builds extra calendar-view loader definitions', () => {
    const context = {
      selectedUserIds: ['u1', 'u2'],
      selectedCalendarsByUser: {
        u1: ['c1'],
        u2: []
      },
      userCalendarsByUser: {
        u1: [
          {
            id: 'c1',
            label: 'Revenue View',
            baseColor: '#0176d3',
            color: '#0176d3',
            sourceScope: 'User',
            canCreate: true,
            canEdit: true,
            sobjectType: 'Task',
            startField: 'ActivityDate',
            displayField: 'Subject',
            listViewFilterId: '00B1',
            listViewApiName: 'RevenueTasks',
            listViewObjectApiName: 'Task'
          }
        ],
        u2: [
          {
            id: 'c2',
            label: 'Unit View',
            baseColor: '#2e844a',
            color: '#2e844a',
            sourceScope: 'User',
            canCreate: false,
            canEdit: false,
            sobjectType: 'Marine__Boat__c',
            startField: 'Available_Date__c',
            displayField: 'Name',
            listViewFilterId: '00B2',
            listViewApiName: 'AvailableInventory',
            listViewObjectApiName: 'Marine__Boat__c'
          }
        ]
      },
      isCalendarViewBackedSelection: true,
      selectedCalendarDefinition: {
        id: 'c0',
        name: 'Primary View',
        sobjectType: 'Marine__Boat__c',
        startField: 'Available_Date__c',
        listViewFilterId: '00B0',
        listViewApiName: 'PrimaryInventory',
        listViewObjectApiName: 'Marine__Boat__c'
      },
      normalizeCalendarDefinition: TeamCalendarBoard.prototype.normalizeCalendarDefinition,
      normalizeCalendarColor: TeamCalendarBoard.prototype.normalizeCalendarColor,
      resolveCalendarDisplayColor: TeamCalendarBoard.prototype.resolveCalendarDisplayColor,
      isCalendarViewDefinition: TeamCalendarBoard.prototype.isCalendarViewDefinition,
      isTaskCalendarDefinition: TeamCalendarBoard.prototype.isTaskCalendarDefinition,
      userLayoutPreference: {}
    };

    const selectionJson = readGetter(TeamCalendarBoard.prototype, 'userCalendarSelectionJson', context);
    const definitions = TeamCalendarBoard.prototype.buildCalendarViewDefinitionsToLoad.call(context);
    context.buildCalendarViewDefinitionsToLoad = TeamCalendarBoard.prototype.buildCalendarViewDefinitionsToLoad;

    expect(selectionJson).toBe(JSON.stringify({
      u1: ['Revenue View'],
      u2: []
    }));
    expect(definitions.map((definition) => definition.id)).toEqual(['c0', 'c1', 'c2']);

    const loaderDefinitions = readGetter(TeamCalendarBoard.prototype, 'calendarViewLoaderDefinitions', context);
    expect(loaderDefinitions).toEqual([
      expect.objectContaining({
        id: 'c2',
        optionalFieldsCsv: expect.any(String)
      })
    ]);
  });

  it('prunes user calendar state, selected calendars, and loader payloads to valid entries', () => {
    const context = {
      selectedUserIds: ['u1'],
      userCalendarsByUser: {
        u1: [{ id: 'c1' }],
        u2: [{ id: 'c2' }]
      },
      selectedCalendarsByUser: {
        u1: ['c1', 'cX'],
        u2: ['c2']
      },
      activeUserCalendarUserId: 'u2',
      calendarViewPayloadsById: {
        c1: { rows: [] },
        c2: { rows: [] }
      },
      calendarViewErrorsById: {
        c1: 'warn',
        c2: 'error'
      }
    };

    TeamCalendarBoard.prototype.pruneUserCalendarState.call(context);
    TeamCalendarBoard.prototype.pruneSelectedCalendarsToLoadedCalendars.call(context);
    TeamCalendarBoard.prototype.pruneCalendarViewLoaderState.call(context, [{ id: 'c1' }]);

    expect(context.userCalendarsByUser).toEqual({ u1: [{ id: 'c1' }] });
    expect(context.selectedCalendarsByUser).toEqual({ u1: ['c1'] });
    expect(context.activeUserCalendarUserId).toBeNull();
    expect(context.calendarViewPayloadsById).toEqual({ c1: { rows: [] } });
    expect(context.calendarViewErrorsById).toEqual({ c1: 'warn' });
  });

  it('records and clears calendar-view load errors without repeating the same toast', () => {
    const context = {
      calendarViewErrorsById: {},
      extractErrorMessage: TeamCalendarBoard.prototype.extractErrorMessage,
      showToast: jest.fn()
    };

    TeamCalendarBoard.prototype.recordCalendarViewLoadError.call(
      context,
      { id: 'c1', name: 'Revenue View' },
      { body: { message: 'List view unavailable.' } }
    );
    TeamCalendarBoard.prototype.recordCalendarViewLoadError.call(
      context,
      { id: 'c1', name: 'Revenue View' },
      { body: { message: 'List view unavailable.' } }
    );

    expect(context.calendarViewErrorsById).toEqual({ c1: 'List view unavailable.' });
    expect(context.showToast).toHaveBeenCalledTimes(1);

    TeamCalendarBoard.prototype.clearCalendarViewLoadError.call(context, 'c1');
    expect(context.calendarViewErrorsById).toEqual({});
  });

  it('routes wire payloads and errors for calendar-view-backed selections', () => {
    const context = {
      isCalendarViewBackedSelection: true,
      selectedCalendarDefinition: { id: 'c1', name: 'Revenue View' },
      loadEvents: jest.fn(),
      recordCalendarViewLoadError: jest.fn(),
      clearCalendarViewLoadError: jest.fn()
    };

    TeamCalendarBoard.prototype.wiredCalendarViewRecords.call(context, {
      error: { body: { message: 'Wire failed.' } }
    });
    TeamCalendarBoard.prototype.wiredCalendarViewRecords.call(context, {
      data: { records: [] }
    });

    expect(context.recordCalendarViewLoadError).toHaveBeenCalledTimes(1);
    expect(context.clearCalendarViewLoadError).toHaveBeenCalledWith('c1');
    expect(context.loadEvents).toHaveBeenCalledTimes(2);
  });

  it('loads calendars and active users through the Apex wrappers and prunes invalid user ids', async () => {
    getCalendars.mockResolvedValueOnce([
      {
        id: 'a1x000000000001AAA',
        name: 'Sales',
        color: '0176d3',
        isDisplayed: true
      }
    ]);
    const context = {
      calendarDefinitions: [],
      calendarOptions: [],
      userLayoutPreference: { defaultView: 'month' },
      selectedUserIds: ['u1', 'ghost'],
      maxSelectedUsers: 3,
      normalizeCalendarDefinition: TeamCalendarBoard.prototype.normalizeCalendarDefinition,
      normalizeCalendarColor: TeamCalendarBoard.prototype.normalizeCalendarColor,
      resolveCalendarDisplayColor: TeamCalendarBoard.prototype.resolveCalendarDisplayColor,
      applyUserLayoutPreference: jest.fn(),
      userLayoutPreference: { defaultView: 'month' },
      showToast: jest.fn(),
      extractErrorMessage: TeamCalendarBoard.prototype.extractErrorMessage,
      pruneUserCalendarState: jest.fn(),
      userLayoutPreference: {}
    };

    await TeamCalendarBoard.prototype.loadCalendars.call(context);

    expect(context.calendarDefinitions).toHaveLength(1);
    expect(context.calendarOptions).toEqual([
      { label: 'All Calendars', value: '' },
      { label: 'Sales', value: 'a1x000000000001AAA' }
    ]);
    expect(context.applyUserLayoutPreference).toHaveBeenCalledTimes(1);

    getActiveUsers.mockResolvedValueOnce([
      { id: 'u1', label: 'Alex' },
      { id: 'u2', label: 'Jamie' }
    ]);

    await TeamCalendarBoard.prototype.loadActiveUsers.call(context);

    expect(context.activeUserOptions).toEqual([
      { id: 'u1', label: 'Alex' },
      { id: 'u2', label: 'Jamie' }
    ]);
    expect(context.selectedUserIds).toEqual(['u1']);
    expect(context.pruneUserCalendarState).toHaveBeenCalledTimes(1);
  });

  it('loads and groups selected user calendars through the Apex wrapper', async () => {
    getUserCalendars.mockResolvedValueOnce([
      {
        id: 'c1',
        name: 'Revenue',
        color: '#0176d3',
        assignedUserId: 'u1',
        sourceScope: 'User',
        canCreate: true,
        canEdit: true,
        sobjectType: 'Task',
        startField: 'ActivityDate',
        displayField: 'Subject',
        listViewFilterId: '00B1',
        listViewApiName: 'RevenueTasks',
        listViewObjectApiName: 'Task'
      }
    ]);

    const context = {
      selectedUserIds: ['u1'],
      normalizeCalendarDefinition: TeamCalendarBoard.prototype.normalizeCalendarDefinition,
      normalizeCalendarColor: TeamCalendarBoard.prototype.normalizeCalendarColor,
      resolveCalendarDisplayColor: TeamCalendarBoard.prototype.resolveCalendarDisplayColor,
      selectedCalendarsByUser: { u1: ['c1', 'ghost'] },
      calendarViewPayloadsById: {},
      calendarViewErrorsById: {},
      pruneSelectedCalendarsToLoadedCalendars: TeamCalendarBoard.prototype.pruneSelectedCalendarsToLoadedCalendars,
      pruneCalendarViewLoaderState: jest.fn(),
      extractErrorMessage: TeamCalendarBoard.prototype.extractErrorMessage,
      showToast: jest.fn(),
      userLayoutPreference: {}
    };

    await TeamCalendarBoard.prototype.loadUserCalendars.call(context);

    expect(context.userCalendarsByUser).toEqual({
      u1: [
        expect.objectContaining({
          id: 'c1',
          label: 'Revenue'
        })
      ]
    });
    expect(context.selectedCalendarsByUser).toEqual({ u1: ['c1'] });
    expect(context.pruneCalendarViewLoaderState).toHaveBeenCalledTimes(1);
  });

  it('wraps user selection and user calendar handlers around loadEvents and loadUserCalendars', async () => {
    const selectionContext = {
      maxSelectedUsers: 2,
      loadEvents: jest.fn(() => Promise.resolve()),
      pruneUserCalendarState: jest.fn(),
      loadUserCalendars: jest.fn(() => Promise.resolve())
    };

    await TeamCalendarBoard.prototype.handleUserSelectionChange.call(selectionContext, {
      detail: { selectedUserIds: ['u1', 'u2', 'u3'] }
    });

    expect(selectionContext.selectedUserIds).toEqual(['u1', 'u2']);
    expect(selectionContext.pruneUserCalendarState).toHaveBeenCalledTimes(1);
    expect(selectionContext.loadUserCalendars).toHaveBeenCalledTimes(1);
    expect(selectionContext.loadEvents).toHaveBeenCalledTimes(1);

    const emptySelectionContext = {
      maxSelectedUsers: 2,
      loadEvents: jest.fn(() => Promise.resolve())
    };
    await TeamCalendarBoard.prototype.handleUserSelectionChange.call(emptySelectionContext, {
      detail: { selectedUserIds: [] }
    });
    expect(emptySelectionContext.userCalendarsByUser).toEqual({});
    expect(emptySelectionContext.selectedCalendarsByUser).toEqual({});
    expect(emptySelectionContext.activeUserCalendarUserId).toBeNull();

    const openContext = {
      activeUserCalendarUserId: null,
      userCalendarsByUser: {},
      loadUserCalendars: jest.fn(() => Promise.resolve())
    };
    await TeamCalendarBoard.prototype.handleUserCalendarOpen.call(openContext, {
      detail: { userId: 'u1' }
    });
    expect(openContext.activeUserCalendarUserId).toBe('u1');
    expect(openContext.loadUserCalendars).toHaveBeenCalledTimes(1);

    await TeamCalendarBoard.prototype.handleUserCalendarOpen.call(openContext, {
      detail: { userId: 'u1' }
    });
    expect(openContext.activeUserCalendarUserId).toBeNull();

    const calendarSelectionContext = {
      selectedCalendarsByUser: {},
      loadEvents: jest.fn(() => Promise.resolve())
    };
    await TeamCalendarBoard.prototype.handleUserCalendarSelectionChange.call(calendarSelectionContext, {
      detail: { userId: 'u1', selectedCalendarIds: ['c1'] }
    });
    expect(calendarSelectionContext.selectedCalendarsByUser).toEqual({ u1: ['c1'] });
    expect(calendarSelectionContext.loadEvents).toHaveBeenCalledTimes(1);
  });

  it('handles close-drawer reload behavior, refresh fan-out, resize changes, and touch navigation', async () => {
    const closeContext = {
      _skipNextDrawerReload: true,
      showDrawer: true,
      selectedRecordId: 'a1B',
      loadEvents: jest.fn(() => Promise.resolve())
    };
    await TeamCalendarBoard.prototype.handleCloseDrawer.call(closeContext);
    expect(closeContext.showDrawer).toBe(false);
    expect(closeContext.selectedRecordId).toBeNull();
    expect(closeContext.loadEvents).not.toHaveBeenCalled();

    closeContext._skipNextDrawerReload = false;
    closeContext.showDrawer = true;
    closeContext.selectedRecordId = 'a1B';
    await TeamCalendarBoard.prototype.handleCloseDrawer.call(closeContext);
    expect(closeContext.loadEvents).toHaveBeenCalledTimes(1);

    const refreshContext = {
      loadCurrentUserLayoutPreference: jest.fn(() => Promise.resolve()),
      loadActiveUsers: jest.fn(() => Promise.resolve()),
      loadUserCalendars: jest.fn(() => Promise.resolve()),
      loadEvents: jest.fn(() => Promise.resolve()),
      loadGoogleConnectionState: jest.fn(() => Promise.resolve())
    };
    await TeamCalendarBoard.prototype.handleRefresh.call(refreshContext);
    expect(refreshContext.loadCurrentUserLayoutPreference).toHaveBeenCalledTimes(1);
    expect(refreshContext.loadActiveUsers).toHaveBeenCalledTimes(1);
    expect(refreshContext.loadUserCalendars).toHaveBeenCalledTimes(1);
    expect(refreshContext.loadEvents).toHaveBeenCalledTimes(1);
    expect(refreshContext.loadGoogleConnectionState).toHaveBeenCalledTimes(1);

    const previousInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 600
    });
    const resizeContext = {
      _isMobile: false,
      rebuildViewModels: jest.fn()
    };
    TeamCalendarBoard.prototype._handleResize.call(resizeContext);
    expect(resizeContext._isMobile).toBe(true);
    expect(resizeContext.rebuildViewModels).toHaveBeenCalledTimes(1);

    const touchContext = {
      handleNext: jest.fn(),
      handlePrev: jest.fn()
    };
    TeamCalendarBoard.prototype.handleTouchStart.call(touchContext, {
      touches: [{ clientX: 100, clientY: 20 }]
    });
    TeamCalendarBoard.prototype.handleTouchEnd.call(touchContext, {
      changedTouches: [{ clientX: 20, clientY: 22 }]
    });
    TeamCalendarBoard.prototype.handleTouchStart.call(touchContext, {
      touches: [{ clientX: 20, clientY: 20 }]
    });
    TeamCalendarBoard.prototype.handleTouchEnd.call(touchContext, {
      changedTouches: [{ clientX: 100, clientY: 22 }]
    });

    expect(touchContext.handleNext).toHaveBeenCalledTimes(1);
    expect(touchContext.handlePrev).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: previousInnerWidth
    });
  });

  it('handles create success/error toasts and drawer mutation reloads', async () => {
    const dispatchEvent = jest.fn();
    const createContext = {
      dispatchEvent,
      closeEventContextMenu: jest.fn(),
      _announce: jest.fn(),
      _invalidateCache: jest.fn(),
      loadEvents: jest.fn(() => Promise.resolve()),
      extractErrorMessage: TeamCalendarBoard.prototype.extractErrorMessage
    };

    await TeamCalendarBoard.prototype.handleCreateSuccess.call(createContext, {
      detail: {
        followUpCreatedCount: 2,
        followUpFailedCount: 1
      }
    });
    expect(dispatchEvent.mock.calls[0][0].type).toBe('lightning__showtoast');
    expect(createContext._announce).toHaveBeenCalledWith(
      'Calendar event saved with 2 follow-up events created. 1 follow-up event could not be created.'
    );

    TeamCalendarBoard.prototype.handleCreateError.call(createContext, {
      detail: { body: { message: 'Bad create request.' } }
    });
    expect(dispatchEvent.mock.calls[1][0].type).toBe('lightning__showtoast');

    const mutationContext = {
      _invalidateCache: jest.fn(),
      loadEvents: jest.fn(() => Promise.resolve()),
      _announce: jest.fn(),
      activeEventMenu: { recordId: 'a1B' },
      _mutationHistory: [],
      _redoMutationHistory: [],
      _mutationSequence: 0,
      activeMutationNotice: null
    };
    await TeamCalendarBoard.prototype.handleDrawerMutation.call(mutationContext, { detail: null });
    expect(mutationContext.loadEvents).not.toHaveBeenCalled();

    await TeamCalendarBoard.prototype.handleDrawerMutation.call(mutationContext, {
      detail: {
        mutationType: 'calendar-update',
        recordId: 'a1B',
        recordName: 'Board Review',
        previousPayload: {},
        nextPayload: {},
        message: 'Board Review was updated.',
        undoMessage: 'Undid Board Review.',
        redoMessage: 'Reapplied Board Review.'
      }
    });
    expect(mutationContext._skipNextDrawerReload).toBe(true);
    expect(mutationContext._invalidateCache).toHaveBeenCalledTimes(1);
    expect(mutationContext.loadEvents).toHaveBeenCalledTimes(1);
    expect(mutationContext._announce).toHaveBeenCalledWith('Board Review was updated.');
  });

});