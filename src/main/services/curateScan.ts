import { randomUUID } from 'node:crypto'
import type {
  CurateScanResult,
  CurateSummary,
  LogEntry,
  PhotoAnalysis,
  ScanPhase,
  ScanProgressEvent
} from '../../shared/types'
import { extractCaptureMetadata } from './captureMetadata'
import { groupBursts } from './burstGrouping'
import { analyzeQuality } from './quality'
import { scanDirectory } from './scanner'
import { generateThumbnails } from './thumbnails'
import { suggestVerdicts } from './verdicts'

export interface CurateScanOptions {
  thumbnailCacheRoot: string
  onProgress?: (event: ScanProgressEvent) => void
}

const PROGRESS_INTERVAL_MS = 100
const PROGRESS_EVERY_ITEMS = 25

/**
 * The curation pipeline: walk the folder, read capture metadata, generate
 * thumbnails, score quality, group bursts, suggest verdicts. Progress events
 * are throttled but always fire on phase boundaries so the UI never stalls.
 */
export async function runCurateScan(root: string, options: CurateScanOptions): Promise<CurateScanResult> {
  const scanId = randomUUID()
  const progress = makeProgressEmitter(scanId, options.onProgress)

  progress.phase('scanning', 0, 0)
  const files = await scanDirectory(root)
  const media = files.filter((file) => file.kind === 'image' || file.kind === 'raw')
  progress.phase('scanning', files.length, files.length)

  progress.phase('metadata', 0, media.length)
  const captures = await extractCaptureMetadata(files, (processed, total, currentFile) =>
    progress.tick('metadata', processed, total, currentFile)
  )

  progress.phase('thumbnails', 0, media.length)
  const thumbnails = await generateThumbnails(files, {
    cacheRoot: options.thumbnailCacheRoot,
    onProgress: (processed, total, currentFile) => progress.tick('thumbnails', processed, total, currentFile)
  })

  progress.phase('analyzing', 0, thumbnails.items.length)
  const quality = await analyzeQuality(thumbnails.items, (processed, total, currentFile) =>
    progress.tick('analyzing', processed, total, currentFile)
  )

  progress.phase('grouping', 0, media.length)
  const bursts = groupBursts(captures.items, quality.items)
  const photos = suggestVerdicts(media, captures.items, quality.items, bursts.groups)
  progress.phase('grouping', media.length, media.length)

  const log: LogEntry[] = [
    ...buildScanLog(files),
    ...captures.log,
    ...thumbnails.log,
    ...quality.log,
    ...bursts.log
  ]

  const result: CurateScanResult = {
    scanId,
    rootPath: root,
    summary: buildSummary(files.length, photos, bursts.groups.length),
    photos,
    bursts: bursts.groups,
    thumbnails,
    log
  }

  progress.phase('done', media.length, media.length)
  return result
}

function buildSummary(totalFiles: number, photos: PhotoAnalysis[], bursts: number): CurateSummary {
  const count = (verdict: PhotoAnalysis['suggestedVerdict']): number =>
    photos.filter((photo) => photo.suggestedVerdict === verdict).length
  return {
    totalFiles,
    analyzed: photos.length,
    keep: count('keep'),
    maybe: count('maybe'),
    discard: count('discard'),
    bursts,
    failed: photos.filter((photo) => photo.quality.status === 'failed').length
  }
}

function buildScanLog(files: { kind: string; name: string }[]): LogEntry[] {
  const log: LogEntry[] = []
  const now = Date.now()
  const videos = files.filter((file) => file.kind === 'video').length
  if (videos > 0) {
    log.push({ level: 'INFO', message: `${videos} video(s) found; video analysis is not supported yet`, timestamp: now })
  }
  const unknown = files.filter((file) => file.kind === 'unknown').length
  if (unknown > 0) {
    log.push({ level: 'INFO', message: `${unknown} unrecognized file(s) not processed`, timestamp: now })
  }
  return log
}

function makeProgressEmitter(
  scanId: string,
  emit?: (event: ScanProgressEvent) => void
): {
  phase: (phase: ScanPhase, processed: number, total: number) => void
  tick: (phase: ScanPhase, processed: number, total: number, currentFile?: string) => void
} {
  let lastEmit = 0
  let lastCount = 0

  const send = (phase: ScanPhase, processed: number, total: number, currentFile?: string): void => {
    emit?.({ scanId, phase, processed, total, currentFile })
    lastEmit = Date.now()
    lastCount = processed
  }

  return {
    // Phase boundaries always emit.
    phase: (phase, processed, total) => send(phase, processed, total),
    tick: (phase, processed, total, currentFile) => {
      const now = Date.now()
      if (processed === total || now - lastEmit >= PROGRESS_INTERVAL_MS || processed - lastCount >= PROGRESS_EVERY_ITEMS) {
        send(phase, processed, total, currentFile)
      }
    }
  }
}
