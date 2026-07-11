import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import { clusterEvents } from '../../shared/events'
import type { ScanProgressEvent, SpecialDate } from '../../shared/types'
import { createCurateFixture, FIXTURE_GPS_LA, FIXTURE_GPS_SF } from '../test/curateFixture'
import { runCurateScan } from './curateScan'
import { disposeExiftool } from './exiftoolClient'
import { disposeFaceEngine } from './faceEngine'

afterAll(async () => {
  await Promise.allSettled([disposeExiftool(), disposeFaceEngine()])
})

describe('runCurateScan', () => {
  it('analyzes a folder end to end: bursts, verdicts, progress, failures', async () => {
    const fixture = await createCurateFixture()
    const cacheRoot = await mkdtemp(join(tmpdir(), 'photofind-curate-cache-'))
    try {
      const events: ScanProgressEvent[] = []
      const result = await runCurateScan(fixture.root, {
        thumbnailCacheRoot: cacheRoot,
        onProgress: (event) => events.push(event)
      })

      const byPath = new Map(result.photos.map((photo) => [photo.media.path, photo]))

      // The four-shot burst groups together; the sharpest frame is the pick.
      expect(result.bursts).toHaveLength(1)
      expect(result.bursts[0].mediaPaths).toEqual(fixture.paths.burst)
      expect(result.bursts[0].pickPath).toBe(fixture.paths.burst[1])
      expect(byPath.get(fixture.paths.burst[1])!.suggestedVerdict).toBe('keep')
      expect(byPath.get(fixture.paths.burst[0])!.suggestedVerdict).toBe('discard')
      // The control shot ten minutes later stays out of the burst.
      expect(byPath.get(fixture.paths.afterBurst)!.burstId).toBeNull()

      // Quality verdicts with visible reasons.
      expect(byPath.get(fixture.paths.sharpNoise)!.suggestedVerdict).toBe('keep')
      expect(byPath.get(fixture.paths.blurred)!.suggestedVerdict).toBe('discard')
      expect(byPath.get(fixture.paths.blurred)!.reasons).toContain('blurry')
      expect(byPath.get(fixture.paths.corrupt)!.suggestedVerdict).toBe('maybe')
      expect(byPath.get(fixture.paths.corrupt)!.reasons[0]).toContain("couldn't analyze")

      // Summary counts add up and failures are visible.
      expect(result.summary.analyzed).toBe(result.photos.length)
      expect(result.summary.keep + result.summary.maybe + result.summary.discard).toBe(result.summary.analyzed)
      expect(result.summary.failed).toBeGreaterThan(0)
      expect(result.log.some((entry) => entry.level === 'WARN' && entry.message.includes(fixture.paths.corrupt))).toBe(true)

      // Faces ran (or were skipped visibly); noise fixtures contain no faces.
      const faceStatuses = new Set(result.photos.map((photo) => photo.faces.status))
      expect([...faceStatuses].every((status) => ['ok', 'failed', 'skipped'].includes(status))).toBe(true)
      if (faceStatuses.has('ok')) {
        expect(byPath.get(fixture.paths.sharpNoise)!.faces.count).toBe(0)
        expect(result.faceData.has(fixture.paths.sharpNoise)).toBe(true)
      }
      expect(result.summary.withFaces).toBe(0)

      // Progress: all events share the scan id, phases run in order and end done.
      expect(events.length).toBeGreaterThan(0)
      expect(new Set(events.map((event) => event.scanId)).size).toBe(1)
      const phases = events.map((event) => event.phase)
      expect(phases[phases.length - 1]).toBe('done')
      const order = ['scanning', 'metadata', 'thumbnails', 'analyzing', 'faces', 'grouping', 'done']
      expect([...new Set(phases)].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(
        order.filter((phase) => phases.includes(phase as ScanProgressEvent['phase']))
      )
      // Within a phase, processed counts never decrease.
      for (const phase of new Set(phases)) {
        const counts = events.filter((event) => event.phase === phase).map((event) => event.processed)
        expect([...counts].sort((a, b) => a - b)).toEqual(counts)
      }

      // Events over the scan: the June 1 SF morning (burst + control shot)
      // labeled by a recurring birthday, and the July 4 LA vacation pair —
      // split by both the time gap and the 25km rule.
      const birthday: SpecialDate = { id: 'b', label: 'Birthday', kind: 'recurring-yearly', month: 6, day: 1 }
      const clustering = clusterEvents(
        result.photos.map((photo) => ({
          mediaPath: photo.media.path,
          captureTimeMs: photo.capture.captureTimeMs,
          gps: photo.capture.gps
        })),
        [birthday]
      )
      const sfEvent = clustering.events.find((event) => event.mediaPaths.includes(fixture.paths.burst[0]))!
      expect(sfEvent.mediaPaths).toEqual([...fixture.paths.burst, fixture.paths.afterBurst])
      expect(sfEvent.labels).toEqual(['Birthday'])
      expect(sfEvent.centroid!.lat).toBeCloseTo(FIXTURE_GPS_SF.lat, 2)

      const laEvent = clustering.events.find((event) => event.mediaPaths.includes(fixture.paths.vacation[0]))!
      expect(laEvent.mediaPaths).toEqual(fixture.paths.vacation)
      expect(laEvent.labels).toEqual([])
      expect(laEvent.centroid!.lon).toBeCloseTo(FIXTURE_GPS_LA.lon, 2)
      expect(laEvent.id).not.toBe(sfEvent.id)
    } finally {
      await rm(cacheRoot, { recursive: true, force: true })
      await fixture.cleanup()
    }
  }, 60000)
})
