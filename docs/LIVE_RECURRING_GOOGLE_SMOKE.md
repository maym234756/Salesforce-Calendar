# Live Recurring Google Smoke

This smoke flow validates the live Salesforce-to-Google recurring event path for Team Calendar.

## Purpose

Use this runner when you need to prove the full live path for a recurring series:

- create the Salesforce template series
- sync the template to Google
- verify the Google instances that were created
- run a `scope='this'` update and prove the targeted Google instance was updated in place
- run a `scope='this'` delete and prove the targeted Google instance was cancelled
- clean up the live test data and verify nothing active remains

## Prerequisites

- The target org alias is authenticated in Salesforce CLI.
- The Team Calendar already has Google sync enabled.
- The Team Calendar already has a target Google calendar selected.
- On this Windows machine, run the script through PowerShell with `-ExecutionPolicy Bypass`.

Default live values in this repo are:

- target org: `calendarDev`
- team calendar: `Afton Averett Calendar`
- template recurrence rule: `FREQ=DAILY;COUNT=5`

## Single Phase

Run any individual phase through the reusable runner:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-liveRecurringGoogleSmoke.ps1 -Phase verifyCleanup -BaseKey "Live Recurring Smoke 20260420B" -Execute
```

Useful phases:

- `setup`
- `syncTemplate`
- `verifyTemplate`
- `update`
- `verifyUpdate`
- `delete`
- `verifyDelete`
- `cleanup`
- `verifyCleanup`

## Full Suite

Run the full suite in one command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-liveRecurringGoogleSmoke.ps1 -Phase all -BaseKey "Live Recurring Smoke 20260420C" -Execute
```

By default, suite output is written to:

```text
artifacts/live-smoke/<base-key-slug>/
```

You can override that location:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-liveRecurringGoogleSmoke.ps1 -Phase all -BaseKey "Live Recurring Smoke 20260420C" -ArtifactsDirectory "artifacts/live-smoke/custom-run" -Execute
```

The suite also writes a summary manifest named `live-recurring-smoke-suite.json` into the artifact directory.

## Expected Artifacts

The suite writes one JSON file per phase:

- `live-recurring-smoke-setup.json`
- `live-recurring-smoke-synctemplate.json`
- `live-recurring-smoke-verifytemplate.json`
- `live-recurring-smoke-update.json`
- `live-recurring-smoke-verifyupdate.json`
- `live-recurring-smoke-delete.json`
- `live-recurring-smoke-verifydelete.json`
- `live-recurring-smoke-cleanup.json`
- `live-recurring-smoke-verifycleanup.json`

## Pass Criteria

`verifyUpdate` passes when the Google occurrence retains the same instance id and the new summary/time are visible in Google.

`verifyDelete` passes when the targeted Google instance is returned with `status = cancelled` and the Salesforce tombstone is `Deleted` and `Synced`.

`verifyCleanup` passes when:

- `remainingNamedRows == 0`
- `activeGoogleEventCount == 0`

`matchingGoogleEventCount` can still be greater than zero after cleanup. That is expected because the Google verification call uses `singleEvents=true&showDeleted=true`, so cancelled items can remain visible in the feed.

## Troubleshooting

- If PowerShell blocks the script, rerun with `-ExecutionPolicy Bypass`.
- If the runner cannot launch Salesforce CLI correctly on Windows, verify the local installation exposes `sf.cmd` under `C:\Program Files\sfdx\bin`.
- If Google time assertions look off by format, compare parsed instants rather than raw strings. Google can return offset timestamps such as `2026-04-23T13:00:00-05:00` for the same instant.
- If cleanup verification fails, inspect whether the remaining Google items are still active or only `cancelled`.