import { ExifDateTime, type Tags } from 'exiftool-vendored'
import type { CaptureMetadata, GpsCoordinates, LogEntry, ScannedFile } from '../../shared/types'
import { getExiftool } from './exiftoolClient'

export interface CaptureMetadataResult {
  items: CaptureMetadata[]
  log: LogEntry[]
}

const CONCURRENCY = 8

/**
 * Reads capture time, camera model and dimensions for every image/RAW file.
 * EXIF is the trusted source; file mtime is the visible fallback so photos
 * without EXIF still sort into a timeline (but never into bursts).
 */
export async function extractCaptureMetadata(
  files: ScannedFile[],
  onProgress?: (processed: number, total: number, currentFile: string) => void
): Promise<CaptureMetadataResult> {
  const media = files.filter((file) => file.kind === 'image' || file.kind === 'raw')
  const items: CaptureMetadata[] = new Array(media.length)
  const log: LogEntry[] = []
  let processed = 0
  let nextIndex = 0

  const worker = async (): Promise<void> => {
    while (nextIndex < media.length) {
      const index = nextIndex++
      const file = media[index]
      items[index] = await readOne(file)
      processed++
      onProgress?.(processed, media.length, file.name)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, media.length) }, worker))

  for (const item of items) {
    if (item.status === 'failed') {
      log.push({ level: 'WARN', message: `${item.mediaPath}: metadata read failed: ${item.reason}`, timestamp: Date.now() })
    } else if (item.source === 'mtime') {
      log.push({ level: 'INFO', message: `${item.mediaPath}: no EXIF capture time, using file modification time`, timestamp: Date.now() })
    }
  }

  return { items, log }
}

async function readOne(file: ScannedFile): Promise<CaptureMetadata> {
  try {
    const tags = await getExiftool().read(file.path)
    const captureTimeMs = captureTimeFrom(tags)
    return {
      mediaPath: file.path,
      captureTimeMs: captureTimeMs ?? file.mtimeMs,
      source: captureTimeMs !== null ? 'exif' : 'mtime',
      cameraModel: cameraModelFrom(tags),
      width: tags.ImageWidth ?? null,
      height: tags.ImageHeight ?? null,
      gps: gpsFrom(tags),
      status: 'ok'
    }
  } catch (err) {
    return {
      mediaPath: file.path,
      captureTimeMs: file.mtimeMs,
      source: 'mtime',
      cameraModel: null,
      width: null,
      height: null,
      gps: null,
      status: 'failed',
      reason: (err as Error).message
    }
  }
}

function gpsFrom(tags: Tags): GpsCoordinates | null {
  // exiftool-vendored applies the N/S/E/W refs, so these are signed decimals.
  const lat = tags.GPSLatitude
  const lon = tags.GPSLongitude
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon }
}

function captureTimeFrom(tags: Tags): number | null {
  // SubSec variants carry millisecond precision, needed to order burst frames
  // taken within the same second.
  const candidates = [tags.SubSecDateTimeOriginal, tags.DateTimeOriginal, tags.CreateDate]
  for (const candidate of candidates) {
    if (candidate instanceof ExifDateTime) {
      const millis = candidate.toMillis()
      if (Number.isFinite(millis)) return millis
    }
  }
  return null
}

function cameraModelFrom(tags: Tags): string | null {
  const make = tags.Make?.trim()
  const model = tags.Model?.trim()
  if (!make && !model) return null
  if (model && make && model.startsWith(make)) return model
  return [make, model].filter(Boolean).join(' ')
}
