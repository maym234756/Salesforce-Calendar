param(
    [ValidateSet('setup', 'syncTemplate', 'verifyTemplate', 'update', 'verifyUpdate', 'delete', 'verifyDelete', 'cleanup', 'verifyCleanup', 'all')]
    [string]$Phase = 'setup',
    [string]$BaseKey,
    [string]$TargetOrg = 'calendarDev',
    [string]$CalendarName = 'Afton Averett Calendar',
    [string]$UpdateOccurrenceDate = '2026-04-23',
    [string]$DeleteOccurrenceDate = '2026-04-24',
    [string]$TemplateStartValue = '2026-04-22T15:00:00.000Z',
    [string]$TemplateEndValue = '2026-04-22T16:00:00.000Z',
    [string]$TemplateRecurrenceRule = 'FREQ=DAILY;COUNT=5',
    [string]$UpdateStartValue = '2026-04-23T18:00:00.000Z',
    [string]$UpdateEndValue = '2026-04-23T19:00:00.000Z',
    [string]$RangeStartValue = '2026-04-22T00:00:00.000Z',
    [string]$RangeEndValue = '2026-04-27T23:59:59.000Z',
    [string]$ArtifactsDirectory,
    [string]$RenderedFilePath,
    [string]$JsonOutputPath,
    [switch]$Execute,
    [switch]$KeepRenderedFile
)

$ErrorActionPreference = 'Stop'

function ConvertTo-ApexStringLiteral {
    param([string]$Value)

    if ($null -eq $Value) {
        return ''
    }

    return $Value.Replace('\', '\\').Replace("'", "\'")
}

function Ensure-ParentDirectory {
    param([string]$Path)

    $parent = Split-Path -Path $Path -Parent
    if (-not [string]::IsNullOrWhiteSpace($parent) -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent | Out-Null
    }
}

function Write-Utf8NoBom {
    param(
        [string]$Path,
        [string]$Content
    )

    Ensure-ParentDirectory -Path $Path
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Resolve-SfCli {
    $candidates = @(
        'C:\Program Files\sfdx\bin\sf.cmd',
        'C:\Program Files\sfdx\bin\sf.exe',
        'C:\Program Files\sfdx\bin\sf'
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return 'sf'
}

function ConvertTo-FileSlug {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return 'live-recurring-smoke'
    }

    $normalized = $Value.ToLowerInvariant() -replace '[^a-z0-9]+', '-'
    $normalized = $normalized.Trim('-')

    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return 'live-recurring-smoke'
    }

    return $normalized
}

function Get-PhaseJsonFileName {
    param([string]$PhaseName)

    $normalizedPhase = ($PhaseName -replace '[^A-Za-z0-9-]', '-').ToLowerInvariant()
    return 'live-recurring-smoke-' + $normalizedPhase + '.json'
}

function Resolve-PhaseJsonOutputPath {
    param(
        [string]$PhaseName,
        [string]$RequestedPath,
        [string]$ArtifactsDirectory,
        [string]$RepoRoot
    )

    if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
        return $RequestedPath
    }

    $fileName = Get-PhaseJsonFileName -PhaseName $PhaseName
    if (-not [string]::IsNullOrWhiteSpace($ArtifactsDirectory)) {
        return Join-Path $ArtifactsDirectory $fileName
    }

    return Join-Path $RepoRoot $fileName
}

