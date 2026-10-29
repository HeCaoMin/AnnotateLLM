$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$extensionFolder = Join-Path $projectRoot 'dist\dialog-notes'
if (-not (Test-Path -LiteralPath (Join-Path $extensionFolder 'manifest.json'))) { throw '请先执行 node scripts/build.mjs' }
$manifest = Get-Content -LiteralPath (Join-Path $extensionFolder 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Add-Type -AssemblyName System.IO.Compression.FileSystem
$checksums = @()
foreach ($browserName in @('chrome', 'edge')) {
  $archivePath = Join-Path $projectRoot ('dist\AnnotateLLM-' + $browserName + '-' + $manifest.version + '.zip')
  Compress-Archive -Path (Join-Path $extensionFolder '*') -DestinationPath $archivePath -Force
  $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    foreach ($required in @('LICENSE', 'manifest.json', 'editor.bundle.js', 'editor-ui.js', 'keyboard-guard.js', 'THIRD-PARTY-LICENSES.txt') + $manifest.content_scripts[0].js + $manifest.content_scripts[0].css) {
      if ($entryNames -notcontains $required) { throw "Archive is missing $required" }
    }
    if ($entryNames | Where-Object { $_ -match '(^|/)(node_modules|artifacts|tests|scripts)/' }) { throw 'Unexpected development files in archive' }
    $entryCount = $archive.Entries.Count
  } finally { $archive.Dispose() }
  $hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
  $checksums += [pscustomobject]@{file = (Split-Path -Leaf $archivePath); version = $manifest.version; entries = $entryCount; sha256 = $hash}
}
$checksums | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot 'dist\package-checksums.json') -Encoding UTF8
$checksums | Format-Table -AutoSize
