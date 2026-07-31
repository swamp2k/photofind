import type { LiteMediaRecord, LiteTakeoutMatchConfidence } from './types'

const EDITED_SUFFIXES = ['-edited', '(edited)', '-modified', '-effects']

export interface LiteTakeoutMatch {
  media: LiteMediaRecord
  sidecar: LiteMediaRecord | null
  confidence: LiteTakeoutMatchConfidence
  reason: string
  alternateSidecars?: LiteMediaRecord[]
}

export interface ParsedTakeoutMetadata {
  captureTime?: number
  latitude?: number
  longitude?: number
}

export function matchTakeoutSidecars(records: LiteMediaRecord[]): Map<string, LiteTakeoutMatch> {
  const byDirectory = new Map<string, LiteMediaRecord[]>()
  for (const record of records) {
    const directory = directoryOf(record.relativePath)
    const list = byDirectory.get(directory) ?? []
    list.push(record)
    byDirectory.set(directory, list)
  }

  const matches = new Map<string, LiteTakeoutMatch>()
  for (const directoryRecords of byDirectory.values()) {
    const media = directoryRecords.filter((record) => record.kind !== 'sidecar' && record.kind !== 'unknown')
    const sidecars = directoryRecords.filter(
      (record) => record.kind === 'sidecar' && record.name.toLowerCase().endsWith('.json')
    )
    const sidecarByName = new Map(sidecars.map((record) => [record.name.toLowerCase(), record]))

    for (const mediaRecord of media) {
      matches.set(mediaRecord.id, matchOne(mediaRecord, sidecars, sidecarByName))
    }
  }

  return matches
}

export function parseTakeoutJson(value: unknown): ParsedTakeoutMetadata {
  if (!isRecord(value)) return {}
  const photoTakenTime = isRecord(value.photoTakenTime) ? value.photoTakenTime : undefined
  const creationTime = isRecord(value.creationTime) ? value.creationTime : undefined
  const captureTime = parseTimestamp(photoTakenTime?.timestamp) ?? parseTimestamp(creationTime?.timestamp)

  const exifGeo = parseGeo(value.geoDataExif)
  const regularGeo = parseGeo(value.geoData)
  const geo = exifGeo ?? regularGeo

  return {
    ...(captureTime !== undefined ? { captureTime } : {}),
    ...(geo ? { latitude: geo.latitude, longitude: geo.longitude } : {})
  }
}

export async function readTakeoutMetadata(file: File): Promise<ParsedTakeoutMetadata> {
  const text = await file.text()
  return parseTakeoutJson(JSON.parse(text) as unknown)
}

function matchOne(
  media: LiteMediaRecord,
  sidecars: LiteMediaRecord[],
  sidecarByName: Map<string, LiteMediaRecord>
): LiteTakeoutMatch {
  const lowerName = media.name.toLowerCase()

  const exact = sidecarByName.get(`${lowerName}.json`)
  if (exact) return matched(media, exact, 'safe', 'exact filename match')

  const supplemental = sidecarByName.get(`${lowerName}.supplemental-metadata.json`)
  if (supplemental) return matched(media, supplemental, 'safe', 'supplemental-metadata filename match')

  const { base, counter } = splitCounter(media.name)
  if (counter !== null) {
    const relocated = sidecarByName.get(`${base.toLowerCase()}(${counter}).json`)
    if (relocated) return matched(media, relocated, 'safe', 'relocated duplicate counter match')
  }

  const editedBase = stripEditedSuffix(media.name)
  if (editedBase) {
    const original = sidecarByName.get(`${editedBase.toLowerCase()}.json`)
    if (original) return matched(media, original, 'safe', 'edited copy reusing original metadata')
  }

  const candidates = sidecars.filter((sidecar) => {
    const sidecarBase = sidecarBaseName(sidecar.name).toLowerCase()
    return sidecarBase.length >= 5 && (lowerName.startsWith(sidecarBase) || sidecarBase.startsWith(lowerName))
  })

  if (candidates.length === 1) {
    return matched(media, candidates[0], 'uncertain', 'unique truncated filename match')
  }

  if (candidates.length > 1) {
    return {
      media,
      sidecar: candidates[0],
      confidence: 'uncertain',
      reason: `${candidates.length} possible JSON sidecars; ambiguous`,
      alternateSidecars: candidates.slice(1)
    }
  }

  return { media, sidecar: null, confidence: 'missing', reason: 'no matching JSON sidecar' }
}

function matched(
  media: LiteMediaRecord,
  sidecar: LiteMediaRecord,
  confidence: LiteTakeoutMatchConfidence,
  reason: string
): LiteTakeoutMatch {
  return { media, sidecar, confidence, reason }
}

function splitCounter(name: string): { base: string; counter: number | null } {
  const match = name.match(/^(.*)\((\d+)\)(\.[^.]*)?$/)
  if (!match) return { base: name, counter: null }
  const [, stem, counter, extension] = match
  return { base: `${stem}${extension ?? ''}`, counter: Number(counter) }
}

function stripEditedSuffix(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  const stem = name.slice(0, dot)
  const extension = name.slice(dot)
  for (const suffix of EDITED_SUFFIXES) {
    if (stem.toLowerCase().endsWith(suffix)) {
      return `${stem.slice(0, stem.length - suffix.length)}${extension}`
    }
  }
  return null
}

function sidecarBaseName(name: string): string {
  return name
    .replace(/\.supplemental-metadata\.json$/i, '')
    .replace(/\.supplemental-meta.*\.json$/i, '')
    .replace(/\.json$/i, '')
}

function directoryOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/')
  return slash < 0 ? '' : relativePath.slice(0, slash)
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric
  return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : undefined
}

function parseGeo(value: unknown): { latitude: number; longitude: number } | undefined {
  if (!isRecord(value)) return undefined
  const latitude = Number(value.latitude)
  const longitude = Number(value.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined
  if (Math.abs(latitude) < 1e-9 && Math.abs(longitude) < 1e-9) return undefined
  return { latitude, longitude }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
