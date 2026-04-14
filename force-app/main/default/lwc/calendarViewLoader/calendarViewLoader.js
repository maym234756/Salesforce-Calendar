import { LightningElement, api, wire } from 'lwc';
import { getListRecordsByName } from 'lightning/uiListsApi';

export default class CalendarViewLoader extends LightningElement {
    @api definitionId;
    @api definitionName;
    @api objectApiName;
    @api listViewApiName;

    _optionalFieldsCsv = '';
    _optionalFields = [];

    pageSize = 2000;

    @api
    get optionalFieldsCsv() {
        return this._optionalFieldsCsv;
    }

    set optionalFieldsCsv(value) {
        const nextValue = value || '';
        if (nextValue === this._optionalFieldsCsv) {
            return;
        }

        this._optionalFieldsCsv = nextValue;
        this._optionalFields = nextValue
            ? nextValue.split(',').map((fieldName) => fieldName.trim()).filter(Boolean)
            : [];
    }

    get normalizedOptionalFields() {
        return this._optionalFields;
    }

    @wire(getListRecordsByName, {
        objectApiName: '$objectApiName',
        listViewApiName: '$listViewApiName',
        optionalFields: '$normalizedOptionalFields',
        pageSize: '$pageSize'
    })
    wiredListRecords({ data, error }) {
        if (!this.definitionId || !this.objectApiName || !this.listViewApiName) {
            return;
        }

        if (data) {
            this.dispatchEvent(
                new CustomEvent('payloadload', {
                    detail: {
                        definitionId: this.definitionId,
                        payload: data
                    }
                })
            );
            return;
        }

        if (error) {
            this.dispatchEvent(
                new CustomEvent('payloaderror', {
                    detail: {
                        definition: {
                            id: this.definitionId,
                            name: this.definitionName
                        },
                        error
                    }
                })
            );
        }
    }
}