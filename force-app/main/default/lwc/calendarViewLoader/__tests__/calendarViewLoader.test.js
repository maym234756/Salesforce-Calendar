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

const { getListRecordsByName } = require('lightning/uiListsApi');
const CalendarViewLoader = require('c/calendarViewLoader').default;

const flushPromises = () => Promise.resolve();

describe('c-calendar-view-loader', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('normalizes comma separated optional fields', async () => {
        const element = createElement('c-calendar-view-loader', { is: CalendarViewLoader });
        element.definitionId = '00U000000000001AAA';
        element.definitionName = 'Open Tasks';
        element.objectApiName = 'Task';
        element.listViewApiName = 'OpenTasks';
        element.optionalFieldsCsv = ' Name , OwnerId , Account.Name ';
        document.body.appendChild(element);
        await flushPromises();

        expect(getListRecordsByName.getLastConfig()).toMatchObject({
            objectApiName: 'Task',
            listViewApiName: 'OpenTasks',
            optionalFields: ['Name', 'OwnerId', 'Account.Name']
        });

        element.optionalFieldsCsv = '';
        await flushPromises();
        expect(getListRecordsByName.getLastConfig()).toMatchObject({
            objectApiName: 'Task',
            listViewApiName: 'OpenTasks',
            optionalFields: []
        });
    });

    it('dispatches payloadload when list data is returned for a configured definition', async () => {
        const element = createElement('c-calendar-view-loader', { is: CalendarViewLoader });
        element.definitionId = '00U000000000001AAA';
        element.definitionName = 'Open Tasks';
        element.objectApiName = 'Task';
        element.listViewApiName = 'OpenTasks';
        const handler = jest.fn();
        element.addEventListener('payloadload', handler);
        document.body.appendChild(element);
        await flushPromises();

        const payload = { records: [{ id: '00T000000000001AAA' }] };
        getListRecordsByName.emit(payload);
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({
            definitionId: '00U000000000001AAA',
            payload
        });
    });

    it('dispatches payloaderror when the wire returns an error', async () => {
        const element = createElement('c-calendar-view-loader', { is: CalendarViewLoader });
        element.definitionId = '00U000000000001AAA';
        element.definitionName = 'Open Tasks';
        element.objectApiName = 'Task';
        element.listViewApiName = 'OpenTasks';
        const handler = jest.fn();
        element.addEventListener('payloaderror', handler);
        document.body.appendChild(element);
        await flushPromises();

        const error = { body: { message: 'Wire failed.' } };
        getListRecordsByName.error(error);
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.definition).toEqual({
            id: '00U000000000001AAA',
            name: 'Open Tasks'
        });
        expect(handler.mock.calls[0][0].detail.error.body.body.message).toBe('Wire failed.');
    });

    it('ignores wire emissions until the definition inputs are configured', async () => {
        const element = createElement('c-calendar-view-loader', { is: CalendarViewLoader });
        element.objectApiName = 'Task';
        element.listViewApiName = 'OpenTasks';
        const loadHandler = jest.fn();
        const errorHandler = jest.fn();
        element.addEventListener('payloadload', loadHandler);
        element.addEventListener('payloaderror', errorHandler);
        document.body.appendChild(element);
        await flushPromises();

        getListRecordsByName.emit({ records: [] });
        getListRecordsByName.error({ body: { message: 'No config yet.' } });
        await flushPromises();

        expect(loadHandler).not.toHaveBeenCalled();
        expect(errorHandler).not.toHaveBeenCalled();
    });
});