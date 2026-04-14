const { createElement } = require('lwc');

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
jest.mock('@salesforce/user/Id', () => ({ default: '005000000000001AAA' }), {
  virtual: true
});

const TeamCalendarBoard = require('c/teamCalendarBoard').default;

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('c-team-calendar-board', () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it('mounts without throwing', async () => {
    const element = createElement('c-team-calendar-board', {
      is: TeamCalendarBoard
    });
    document.body.appendChild(element);
    await flushPromises();

    expect(element).not.toBeNull();
  });
});