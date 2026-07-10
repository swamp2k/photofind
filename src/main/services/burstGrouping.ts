import { createHash } from 'node:crypto'
import type { BurstGroup, CaptureMetadata, LogEntry, QualityScore } from '../../shared/types'

/** Frames closer together than this (same camera) belong to one burst. */
export const BURST_GAP_MS = 2500

export interface BurstGroupingResult {
  groups: BurstGroup[]
  log: LogEntry[]
}

/**
 * Groups continuous-shot sequences: photos sorted by capture time chain into
 * a burst while the gap stays within BURST_GAP_MS and the camera matches.
 * Only EXIF-sourced timestamps participate — mtimes of copied/downloaded
 * files cluster artificially and would fabricate bursts.
 */
export function groupBursts(captures: CaptureMetadata[], qualities: QualityScore[]): BurstGroupingResult {
  const log: LogEntry[] = []
  const sharpnessByPath = new Map(qualities.map((quality) => [quality.mediaPath, quality.sharpness]))

  const eligible = captures.filter((capture) => capture.source === 'exif' && capture.captureTimeMs !== null)
  const skipped = captures.length - eligible.length
  if (skipped > 0) {
    log.push({
      level: 'INFO',
      message: `${skipped} photo(s) without EXIF capture time excluded from burst detection`,
      timestamp: Date.now()
    })
  }

  const sorted = [...eligible].sort((a, b) => a.captureTimeMs! - b.captureTimeMs!)

  const groups: BurstGroup[] = []
  let run: CaptureMetadata[] = []

  const flush = (): void => {
    if (run.length >= 2) {
      groups.push(buildGroup(run, sharpnessByPath))
    }
    run = []
  }

  for (const capture of sorted) {
    const previous = run[run.length - 1]
    if (
      previous &&
      capture.captureTimeMs! - previous.captureTimeMs! <= BURST_GAP_MS &&
      capture.cameraModel === previous.cameraModel
    ) {
      run.push(capture)
    } else {
      flush()
      run = [capture]
    }
  }
  flush()

  return { groups, log }
}

function buildGroup(run: CaptureMetadata[], sharpnessByPath: Map<string, number | null>): BurstGroup {
  let pick = run[0]
  let pickSharpness = sharpnessByPath.get(pick.mediaPath) ?? -1
  for (const capture of run.slice(1)) {
    const sharpness = sharpnessByPath.get(capture.mediaPath) ?? -1
    // Strictly greater keeps the earliest frame on ties.
    if (sharpness > pickSharpness) {
      pick = capture
      pickSharpness = sharpness
    }
  }

  const startMs = run[0].captureTimeMs!
  const id = `burst-${createHash('sha1').update(`${run[0].mediaPath}\0${startMs}`).digest('hex').slice(0, 12)}`
  return {
    id,
    mediaPaths: run.map((capture) => capture.mediaPath),
    pickPath: pick.mediaPath,
    startMs,
    endMs: run[run.length - 1].captureTimeMs!
  }
}
