import { LightningElement, api } from 'lwc';

export default class RecordPicker extends LightningElement {
    @api label;
    @api placeholder;
    @api objectApiName;
    @api value;
    @api disabled;

    @api checkValidity() {
        return true;
    }

    @api reportValidity() {
        return true;
    }
}