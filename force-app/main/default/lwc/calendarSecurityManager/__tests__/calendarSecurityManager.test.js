const { createElement } = require('lwc');

jest.mock(
  '@salesforce/apex/TeamCalendarSecurityController.canCurrentUserManageSecurity',
  () => ({ default: jest.fn(() => Promise.resolve(true)) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarSecurityController.getSecurityUsers',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarSecurityController.getCalendarViewsForSecurity',
  () => ({ default: jest.fn(() => Promise.resolve([])) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarSecurityController.getUserCalendarAccess',
  () => ({ default: jest.fn(() => Promise.resolve({ userId: '005A', userName: 'Afton Everett', rules: [] })) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarSecurityController.saveUserCalendarAccess',
  () => ({ default: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarSecurityController.getUserLayoutPreference',
  () => ({ default: jest.fn(() => Promise.resolve({ defaultView: 'month' })) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarSecurityController.saveUserLayoutPreference',
  () => ({ default: jest.fn(() => Promise.resolve({ defaultView: 'month' })) }),
  { virtual: true }
);
jest.mock(
  '@salesforce/apex/TeamCalendarSecurityController.setLayoutFieldForAllUsers',
  () => ({ default: jest.fn(() => Promise.resolve(0)) }),
  { virtual: true }
);

const CalendarSecurityManager = require('c/calendarSecurityManager').default;
const getSecurityUsers = require('@salesforce/apex/TeamCalendarSecurityController.getSecurityUsers').default;
const getCalendarViewsForSecurity = require('@salesforce/apex/TeamCalendarSecurityController.getCalendarViewsForSecurity').default;
const getUserCalendarAccess = require('@salesforce/apex/TeamCalendarSecurityController.getUserCalendarAccess').default;
const saveUserCalendarAccess = require('@salesforce/apex/TeamCalendarSecurityController.saveUserCalendarAccess').default;
const saveUserLayoutPreference = require('@salesforce/apex/TeamCalendarSecurityController.saveUserLayoutPreference').default;

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

async function openSecurityModal(element) {
  element.shadowRoot.querySelector('.security-gear').click();
  await flushPromises();
}

async function openLayoutTab(element) {
  const tabs = element.shadowRoot.querySelectorAll('.security-tabs__button');
  tabs[1].click();
  await flushPromises();
}

const mockUsers = [
  {
    id: '005A',
    name: 'Afton Everett',
    username: 'afton@example.com',
    profileName: 'User',
    roleName: 'Sales'
  },
  {
    id: '005B',
    name: 'Albert Hylton',
    username: 'albert@example.com',
    profileName: 'User',
    roleName: 'Sales'
  },
  {
    id: '005C',
    name: 'Miles May',
    username: 'miles@example.com',
    profileName: 'Admin',
    roleName: 'Management'
  }
];

const mockCalendarViews = [
  {
    id: '00U1',
    name: 'Albert Open Tasks',
    ownerId: '005O1',
    ownerName: 'Albert Hylton',
    startField: 'ActivityDate',
    displayField: 'Subject'
  },
  {
    id: '00U2',
    name: 'Albert Completed Tasks',
    ownerId: '005O1',
    ownerName: 'Albert Hylton',
    startField: 'ActivityDate',
    displayField: 'Subject'
  },
  {
    id: '00U3',
    name: 'Miles Follow Ups',
    ownerId: '005O2',
    ownerName: 'Miles May',
    startField: 'ActivityDate',
    displayField: 'Subject'
  }
];

const mockAccessResponse = {
  userId: '005A',
  userName: 'Afton Everett',
  rules: [
    {
      calendarViewId: '00U1',
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canAssignUsers: false,
      canManageSecurity: false,
      isActive: true
    },
    {
      calendarViewId: '00U3',
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canAssignUsers: false,
      canManageSecurity: false,
      isActive: true
    }
  ]
};

function setupMocks() {
  getSecurityUsers.mockResolvedValue(mockUsers);
  getCalendarViewsForSecurity.mockResolvedValue(mockCalendarViews);
  getUserCalendarAccess.mockResolvedValue(mockAccessResponse);
}

describe('c-calendar-security-manager', () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it('groups visible rows by owner in the access table', async () => {
    setupMocks();

    const element = createElement('c-calendar-security-manager', {
      is: CalendarSecurityManager
    });
    document.body.appendChild(element);
    await flushPromises();

    await openSecurityModal(element);

    const groupTitles = Array.from(
      element.shadowRoot.querySelectorAll('.security-table__group-title')
    ).map((node) => node.textContent.trim());

    expect(groupTitles).toEqual(['Albert Hylton', 'Miles May']);
  });

  it('filters rows by owner and applies bulk editor preset only to filtered rows', async () => {
    setupMocks();

    const element = createElement('c-calendar-security-manager', {
      is: CalendarSecurityManager
    });
    document.body.appendChild(element);
    await flushPromises();

    await openSecurityModal(element);

    const ownerCombobox = element.shadowRoot.querySelector('lightning-combobox');
    ownerCombobox.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: '005O1' }
      })
    );
    await flushPromises();

    const bulkButtons = element.shadowRoot.querySelectorAll('.security-bulk-button');
    bulkButtons[1].click();
    await flushPromises();

    let summaries = Array.from(
      element.shadowRoot.querySelectorAll('.security-row-preset__summary')
    ).map((node) => node.textContent.trim());

    expect(summaries).toEqual(['Editor', 'Editor']);

    ownerCombobox.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: '' }
      })
    );
    await flushPromises();

    summaries = Array.from(
      element.shadowRoot.querySelectorAll('.security-row-preset__summary')
    ).map((node) => node.textContent.trim());

    expect(summaries).toEqual(['Editor', 'Editor', 'View Only']);
  });

  it('applies a row preset without affecting other rows', async () => {
    setupMocks();

    const element = createElement('c-calendar-security-manager', {
      is: CalendarSecurityManager
    });
    document.body.appendChild(element);
    await flushPromises();

    await openSecurityModal(element);

    const editButtons = Array.from(
      element.shadowRoot.querySelectorAll('.security-row-preset__button[data-preset="editor"]')
    );

    editButtons[0].click();
    await flushPromises();

    const summaries = Array.from(
      element.shadowRoot.querySelectorAll('.security-row-preset__summary')
    ).map((node) => node.textContent.trim());

    expect(summaries).toEqual(['Editor', 'View Only', 'View Only']);
  });

  it('normalizes dependent access flags before saving access rules', async () => {
    const context = {
      selectedUserId: '005A',
      selectedUserName: 'Afton Everett',
      isSaving: false,
      isLayoutTabActive: false,
      allAccessRows: [
        {
          id: '00U1',
          name: 'Albert Open Tasks',
          ownerId: '005O1',
          ownerName: 'Albert Hylton',
          canView: false,
          canCreate: false,
          canEdit: true,
          canDelete: true,
          canAssignUsers: false,
          canManageSecurity: false,
          isActive: true,
          notes: ''
        }
      ],
      dispatchEvent: jest.fn(),
      loadUserAccess: jest.fn(() => Promise.resolve()),
      showError: jest.fn(),
      defaultAllowedSelectedUserIds: [],
      layoutDraft: {},
      enforceAccessibleDefaultCalendar: jest.fn(),
      enforceAllowedSelectedUsers: jest.fn(),
      cacheCurrentLayoutDraft: jest.fn()
    };

    await CalendarSecurityManager.prototype.handleSave.call(context);
    await flushPromises();

    const payload = JSON.parse(saveUserCalendarAccess.mock.calls[0][0].rulesJson);
    expect(payload[0].canView).toBe(true);
    expect(payload[0].canEdit).toBe(true);
    expect(payload[0].canDelete).toBe(true);
    expect(context.loadUserAccess).toHaveBeenCalledWith('005A');
  });

  it('editor preset clears stronger permissions on the target row', async () => {
    const result = CalendarSecurityManager.prototype.applyAccessPresetToRows.call(
      {
        allAccessRows: [
          {
            id: '00U1',
            name: 'Albert Open Tasks',
            ownerId: '005O1',
            ownerName: 'Albert Hylton',
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: true,
            canAssignUsers: true,
            canManageSecurity: true,
            isActive: true,
            notes: ''
          }
        ]
      },
      new Set(['00U1']),
      'editor'
    );

    expect(result[0].canView).toBe(true);
    expect(result[0].canCreate).toBe(true);
    expect(result[0].canEdit).toBe(true);
    expect(result[0].canDelete).toBe(false);
    expect(result[0].canAssignUsers).toBe(false);
    expect(result[0].canManageSecurity).toBe(false);
  });

  it('applies the focused layout preset and saves the resulting preference payload', async () => {
    setupMocks();
    saveUserLayoutPreference.mockResolvedValue({ defaultView: 'agenda' });

    const element = createElement('c-calendar-security-manager', {
      is: CalendarSecurityManager
    });
    document.body.appendChild(element);
    await flushPromises();

    await openSecurityModal(element);
    await openLayoutTab(element);

    element.shadowRoot
      .querySelector('.security-layout-preset-button[data-preset="focused"]')
      .click();
    await flushPromises();

    element.shadowRoot.querySelector('.slds-button_brand').click();
    await flushPromises();

    expect(saveUserLayoutPreference).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(saveUserLayoutPreference.mock.calls[0][0].preferenceJson);
    expect(payload.defaultView).toBe('agenda');
    expect(payload.showNewButton).toBe(false);
    expect(payload.showFiltersButton).toBe(false);
    expect(payload.showSelectUsersBox).toBe(false);
    expect(payload.showFilterControls).toBe(false);
    expect(payload.showWeekends).toBe(false);
    expect(payload.compactEventDensity).toBe(true);
  });

  it('bulk updates approved selected users from the current search and saves them', async () => {
    setupMocks();
    saveUserLayoutPreference.mockResolvedValue({ defaultView: 'month' });

    const element = createElement('c-calendar-security-manager', {
      is: CalendarSecurityManager
    });
    document.body.appendChild(element);
    await flushPromises();

    await openSecurityModal(element);
    await openLayoutTab(element);

    element.shadowRoot.querySelector('.security-approved-users__toggle').click();
    await flushPromises();

    element.shadowRoot
      .querySelector('.security-approved-users__action[data-action="none"]')
      .click();
    await flushPromises();

    const approvedSearch = element.shadowRoot.querySelector(
      '.security-approved-users__menu lightning-input'
    );
    approvedSearch.value = 'Albert';
    approvedSearch.dispatchEvent(new CustomEvent('change'));
    await flushPromises();

    element.shadowRoot
      .querySelector('.security-approved-users__action[data-action="matching"]')
      .click();
    await flushPromises();

    element.shadowRoot.querySelector('.slds-button_brand').click();
    await flushPromises();

    const payload = JSON.parse(saveUserLayoutPreference.mock.calls[0][0].preferenceJson);
    expect(payload.allowedSelectedUserIds).toEqual(['005B']);
  });

  it('applies board section presets and updates the live summary', async () => {
    setupMocks();

    const element = createElement('c-calendar-security-manager', {
      is: CalendarSecurityManager
    });
    document.body.appendChild(element);
    await flushPromises();

    await openSecurityModal(element);
    await openLayoutTab(element);

    element.shadowRoot
      .querySelector('.security-layout-section-button[data-section="board"][data-preset="minimal"]')
      .click();
    await flushPromises();

    const summaryLines = Array.from(
      element.shadowRoot.querySelectorAll('.security-layout-summary__line')
    ).map((node) => node.textContent.trim());

    expect(summaryLines.some((line) => line.includes('Selected Users hidden'))).toBe(true);
    expect(summaryLines.some((line) => line.includes('filters hidden'))).toBe(true);
    expect(summaryLines.some((line) => line.includes('compact density'))).toBe(true);
  });
});
