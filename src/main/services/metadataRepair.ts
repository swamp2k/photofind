import { readFile } from 'node:fs/promises'
import { ExifTool } from 'exiftool-vendored'
import type { LogEntry, RepairResult, SidecarMatch, TakeoutMetadata } from '../../shared/types'

export interface RepairOptions {
  dryRun: boolean
}

/** Writes Google Takeout's date/GPS metadata into the media file's EXIF, safe matches only. */
export async function repairMetadata(matches: SidecarMatch[], options: RepairOptions): Promise<RepairResult> {
  const log: LogEntry[] = []
  const safeMatches = matches.filter((m) => m.confidence === 'safe' && m.sidecar)

  const exiftool = options.dryRun ? null : new ExifTool()
  let repaired = 0
  let failed = 0

  try {
    for (const match of safeMatches) {
      try {
        const raw = await readFile(match.sidecar!.path, 'utf-8')
        const meta = JSON.parse(raw) as TakeoutMetadata
        const tags = buildTags(meta)

        if (Object.keys(tags).length === 0) {
          log.push(logEntry('INFO', `${match.media.name}: sidecar has no usable date/GPS data, skipping`))
          continue
        }

        if (options.dryRun) {
          log.push(logEntry('INFO', `${match.media.name}: would write ${Object.keys(tags).join(', ')}`))
        } else {
          // exiftool-vendored's Tags type is stricter than the dynamic subset we build here.
          await exiftool!.write(match.media.path, tags as Parameters<ExifTool['write']>[1])
          log.push(logEntry('INFO', `${match.media.name}: wrote ${Object.keys(tags).join(', ')}`))
        }
        repaired++
      } catch (err) {
        failed++
        log.push(logEntry('ERROR', `Failed writing metadata to ${match.media.name}: ${(err as Error).message}`))
      }
    }
  } finally {
    if (exiftool) await exiftool.end()
  }

  return { attempted: safeMatches.length, repaired, failed, log }
}

function buildTags(meta: TakeoutMetadata): Record<string, unknown> {
  const tags: Record<string, unknown> = {}
  if (meta.photoTakenTime?.timestamp) {
    tags.DateTimeOriginal = formatExifDate(new Date(Number(meta.photoTakenTime.timestamp) * 1000))
  }
  if (meta.geoData && (meta.geoData.latitude !== 0 || meta.geoData.longitude !== 0)) {
    tags.GPSLatitude = meta.geoData.latitude
    tags.GPSLongitude = meta.geoData.longitude
    if (meta.geoData.altitude) tags.GPSAltitude = meta.geoData.altitude
  }
  return tags
}

function formatExifDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}:${pad(date.getUTCMonth() + 1)}:${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

function logEntry(level: LogEntry['level'], message: string): LogEntry {
  return { level, message, timestamp: Date.now() }
}
