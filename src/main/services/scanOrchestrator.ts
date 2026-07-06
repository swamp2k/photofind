import type { LogEntry, ScannedFile, ScanResult, ScanSummary, SidecarMatch, ThumbnailResult } from '../../shared/types'
import { scanDirectory } from './scanner'
import { matchSidecars } from './sidecarMatcher'
import { generateThumbnails } from './thumbnails'

export interface ScanOptions {
  thumbnailCacheRoot?: string
}

export async function runScan(root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const files = await scanDirectory(root)
  const matches = matchSidecars(files)
  const thumbnails = options.thumbnailCacheRoot
    ? await generateThumbnails(files, { cacheRoot: options.thumbnailCacheRoot })
    : emptyThumbnailResult(files)

  return {
    summary: buildSummary(files, matches),
    matches,
    thumbnails,
    keepers: [],
    log: [...buildLog(files, matches), ...thumbnails.log]
  }
}

function emptyThumbnailResult(files: ScannedFile[]): ThumbnailResult {
  return {
    generated: 0,
    reused: 0,
    failed: 0,
    skipped: files.length,
    items: [],
    log: []
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
