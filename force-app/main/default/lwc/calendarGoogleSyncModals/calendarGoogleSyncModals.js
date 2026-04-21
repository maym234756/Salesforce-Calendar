import { LightningElement, api } from 'lwc';

export default class CalendarGoogleSyncModals extends LightningElement {
    @api showConnectModal = false;
    @api showImportModal = false;
    @api showExportModal = false;
    @api googleSyncViewState = {};
    @api syncMessage = '';

    dispatchModalEvent(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail }));
    }

    handleGoogleConnectModalClose() {
        this.dispatchModalEvent('googleconnectmodalclose');
    }

    handleGoogleConnectModalLaunch() {
        this.dispatchModalEvent('googleconnectmodallaunch');
    }

    handleGoogleConnectModalRefresh() {
        this.dispatchModalEvent('googleconnectmodalrefresh');
    }

    handleGoogleImportModalClose() {
        this.dispatchModalEvent('googleimportmodalclose');
    }

    handleGoogleImportModalCalendarChange(event) {
        this.dispatchModalEvent('googleimportmodalcalendarchange', {
            value: event.target?.value || ''
        });
    }

    handleGoogleImportModalLaunch() {
        this.dispatchModalEvent('googleimportmodallaunch');
    }

    handleGoogleImportModalRefresh() {
        this.dispatchModalEvent('googleimportmodalrefresh');
    }

    handleGoogleImportModalContinue() {
        this.dispatchModalEvent('googleimportmodalcontinue');
    }

    handleGoogleImportCalendarSelectionChange(event) {
        this.dispatchModalEvent('googleimportcalendarselectionchange', {
            value: event.detail?.value || []
        });
    }

    handleGoogleExportModalClose() {
        this.dispatchModalEvent('googleexportmodalclose');
    }

    handleGoogleExportModalCalendarChange(event) {
        this.dispatchModalEvent('googleexportmodalcalendarchange', {
            value: event.target?.value || ''
        });
    }

    handleGoogleExportModalLaunch() {
        this.dispatchModalEvent('googleexportmodallaunch');
    }

    handleGoogleExportModalRefresh() {
        this.dispatchModalEvent('googleexportmodalrefresh');
    }

    handleGoogleExportModalContinue() {
        this.dispatchModalEvent('googleexportmodalcontinue');
    }

    handleGoogleExportCalendarSelectionChange(event) {
        this.dispatchModalEvent('googleexportcalendarselectionchange', {
            value: event.target?.value || ''
        });
    }
}