import type { LogEntry, ScannedFile, ScanResult, ScanSummary, SidecarMatch } from '../../shared/types'
import { scanDirectory } from './scanner'
import { matchSidecars } from './sidecarMatcher'

export async function runScan(root: string): Promise<ScanResult> {
  const files = await scanDirectory(root)
  const matches = matchSidecars(files)
  return {
    summary: buildSummary(files, matches),
    matches,
    log: buildLog(files, matches)
  }
}

function buildSummary(files: ScannedFile[], matches: SidecarMatch[]): ScanSummary {
  const count = (kind: ScannedFile['kind']): number => files.filter((f) => f.kind === kind).length
  return {
    totalFiles: files.length,
    images: count('image'),
    raw: count('raw'),
    videos: count('video'),
    sidecars: count('sidecar'),
    unknown: count('unknown'),
    safeMatches: matches.filter((m) => m.confidence === 'safe').length,
    uncertainMatches: matches.filter((m) => m.confidence === 'uncertain').length,
    missingMatches: matches.filter((m) => m.confidence === 'missing').length
  }
}

function buildLog(files: ScannedFile[], matches: SidecarMatch[]): LogEntry[] {
  const log: LogEntry[] = []
  const now = Date.now()
  for (const match of matches) {
    if (match.confidence === 'uncertain' || match.confidence === 'missing') {
      log.push({ level: 'WARN', message: `${match.media.name}: ${match.reason}`, timestamp: now })
    }
  }
  // Unknown files must surface in diagnostics rather than vanish from the scan silently.
  for (const file of files) {
    if (file.kind === 'unknown') {
      log.push({ level: 'INFO', message: `${file.name}: unrecognized file type, not processed`, timestamp: now })
    }
  }
  return log
}