function Invoke-LiveRecurringGoogleSmokePhase {
    param(
        [string]$PhaseName,
        [string]$BaseKey,
        [string]$TargetOrg,
        [string]$CalendarName,
        [string]$UpdateOccurrenceDate,
        [string]$DeleteOccurrenceDate,
        [string]$TemplateStartValue,
        [string]$TemplateEndValue,
        [string]$TemplateRecurrenceRule,
        [string]$UpdateStartValue,
        [string]$UpdateEndValue,
        [string]$RangeStartValue,
        [string]$RangeEndValue,
        [string]$RenderedFilePath,
        [string]$JsonOutputPath,
        [string]$SourceTemplate,
        [string]$SfCli,
        [switch]$ExecutePhase,
        [switch]$KeepRenderedFile,
        [switch]$SuppressCommandOutput
    )

    $resolvedRenderedFilePath = $RenderedFilePath
    if ([string]::IsNullOrWhiteSpace($resolvedRenderedFilePath)) {
        $resolvedRenderedFilePath = Join-Path $env:TEMP ('liveRecurringGoogleSmoke.' + $PhaseName + '.' + [Guid]::NewGuid().ToString('N') + '.apex')
    }

    $configLines = @(
        '// LIVE_SMOKE_CONFIG_START',
        "String phase = '$(ConvertTo-ApexStringLiteral $PhaseName)';",
        "String baseKey = '$(ConvertTo-ApexStringLiteral $BaseKey)';",
        "String calendarName = '$(ConvertTo-ApexStringLiteral $CalendarName)';",
        "String updateOccurrenceDate = '$(ConvertTo-ApexStringLiteral $UpdateOccurrenceDate)';",
        "String deleteOccurrenceDate = '$(ConvertTo-ApexStringLiteral $DeleteOccurrenceDate)';",
        "String templateStartValue = '$(ConvertTo-ApexStringLiteral $TemplateStartValue)';",
        "String templateEndValue = '$(ConvertTo-ApexStringLiteral $TemplateEndValue)';",
        "String templateRecurrenceRule = '$(ConvertTo-ApexStringLiteral $TemplateRecurrenceRule)';",
        "String updateStartValue = '$(ConvertTo-ApexStringLiteral $UpdateStartValue)';",
        "String updateEndValue = '$(ConvertTo-ApexStringLiteral $UpdateEndValue)';",
        "String rangeStartValue = '$(ConvertTo-ApexStringLiteral $RangeStartValue)';",
        "String rangeEndValue = '$(ConvertTo-ApexStringLiteral $RangeEndValue)';",
        '// LIVE_SMOKE_CONFIG_END'
    )

    $rendered = [regex]::Replace(
        $SourceTemplate,
        '(?s)// LIVE_SMOKE_CONFIG_START.*?// LIVE_SMOKE_CONFIG_END',
        ($configLines -join [Environment]::NewLine)
    )
    $rendered = $rendered.TrimStart([char]0xFEFF)

    Write-Utf8NoBom -Path $resolvedRenderedFilePath -Content $rendered

    Write-Host ('Phase: ' + $PhaseName)
    Write-Host ('BaseKey: ' + $BaseKey)
    Write-Host ('RenderedApex: ' + $resolvedRenderedFilePath)

    $result = [ordered]@{
        phase = $PhaseName
        baseKey = $BaseKey
        renderedFilePath = $resolvedRenderedFilePath
        jsonOutputPath = $JsonOutputPath
        executed = $ExecutePhase.IsPresent
    }

    if (-not $ExecutePhase) {
        return [pscustomobject]$result
    }

    Ensure-ParentDirectory -Path $JsonOutputPath

    $stdoutPath = Join-Path $env:TEMP ('liveRecurringGoogleSmoke.' + [Guid]::NewGuid().ToString('N') + '.stdout')
    $stderrPath = Join-Path $env:TEMP ('liveRecurringGoogleSmoke.' + [Guid]::NewGuid().ToString('N') + '.stderr')

    $process = Start-Process -FilePath $SfCli -ArgumentList @(
        'apex',
        'run',
        '--target-org',
        $TargetOrg,
        '--file',
        $resolvedRenderedFilePath,
        '--json'
    ) -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

    $outputParts = @()
    if (Test-Path $stdoutPath) {
        $stdoutText = Get-Content -Path $stdoutPath -Raw
        if (-not [string]::IsNullOrWhiteSpace($stdoutText)) {
            $outputParts += $stdoutText.TrimEnd()
        }
    }
    if (Test-Path $stderrPath) {
        $stderrText = Get-Content -Path $stderrPath -Raw
        if (-not [string]::IsNullOrWhiteSpace($stderrText)) {
            $outputParts += $stderrText.TrimEnd()
        }
    }

    $output = $outputParts -join [Environment]::NewLine
    $exitCode = $process.ExitCode

    Write-Utf8NoBom -Path $JsonOutputPath -Content $output
    Write-Host ('JsonOutput: ' + $JsonOutputPath)

    if (Test-Path $stdoutPath) {
        Remove-Item -Path $stdoutPath -Force
    }
    if (Test-Path $stderrPath) {
        Remove-Item -Path $stderrPath -Force
    }

    if ($exitCode -eq 0 -and -not $KeepRenderedFile -and (Test-Path $resolvedRenderedFilePath)) {
        Remove-Item -Path $resolvedRenderedFilePath -Force
    }

    if ($output -and -not $SuppressCommandOutput) {
        $output
    }

    if ($exitCode -ne 0) {
        throw ('sf apex run failed with exit code ' + $exitCode + '. See ' + $JsonOutputPath)
    }

    return [pscustomobject]$result
}

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$sourcePath = Join-Path $repoRoot 'scripts\apex\liveRecurringGoogleSmoke.apex'
$sourceTemplate = (Get-Content -Path $sourcePath -Raw).TrimStart([char]0xFEFF)

