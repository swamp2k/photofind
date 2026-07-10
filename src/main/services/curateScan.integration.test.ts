import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import type { ScanProgressEvent } from '../../shared/types'
import { createCurateFixture } from '../test/curateFixture'
import { runCurateScan } from './curateScan'
import { disposeExiftool } from './exiftoolClient'

afterAll(async () => {
  await disposeExiftool()
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

      // Progress: all events share the scan id, phases run in order and end done.
      expect(events.length).toBeGreaterThan(0)
      expect(new Set(events.map((event) => event.scanId)).size).toBe(1)
      const phases = events.map((event) => event.phase)
      expect(phases[phases.length - 1]).toBe('done')
      const order = ['scanning', 'metadata', 'thumbnails', 'analyzing', 'grouping', 'done']
      expect([...new Set(phases)].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(
        order.filter((phase) => phases.includes(phase as ScanProgressEvent['phase']))
      )
      // Within a phase, processed counts never decrease.
      for (const phase of new Set(phases)) {
        const counts = events.filter((event) => event.phase === phase).map((event) => event.processed)
        expect([...counts].sort((a, b) => a - b)).toEqual(counts)
      }
    } finally {
      await rm(cacheRoot, { recursive: true, force: true })
      await fixture.cleanup()
    }
  }, 60000)
})
