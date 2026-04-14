import { LightningElement, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class CalendarEventDrawer extends NavigationMixin(LightningElement) {
    @api recordId;

    isEditMode = false;

    get hasRecordId() {
        return Boolean(this.recordId);
    }

    get isViewMode() {
        return this.hasRecordId && !this.isEditMode;
    }

    handleClose() {
        this.isEditMode = false;
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleEdit() {
        this.isEditMode = true;
    }

    handleCancelEdit() {
        this.isEditMode = false;
    }

    handleSuccess() {
        this.isEditMode = false;

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Event Updated',
                message: 'Calendar event saved successfully.',
                variant: 'success'
            })
        );

        this.dispatchEvent(new CustomEvent('close'));
    }

    handleError(event) {
        const detail = event?.detail;
        const message =
            detail?.message ||
            detail?.detail ||
            'Unable to save this calendar event.';

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Save Error',
                message,
                variant: 'error'
            })
        );
    }

    handleOpenRecord() {
        if (!this.recordId) {
            return;
        }

        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.recordId,
                objectApiName: 'Calendar_Event__c',
                actionName: 'view'
            }
        });
    }
}