if ([string]::IsNullOrWhiteSpace($BaseKey)) {
    $BaseKey = 'Live Recurring Smoke ' + (Get-Date -Format 'yyyyMMdd_HHmmss')
}

$sfCli = Resolve-SfCli

if ($Phase -eq 'all') {
    if (-not $Execute) {
        throw "Phase 'all' requires -Execute."
    }

    if ([string]::IsNullOrWhiteSpace($ArtifactsDirectory)) {
        $ArtifactsDirectory = Join-Path $repoRoot ('artifacts\live-smoke\' + (ConvertTo-FileSlug -Value $BaseKey))
    }

    $suiteSummaryPath = if ([string]::IsNullOrWhiteSpace($JsonOutputPath)) {
        Join-Path $ArtifactsDirectory 'live-recurring-smoke-suite.json'
    } else {
        $JsonOutputPath
    }

    $suitePhases = @(
        'setup',
        'syncTemplate',
        'verifyTemplate',
        'update',
        'verifyUpdate',
        'delete',
        'verifyDelete',
        'cleanup',
        'verifyCleanup'
    )

    $phaseResults = @()
    foreach ($phaseName in $suitePhases) {
        $phaseJsonOutputPath = Resolve-PhaseJsonOutputPath -PhaseName $phaseName -RequestedPath $null -ArtifactsDirectory $ArtifactsDirectory -RepoRoot $repoRoot
        $phaseParams = @{
            PhaseName = $phaseName
            BaseKey = $BaseKey
            TargetOrg = $TargetOrg
            CalendarName = $CalendarName
            UpdateOccurrenceDate = $UpdateOccurrenceDate
            DeleteOccurrenceDate = $DeleteOccurrenceDate
            TemplateStartValue = $TemplateStartValue
            TemplateEndValue = $TemplateEndValue
            TemplateRecurrenceRule = $TemplateRecurrenceRule
            UpdateStartValue = $UpdateStartValue
            UpdateEndValue = $UpdateEndValue
            RangeStartValue = $RangeStartValue
            RangeEndValue = $RangeEndValue
            RenderedFilePath = $null
            JsonOutputPath = $phaseJsonOutputPath
            SourceTemplate = $sourceTemplate
            SfCli = $sfCli
            ExecutePhase = $true
            KeepRenderedFile = $KeepRenderedFile
            SuppressCommandOutput = $true
        }
        $phaseResult = Invoke-LiveRecurringGoogleSmokePhase @phaseParams

        $phaseResults += [ordered]@{
            phase = $phaseResult.phase
            jsonOutputPath = $phaseResult.jsonOutputPath
        }
    }

    $suiteSummary = [ordered]@{
        baseKey = $BaseKey
        targetOrg = $TargetOrg
        calendarName = $CalendarName
        artifactsDirectory = $ArtifactsDirectory
        phases = $phaseResults
    }

    Write-Utf8NoBom -Path $suiteSummaryPath -Content (($suiteSummary | ConvertTo-Json -Depth 5))
    Write-Host ('ArtifactsDirectory: ' + $ArtifactsDirectory)
    Write-Host ('SuiteSummary: ' + $suiteSummaryPath)
    Get-Content -Path $suiteSummaryPath -Raw
    return
}

$resolvedJsonOutputPath = Resolve-PhaseJsonOutputPath -PhaseName $Phase -RequestedPath $JsonOutputPath -ArtifactsDirectory $ArtifactsDirectory -RepoRoot $repoRoot

$singlePhaseParams = @{
    PhaseName = $Phase
    BaseKey = $BaseKey
    TargetOrg = $TargetOrg
    CalendarName = $CalendarName
    UpdateOccurrenceDate = $UpdateOccurrenceDate
    DeleteOccurrenceDate = $DeleteOccurrenceDate
    TemplateStartValue = $TemplateStartValue
    TemplateEndValue = $TemplateEndValue
    TemplateRecurrenceRule = $TemplateRecurrenceRule
    UpdateStartValue = $UpdateStartValue
    UpdateEndValue = $UpdateEndValue
    RangeStartValue = $RangeStartValue
    RangeEndValue = $RangeEndValue
    RenderedFilePath = $RenderedFilePath
    JsonOutputPath = $resolvedJsonOutputPath
    SourceTemplate = $sourceTemplate
    SfCli = $sfCli
    ExecutePhase = $Execute
    KeepRenderedFile = $KeepRenderedFile
}

Invoke-LiveRecurringGoogleSmokePhase @singlePhaseParams