import { LightningElement, api } from 'lwc';

export default class CalendarCreateModal extends LightningElement {
    @api defaultCalendarId;
    @api defaultStart;
    @api defaultEnd;

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleSuccess(event) {
        this.dispatchEvent(new CustomEvent('success', { detail: event.detail }));
    }

    handleError(event) {
        this.dispatchEvent(new CustomEvent('error', { detail: event.detail }));
    }
}
