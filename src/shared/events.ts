import type { EventGroup, GpsCoordinates, SpecialDate } from './types'

/** Photos further apart in time than this start a new event. */
export const EVENT_GAP_MS = 4 * 60 * 60 * 1000
/** Consecutive photos further apart than this (when both have GPS) split too. */
export const EVENT_DISTANCE_KM = 25

export interface EventPhoto {
  mediaPath: string
  captureTimeMs: number | null
  gps: GpsCoordinates | null
}

export interface EventClustering {
  events: EventGroup[]
  /** Special-date labels per photo (photos outside events included) */
  photoLabels: Map<string, string[]>
  /** Photos without a usable capture time — never silently dropped */
  unclustered: string[]
}

/**
 * Pure clustering shared by main and renderer: sort by capture time, chain
 * photos into an event while the time gap stays within EVENT_GAP_MS and, when
 * both sides have GPS, the jump stays within EVENT_DISTANCE_KM. Missing GPS
 * never splits. Runs live in the renderer so editing special dates relabels
 * without a re-scan.
 *
 * Special-date matching uses local calendar dates, matching how EXIF capture
 * times are interpreted.
 */
export function clusterEvents(photos: EventPhoto[], specialDates: SpecialDate[]): EventClustering {
  const dated = photos.filter((photo) => photo.captureTimeMs !== null)
  const unclustered = photos.filter((photo) => photo.captureTimeMs === null).map((photo) => photo.mediaPath)
  const sorted = [...dated].sort((a, b) => a.captureTimeMs! - b.captureTimeMs!)

  const runs: EventPhoto[][] = []
  let run: EventPhoto[] = []
  for (const photo of sorted) {
    const previous = run[run.length - 1]
    if (previous && !splits(previous, photo)) {
      run.push(photo)
    } else {
      if (run.length > 0) runs.push(run)
      run = [photo]
    }
  }
  if (run.length > 0) runs.push(run)

  const events = runs.map((members, index): EventGroup => {
    const startMs = members[0].captureTimeMs!
    const endMs = members[members.length - 1].captureTimeMs!
    return {
      id: `event-${index}-${startMs}`,
      mediaPaths: members.map((member) => member.mediaPath),
      startMs,
      endMs,
      centroid: centroidOf(members),
      labels: labelsForRange(startMs, endMs, specialDates)
    }
  })

  const photoLabels = new Map<string, string[]>()
  for (const photo of dated) {
    const labels = labelsForRange(photo.captureTimeMs!, photo.captureTimeMs!, specialDates)
    if (labels.length > 0) photoLabels.set(photo.mediaPath, labels)
  }

  return { events, photoLabels, unclustered }
}

function splits(previous: EventPhoto, next: EventPhoto): boolean {
  if (next.captureTimeMs! - previous.captureTimeMs! > EVENT_GAP_MS) return true
  if (previous.gps && next.gps && haversineKm(previous.gps, next.gps) > EVENT_DISTANCE_KM) return true
  return false
}

export function haversineKm(a: GpsCoordinates, b: GpsCoordinates): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function centroidOf(members: EventPhoto[]): GpsCoordinates | null {
  const located = members.filter((member) => member.gps !== null)
  if (located.length === 0) return null
  return {
    lat: located.reduce((sum, member) => sum + member.gps!.lat, 0) / located.length,
    lon: located.reduce((sum, member) => sum + member.gps!.lon, 0) / located.length
  }
}

function labelsForRange(startMs: number, endMs: number, specialDates: SpecialDate[]): string[] {
  const labels: string[] = []
  for (const date of specialDates) {
    if (date.kind === 'range') {
      if (date.startMs <= endMs && date.endMs >= startMs) labels.push(date.label)
    } else if (recurringMatches(startMs, endMs, date.month, date.day)) {
      labels.push(date.label)
    }
  }
  return labels
}

function recurringMatches(startMs: number, endMs: number, month: number, day: number): boolean {
  // Walk local calendar days across the range (capped for absurd spans).
  const cursor = new Date(startMs)
  cursor.setHours(0, 0, 0, 0)
  for (let i = 0; i < 400 && cursor.getTime() <= endMs; i++) {
    if (cursor.getMonth() + 1 === month && cursor.getDate() === day) return true
    cursor.setDate(cursor.getDate() + 1)
  }
  return false
}
