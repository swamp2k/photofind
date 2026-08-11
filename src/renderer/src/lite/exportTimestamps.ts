export interface LiteTimestampEntry {
  path: string
  lastModifiedMs: number
}

export interface LiteTimestampArtifacts {
  jsonName: string
  json: string
  pythonName: string
  python: string
  powershellName: string
  powershell: string
}

export function buildTimestampArtifacts(entries: LiteTimestampEntry[], suffix = ''): LiteTimestampArtifacts {
  const normalizedSuffix = suffix ? `-${suffix}` : ''
  const jsonName = `photofind-original-modified-times${normalizedSuffix}.json`
  const pythonName = `photofind-restore-modified-times${normalizedSuffix}.py`
  const powershellName = `photofind-restore-modified-times${normalizedSuffix}.ps1`
  const payload = {
    note: 'PhotoFind cannot set filesystem modification times directly from a hosted browser. Run one of the included restore scripts after export to restore source mtimes.',
    files: entries.map((entry) => ({
      path: entry.path,
      lastModifiedMs: entry.lastModifiedMs,
      lastModifiedIso: new Date(entry.lastModifiedMs).toISOString()
    }))
  }
  const json = JSON.stringify(payload, null, 2)
  const python = `#!/usr/bin/env python3
import json
import os
from pathlib import Path

root = Path(__file__).resolve().parent
payload = json.loads((root / ${JSON.stringify(jsonName)}).read_text(encoding="utf-8"))
restored = 0
failed = 0
for entry in payload["files"]:
    path = root.joinpath(*entry["path"].split("/"))
    try:
        stat = path.stat()
        modified = entry["lastModifiedMs"] / 1000.0
        os.utime(path, (stat.st_atime, modified))
        restored += 1
    except Exception as exc:
        failed += 1
        print(f"FAILED {path}: {exc}")
print(f"Restored modified time on {restored} files; {failed} failed.")
`
  const powershell = `$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Payload = Get-Content -LiteralPath (Join-Path $Root ${JSON.stringify(jsonName)}) -Raw | ConvertFrom-Json
$Restored = 0
$Failed = 0
foreach ($Entry in $Payload.files) {
  $Relative = ($Entry.path -replace '/', [IO.Path]::DirectorySeparatorChar)
  $Path = Join-Path $Root $Relative
  try {
    $Utc = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$Entry.lastModifiedMs).UtcDateTime
    [System.IO.File]::SetLastWriteTimeUtc($Path, $Utc)
    $Restored++
  } catch {
    $Failed++
    Write-Host "FAILED $Path`: $($_.Exception.Message)"
  }
}
Write-Host "Restored modified time on $Restored files; $Failed failed."
`
  return { jsonName, json, pythonName, python, powershellName, powershell }
}
