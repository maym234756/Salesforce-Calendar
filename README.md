# Team Calendar

Salesforce DX project for the Team Calendar app, including Lightning components, Apex services, and Google Calendar sync integration.

## Common Commands

- `npm test`
- `npm run test:unit`
- `npm run lint`
- `npm run prettier:verify`

## Google Calendar Docs

- Named credential and external credential setup: [docs/GOOGLE_CALENDAR_NAMED_CREDENTIAL.md](docs/GOOGLE_CALENDAR_NAMED_CREDENTIAL.md)
- Live recurring Google smoke flow: [docs/LIVE_RECURRING_GOOGLE_SMOKE.md](docs/LIVE_RECURRING_GOOGLE_SMOKE.md)

## Live Smoke Runner

Run the full recurring Google smoke suite from Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-liveRecurringGoogleSmoke.ps1 -Phase all -BaseKey "Live Recurring Smoke 20260420C" -Execute
```

The suite writes its per-phase JSON outputs under `artifacts/live-smoke/<base-key>/` by default. Single phases can still be run directly with `-Phase setup`, `-Phase verifyUpdate`, `-Phase verifyCleanup`, and so on.
