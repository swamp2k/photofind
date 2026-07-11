import { afterAll, describe, expect, it } from 'vitest'
import type { ScannedFile } from '../../shared/types'
import { createCurateFixture } from '../test/curateFixture'
import { detectFaces } from './faceDetection'
import { disposeExiftool } from './exiftoolClient'
import { disposeFaceEngine, loadFaceEngine, type DetectedFace, type FaceEngine } from './faceEngine'
import { scanDirectory } from './scanner'

afterAll(async () => {
  await Promise.allSettled([disposeExiftool(), disposeFaceEngine()])
})

function file(path: string, kind: ScannedFile['kind'] = 'image'): ScannedFile {
  return { path, name: path.slice(1), kind, sizeBytes: 100, mtimeMs: 0 }
}

function face(x: number, size: number): DetectedFace {
  return {
    box: { x, y: 0.1, width: size, height: size },
    score: 0.9,
    embedding: new Float32Array(128)
  }
}

describe('detectFaces (stub engine)', () => {
  it('summarizes counts and largest fraction, skipping non-images', async () => {
    const engine: FaceEngine = {
      detect: async (path) => (path === '/two.jpg' ? [face(0.1, 0.2), face(0.5, 0.4)] : [])
    }
    const result = await detectFaces([file('/two.jpg'), file('/none.jpg'), file('/clip.mp4', 'video')], { engine })

    expect(result.items).toHaveLength(2)
    const two = result.items.find((item) => item.mediaPath === '/two.jpg')!
    expect(two.status).toBe('ok')
    expect(two.count).toBe(2)
    expect(two.largestFraction).toBeCloseTo(0.16, 5)
    expect(two.faces[0]).not.toHaveProperty('embedding')
    expect(result.detections.get('/two.jpg')).toHaveLength(2)

    const none = result.items.find((item) => item.mediaPath === '/none.jpg')!
    expect(none.count).toBe(0)
  })

  it('isolates per-photo failures with a WARN instead of aborting', async () => {
    const engine: FaceEngine = {
      detect: async (path) => {
        if (path === '/bad.jpg') throw new Error('decode exploded')
        return [face(0.2, 0.3)]
      }
    }
    const result = await detectFaces([file('/bad.jpg'), file('/good.jpg')], { engine })

    const bad = result.items.find((item) => item.mediaPath === '/bad.jpg')!
    expect(bad.status).toBe('failed')
    expect(bad.reason).toContain('decode exploded')
    expect(result.items.find((item) => item.mediaPath === '/good.jpg')!.status).toBe('ok')
    expect(result.log.some((entry) => entry.level === 'WARN' && entry.message.includes('decode exploded'))).toBe(true)
  })

  it('marks everything skipped with one WARN when the engine is unavailable', async () => {
    const seen: number[] = []
    const result = await detectFaces([file('/a.jpg'), file('/b.jpg')], {
      engine: null,
      onProgress: (processed) => seen.push(processed)
    })

    expect(result.items.every((item) => item.status === 'skipped')).toBe(true)
    expect(result.log.filter((entry) => entry.level === 'WARN')).toHaveLength(1)
    expect(seen).toEqual([1, 2])
  })
})

describe('detectFaces (real engine)', () => {
  it('loads the shipped models and finds no faces in noise fixtures', async () => {
    const engine = await loadFaceEngine()
    if (!engine) {
      // Environment without usable wasm/models — the null path is covered above.
      console.warn('face engine unavailable; skipping real-engine integration test')
      return
    }

    const fixture = await createCurateFixture()
    try {
      const files = await scanDirectory(fixture.root)
      const target = files.filter((f) => [fixture.paths.sharpNoise, fixture.paths.dark].includes(f.path))
      const result = await detectFaces(target, { engine })

      for (const item of result.items) {
        expect(item.status).toBe('ok')
        expect(item.count).toBe(0)
      }
      // Positive detection on real photos is a manual verification step —
      // procedurally drawn faces are not reliably detected.
    } finally {
      await fixture.cleanup()
    }
  }, 120000)
})
