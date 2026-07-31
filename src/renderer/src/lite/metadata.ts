import exifr from 'exifr'
import type { LiteMediaRecord, LiteMetadataStatus } from './types'
import type { LiteTakeoutMatch, ParsedTakeoutMetadata } from './takeout'
import { readTakeoutMetadata } from './takeout'

export const LITE_METADATA_VERSION = 2

export interface MetadataInput {
  media: LiteMediaRecord
  mediaFile: File
  takeoutMatch?: LiteTakeoutMatch
  takeoutFile?: File
}

interface ParsedExifMetadata {
  captureTime?: number
  latitude?: number
  longitude?: number
  width?: number
  height?: number
  cameraMake?: string
  cameraModel?: string
}

export async function enrichMediaMetadata(input: MetadataInput): Promise<LiteMediaRecord> {
  const diagnostics: string[] = []
  let takeout: ParsedTakeoutMetadata = {}
  let exif: ParsedExifMetadata = {}
  let status: LiteMetadataStatus = 'parsed'

  if (input.takeoutMatch?.sidecar && input.takeoutFile) {
    try {
      takeout = await readTakeoutMetadata(input.takeoutFile)
    } catch (error) {
      diagnostics.push(`Takeout JSON parse failed: ${messageOf(error)}`)
    }
  }

  if (input.media.kind === 'image' || input.media.kind === 'raw') {
    try {
      exif = await readExifMetadata(input.mediaFile)
    } catch (error) {
      status = 'failed'
      diagnostics.push(`EXIF parse failed: ${messageOf(error)}`)
    }
  } else {
    status = 'not-applicable'
  }

  const capture = chooseCaptureTime(takeout.captureTime, exif.captureTime, input.media.lastModified)
  const location = chooseLocation(takeout, exif)
  const takeoutMatch = input.takeoutMatch
  if (takeoutMatch?.confidence === 'uncertain') diagnostics.push(`Takeout sidecar match is uncertain: ${takeoutMatch.reason}`)

  return {
    ...input.media,
    metadataVersion: LITE_METADATA_VERSION,
    metadataStatus: status,
    effectiveCaptureTime: capture.time,
    captureTimeSource: capture.source,
    ...(location ? { latitude: location.latitude, longitude: location.longitude, locationSource: location.source } : {}),
    ...(exif.width ? { width: exif.width } : {}),
    ...(exif.height ? { height: exif.height } : {}),
    ...(exif.cameraMake ? { cameraMake: exif.cameraMake } : {}),
    ...(exif.cameraModel ? { cameraModel: exif.cameraModel } : {}),
    ...(input.takeoutFile && takeoutMatch?.sidecar ? { takeoutSidecarPath: takeoutMatch.sidecar.relativePath } : {}),
    ...(takeoutMatch ? { takeoutMatchConfidence: takeoutMatch.confidence } : {}),
    diagnostics
  }
}

export function chooseCaptureTime(
  takeoutTime: number | undefined,
  exifTime: number | undefined,
  fileTime: number
): { time: number; source: 'takeout' | 'exif' | 'file' } {
  if (isValidTime(takeoutTime)) return { time: takeoutTime, source: 'takeout' }
  if (isValidTime(exifTime)) return { time: exifTime, source: 'exif' }
  return { time: fileTime, source: 'file' }
}

export function chooseLocation(
  takeout: Pick<ParsedTakeoutMetadata, 'latitude' | 'longitude'>,
  exif: Pick<ParsedExifMetadata, 'latitude' | 'longitude'>
): { latitude: number; longitude: number; source: 'takeout' | 'exif' } | undefined {
  const takeoutPair = validCoordinatePair(takeout.latitude, takeout.longitude)
  if (takeoutPair) return { ...takeoutPair, source: 'takeout' }
  const exifPair = validCoordinatePair(exif.latitude, exif.longitude)
  if (exifPair) return { ...exifPair, source: 'exif' }
  return undefined
}

export function copyReusableMetadata(fresh: LiteMediaRecord, previous: LiteMediaRecord): LiteMediaRecord {
  return {
    ...fresh,
    metadataVersion: previous.metadataVersion,
    metadataStatus: 'reused',
    effectiveCaptureTime: previous.effectiveCaptureTime,
    captureTimeSource: previous.captureTimeSource,
    latitude: previous.latitude,
    longitude: previous.longitude,
    locationSource: previous.locationSource,
    width: previous.width,
    height: previous.height,
    cameraMake: previous.cameraMake,
    cameraModel: previous.cameraModel,
    takeoutSidecarPath: previous.takeoutSidecarPath,
    takeoutMatchConfidence: previous.takeoutMatchConfidence,
    sidecarFingerprint: previous.sidecarFingerprint,
    diagnostics: previous.diagnostics ?? []
  }
}

async function readExifMetadata(file: File): Promise<ParsedExifMetadata> {
  const result = await exifr.parse(file)
  if (!result || typeof result !== 'object') return {}
  const record = result as Record<string, unknown>
  const captureTime = normalizeExifTime(record.DateTimeOriginal)
    ?? normalizeExifTime(record.CreateDate)
    ?? normalizeExifTime(record.MediaCreateDate)
    ?? normalizeExifTime(record.ModifyDate)
  const coordinatePair = validCoordinatePair(numberOrUndefined(record.latitude), numberOrUndefined(record.longitude))
  const width = positiveInteger(record.ExifImageWidth) ?? positiveInteger(record.ImageWidth) ?? positiveInteger(record.PixelXDimension)
  const height = positiveInteger(record.ExifImageHeight) ?? positiveInteger(record.ImageHeight) ?? positiveInteger(record.PixelYDimension)
  const cameraMake = stringOrUndefined(record.Make)
  const cameraModel = stringOrUndefined(record.Model)

  return {
    ...(captureTime !== undefined ? { captureTime } : {}),
    ...(coordinatePair ?? {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(cameraMake ? { cameraMake } : {}),
    ...(cameraModel ? { cameraModel } : {})
  }
}

function normalizeExifTime(value: unknown): number | undefined {
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value
    return isValidTime(milliseconds) ? milliseconds : undefined
  }
  if (typeof value !== 'string' || !value.trim()) return undefined
  const direct = Date.parse(value)
  if (Number.isFinite(direct)) return direct
  const exifMatch = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!exifMatch) return undefined
  const [, year, month, day, hour, minute, second] = exifMatch
  const time = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime()
  return Number.isFinite(time) ? time : undefined
}

function isValidTime(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function validCoordinatePair(latitude: number | undefined, longitude: number | undefined): { latitude: number; longitude: number } | undefined {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return undefined
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined
  if (Math.abs(latitude) < 1e-9 && Math.abs(longitude) < 1e-9) return undefined
  return { latitude, longitude }
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function positiveInteger(value: unknown): number | undefined {
  const number = numberOrUndefined(value)
  return number !== undefined && number > 0 ? Math.round(number) : undefined
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}
