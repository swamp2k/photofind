import { describe, expect, it } from 'vitest'
import { clusterEvents, EVENT_GAP_MS, haversineKm, type EventPhoto } from './events'
import type { SpecialDate } from './types'

const SF = { lat: 37.7749, lon: -122.4194 }
const LA = { lat: 34.0522, lon: -118.2437 }
const SF_NEARBY = { lat: 37.78, lon: -122.41 }

// 2024-06-01 12:00 local
const T0 = new Date(2024, 5, 1, 12, 0, 0).getTime()

function photo(path: string, timeMs: number | null, gps: EventPhoto['gps'] = null): EventPhoto {
  return { mediaPath: path, captureTimeMs: timeMs, gps }
}

describe('clusterEvents', () => {
  it('splits on time gaps and keeps close photos together', () => {
    const { events } = clusterEvents(
      [
        photo('/a.jpg', T0),
        photo('/b.jpg', T0 + 60_000),
        photo('/c.jpg', T0 + EVENT_GAP_MS + 61_000)
      ],
      []
    )
    expect(events).toHaveLength(2)
    expect(events[0].mediaPaths).toEqual(['/a.jpg', '/b.jpg'])
    expect(events[1].mediaPaths).toEqual(['/c.jpg'])
  })

  it('splits on GPS distance even within the time gap', () => {
    const { events } = clusterEvents(
      [photo('/sf.jpg', T0, SF), photo('/la.jpg', T0 + 60_000, LA)],
      []
    )
    expect(events).toHaveLength(2)
  })

  it('never splits on missing GPS and averages a centroid from located members', () => {
    const { events } = clusterEvents(
      [photo('/a.jpg', T0, SF), photo('/b.jpg', T0 + 1000, null), photo('/c.jpg', T0 + 2000, SF_NEARBY)],
      []
    )
    expect(events).toHaveLength(1)
    expect(events[0].centroid!.lat).toBeCloseTo((SF.lat + SF_NEARBY.lat) / 2, 5)
    expect(events[0].centroid!.lon).toBeCloseTo((SF.lon + SF_NEARBY.lon) / 2, 5)

    const { events: unlocated } = clusterEvents([photo('/x.jpg', T0)], [])
    expect(unlocated[0].centroid).toBeNull()
  })

  it('labels events and photos from recurring and range special dates', () => {
    const dates: SpecialDate[] = [
      { id: '1', label: 'Birthday', kind: 'recurring-yearly', month: 6, day: 1 },
      { id: '2', label: 'Road trip', kind: 'range', startMs: T0 - 86_400_000, endMs: T0 + 86_400_000 },
      { id: '3', label: 'Christmas', kind: 'recurring-yearly', month: 12, day: 24 }
    ]
    const { events, photoLabels } = clusterEvents([photo('/a.jpg', T0), photo('/b.jpg', T0 + 1000)], dates)

    expect(events[0].labels).toEqual(['Birthday', 'Road trip'])
    expect(photoLabels.get('/a.jpg')).toEqual(['Birthday', 'Road trip'])
  })

  it('matches a recurring date that falls mid-event', () => {
    // Event spans May 31 → June 2; June 1 birthday is inside.
    const start = new Date(2024, 4, 31, 22, 0, 0).getTime()
    const dates: SpecialDate[] = [{ id: '1', label: 'Birthday', kind: 'recurring-yearly', month: 6, day: 1 }]
    const { events } = clusterEvents(
      [photo('/a.jpg', start), photo('/b.jpg', start + EVENT_GAP_MS - 1000), photo('/c.jpg', start + 2 * (EVENT_GAP_MS - 1000))],
      dates
    )
    expect(events).toHaveLength(1)
    expect(events[0].labels).toEqual(['Birthday'])
  })

  it('collects photos without capture time as unclustered, never dropping them', () => {
    const { events, unclustered } = clusterEvents([photo('/a.jpg', T0), photo('/lost.jpg', null)], [])
    expect(events).toHaveLength(1)
    expect(unclustered).toEqual(['/lost.jpg'])
  })

  it('produces deterministic ids across runs', () => {
    const input = [photo('/a.jpg', T0), photo('/b.jpg', T0 + 1000)]
    expect(clusterEvents(input, []).events[0].id).toBe(clusterEvents(input, []).events[0].id)
  })
})

describe('haversineKm', () => {
  it('measures SF to LA at roughly 559km', () => {
    expect(haversineKm(SF, LA)).toBeGreaterThan(540)
    expect(haversineKm(SF, LA)).toBeLessThan(580)
  })
})
