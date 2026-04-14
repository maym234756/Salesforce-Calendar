$ErrorActionPreference = "Stop"

$root = Get-Location
$lwcRoot = Join-Path $root "force-app\main\default\lwc"

function Write-Utf8NoBom {
    param(
        [string]$Path,
        [string]$Content
    )
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

# 1) Rewrite all component meta XML files cleanly, no BOM, no junk before <?xml
$metaMap = @{
    "teamCalendarBoard\teamCalendarBoard.js-meta.xml" = @(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">',
        '    <apiVersion>66.0</apiVersion>',
        '    <isExposed>true</isExposed>',
        '    <masterLabel>Team Calendar Board</masterLabel>',
        '    <description>Custom calendar board tab for Team Marine Sales.</description>',
        '    <targets>',
        '        <target>lightning__Tab</target>',
        '        <target>lightning__AppPage</target>',
        '    </targets>',
        '</LightningComponentBundle>'
    ) -join "`r`n"

    "calendarToolbar\calendarToolbar.js-meta.xml" = @(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">',
        '    <apiVersion>66.0</apiVersion>',
        '    <isExposed>false</isExposed>',
        '</LightningComponentBundle>'
    ) -join "`r`n"

    "calendarLegend\calendarLegend.js-meta.xml" = @(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">',
        '    <apiVersion>66.0</apiVersion>',
        '    <isExposed>false</isExposed>',
        '</LightningComponentBundle>'
    ) -join "`r`n"

    "calendarGrid\calendarGrid.js-meta.xml" = @(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">',
        '    <apiVersion>66.0</apiVersion>',
        '    <isExposed>false</isExposed>',
        '</LightningComponentBundle>'
    ) -join "`r`n"

    "calendarAgenda\calendarAgenda.js-meta.xml" = @(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">',
        '    <apiVersion>66.0</apiVersion>',
        '    <isExposed>false</isExposed>',
        '</LightningComponentBundle>'
    ) -join "`r`n"

    "calendarCreateModal\calendarCreateModal.js-meta.xml" = @(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">',
        '    <apiVersion>66.0</apiVersion>',
        '    <isExposed>false</isExposed>',
        '</LightningComponentBundle>'
    ) -join "`r`n"

    "calendarUtils\calendarUtils.js-meta.xml" = @(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">',
        '    <apiVersion>66.0</apiVersion>',
        '    <isExposed>false</isExposed>',
        '</LightningComponentBundle>'
    ) -join "`r`n"
}

foreach ($relativePath in $metaMap.Keys) {
    $fullPath = Join-Path $lwcRoot $relativePath
    $dir = Split-Path $fullPath -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
    Write-Utf8NoBom -Path $fullPath -Content $metaMap[$relativePath]
}

# 2) Strip BOM / leading junk from existing html/js/css too, just in case
$codeFiles = Get-ChildItem $lwcRoot -Recurse -Include *.html,*.js,*.css
foreach ($file in $codeFiles) {
    $raw = Get-Content $file.FullName -Raw
    $clean = $raw.TrimStart([char]0xFEFF)
    Write-Utf8NoBom -Path $file.FullName -Content $clean
}

Write-Host ""
Write-Host "[OK] LWC scaffold metadata repaired." -ForegroundColor Green
Write-Host "Next deploy command:" -ForegroundColor Cyan
Write-Host "sf project deploy start --source-dir force-app/main/default/lwc --target-org calendarDev"
Write-Host ""