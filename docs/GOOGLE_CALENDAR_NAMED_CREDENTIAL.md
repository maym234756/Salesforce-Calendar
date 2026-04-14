# Configure Named Credential for Google Calendar Callouts

This document explains how to configure authentication so the Apex callouts in `GoogleCalendarSyncService` succeed.

Overview
- Apex uses a callout URL with the named credential prefix `callout:GoogleCalendar`.
- Configure an Auth. Provider (Google OAuth 2.0), a Named Credential referencing it, and set remote site/CSP if needed.
- The live code also expects an External Credential named `GoogleCalendar_ExternalCredential` and a named principal called `GoogleCalendarNamedPrincipal`.
- Two options:
  1. Named Credential with OAuth 2.0 (recommended for user-delegated access).
  2. Named Credential with a service account and JWT (requires GCP setup; less interactive).

Template metadata included in this repo
- `docs/Google.authprovider-meta.xml.disabled`
- `docs/GoogleCalendar_ExternalCredential.externalCredential-meta.xml.disabled`
- `docs/GoogleCalendar.namedCredential-meta.xml.disabled`

How to use the templates
1. Replace the placeholder Google client id and client secret in `docs/Google.authprovider-meta.xml.disabled`.
2. Copy and rename the files into their deployable metadata folders:
   - `docs/Google.authprovider-meta.xml.disabled` -> `force-app/main/default/authproviders/Google.authprovider-meta.xml`
   - `docs/GoogleCalendar_ExternalCredential.externalCredential-meta.xml.disabled` -> `force-app/main/default/externalCredentials/GoogleCalendar_ExternalCredential.externalCredential-meta.xml`
   - `docs/GoogleCalendar.namedCredential-meta.xml.disabled` -> `force-app/main/default/namedCredentials/GoogleCalendar.namedCredential-meta.xml`
3. Deploy those metadata files to the org.
4. Open Salesforce Setup and confirm the External Credential principal and OAuth settings if Salesforce asks for additional details during activation.

Recommended: OAuth 2.0 via an Auth. Provider.

Steps (Auth Provider + Named Credential)

1. Create a Google Cloud OAuth client
   - Console: https://console.cloud.google.com/apis/credentials
   - Create Credentials -> OAuth client ID -> Web application
   - Authorised redirect URI: `https://login.salesforce.com/services/authcallback/Google` (for production) or `https://test.salesforce.com/services/authcallback/Google` (for sandbox). Use the correct Salesforce login domain for your org.
   - Note the Client ID and Client Secret.

2. Create an Auth. Provider in Salesforce
   - In Setup -> Auth. Providers -> New
     - Provider Type: OpenID Connect
     - Name: Google
     - Consumer Key: (Client ID from GCP)
     - Consumer Secret: (Client Secret from GCP)
     - Authorize Endpoint URL: `https://accounts.google.com/o/oauth2/v2/auth`
     - Token Endpoint URL: `https://oauth2.googleapis.com/token`
     - User Info Endpoint URL: `https://openidconnect.googleapis.com/v1/userinfo`
     - Default Scopes: `openid email profile https://www.googleapis.com/auth/calendar`
     - Registration Handler: (optional) `Default` is fine
   - Save. After saving, copy the "Callback URL" value and add it to the authorized redirect URIs in your Google Cloud OAuth client.

3. Create an External Credential and Named Credential
   - If you use the metadata templates in this repo, you can deploy them instead of creating them manually.
   - External Credential expected by the code:
     - Developer Name: `GoogleCalendar_ExternalCredential`
     - Named Principal: `GoogleCalendarNamedPrincipal`

4. Create a Named Credential
   - In Setup -> Named Credentials -> New Named Credential
     - Label: GoogleCalendar
     - Name: GoogleCalendar
     - URL: `https://www.googleapis.com` (or `https://www.googleapis.com/`)
     - Named Credential Type: `SecuredEndpoint`
     - Authentication: select `GoogleCalendar_ExternalCredential`
     - Generate Authorization Header: true
     - Allow Merge Fields in HTTP Header: false
     - Save and click "Authenticate" (this will open the OAuth flow to grant access). Authenticate using a Google account with access to the Google calendars you want to sync.

5. Update Apex callout endpoint (if needed)
   - The Apex class uses `callout:GoogleCalendar/calendar/v3/calendars/...`
   - Named Credential named `GoogleCalendar` maps `callout:GoogleCalendar` correctly.
   - If your Named Credential name differs, update the Apex endpoints accordingly.

Service Account alternative (server-to-server)
- Create a service account in GCP and grant domain-wide delegation / Calendar access.
- Use a JWT-based auth flow to fetch an access token and store it in a Salesforce Protected Custom Setting or Platform Cache.
- This approach requires extra secure handling and is more complex. Ask me if you need this.

Permissions & Remote Site / CSP
- Named Credentials handle callout permissions; typically no Remote Site is necessary for callouts via Named Credential.
- If using direct endpoints (not callout:), add Remote Site Settings for `https://www.googleapis.com`.

Testing / Team Calendar UI Flow
- Create or update a Team Calendar record with `Google_Sync_Enabled__c = true`.
- `Google_Calendar_Id__c` can now be blank initially.
- In the Team Calendar Board:
  - Select a Team Calendar record in the main Calendar dropdown.
  - Use the Google Sync panel on the right and click `Connect Google`.
  - Complete the OAuth flow in the new tab.
  - Click `Refresh` in the Google Sync panel.
  - Choose the Google calendar you want from the `Google Calendar` dropdown.
  - Click `Sync Now` to enqueue the sync job.
- Monitor `Last_Synced_At__c` and `Sync_Status__c` on synced events.

Notes on calendar selection
- The selected Google calendar is stored in `Team_Calendar__c.Google_Calendar_Id__c`.
- The Google Sync panel loads the writable calendars returned by the connected Google account and lets the user choose one without manually typing the id.
- If you clear the dropdown selection, the Team Calendar stops pointing at a Google calendar until a new one is chosen.

Automation & Refresh tokens
- Named Credentials manage token refresh automatically for OAuth flows created via Auth. Provider.
- For Per User identity type, each Salesforce user must authenticate once.

Security notes
- Use Per User identity if you need actions performed as the actual Google user.
- Use Named Principal for a single shared calendar account.
- Never store client secrets in code or public repos. Use Auth. Provider + Named Credential.

Need me to:
- Create Metadata for the AuthProvider / NamedCredential (I can generate sample metadata but the Auth. Provider requires you to complete the OAuth client setup in GCP).
- Walk you step-by-step through the Salesforce UI authentication flow.
- Implement a service-account based approach.

Reply which option you want me to perform next:
- "generate_metadata" — I will create NamedCredential metadata and an AuthProvider placeholder file for deployment (you'll still need to populate clientId/clientSecret and finish OAuth handshake).
- "ui_walkthrough" — I will provide an interactive step list to perform in the Salesforce UI.
- "implement_service_account" — I will scaffold code/comments for server-to-server JWT flow.