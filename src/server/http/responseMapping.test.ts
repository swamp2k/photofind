import { describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RootPolicy } from '../paths/rootPolicy'
import { mapExportResult, mapRepairResult, mapScanResult } from './responseMapping'

describe('browser response mapping', () => {
  it('sanitizes repair log paths', () => {
    const result = mapRepairResult({ attempted: 1, repaired: 0, failed: 1, log: [{ level: 'ERROR', message: 'failed to repair C:\\private\\photo.jpg', timestamp: 1 }] })
    expect(result.log[0].message).not.toContain('C:\\private')
    expect(result.log[0].message).toContain('[path omitted]')
  })
  it('strips internal paths and exposes scoped media and HTTP thumbnail references', async () => {
    const base = await mkdtemp(join(tmpdir(), 'photofind-map-'))
    try {
      const photos = join(base, 'photos')
      const inbox = join(base, 'inbox')
      const exports = join(base, 'exports')
      const cache = join(base, 'cache')
      await Promise.all([mkdir(photos), mkdir(inbox), mkdir(exports), mkdir(cache)])
      await Promise.all([
        writeFile(join(photos, 'a.jpg'), 'x'),
        writeFile(join(photos, 'a.json'), '{}'),
        writeFile(join(photos, 'b.json'), '{}'),
        writeFile(join(exports, 'report.json'), '{}'),
        writeFile(join(exports, 'a.jpg'), 'x')
      ])
      const policy = new RootPolicy({ photos, inbox, exports })
      const result = await mapScanResult({
        summary: { totalFiles: 1, images: 1, raw: 0, videos: 0, sidecars: 0, unknown: 0, safeMatches: 0, uncertainMatches: 0, missingMatches: 0 },
        matches: [{ media: { path: join(photos, 'a.jpg'), name: 'a.jpg', kind: 'image', sizeBytes: 1 }, sidecar: { path: join(photos, 'a.json'), name: 'a.json', kind: 'sidecar', sizeBytes: 2 }, alternateSidecars: [{ path: join(photos, 'b.json'), name: 'b.json', kind: 'sidecar', sizeBytes: 2 }], confidence: 'uncertain', reason: `failed at ${join(photos, 'a.jpg')}` }],
        thumbnails: { generated: 1, reused: 0, failed: 0, skipped: 0, items: [{ mediaPath: join(photos, 'a.jpg'), thumbnailPath: join(cache, '0123456789abcdef01234567.webp'), thumbnailUrl: null, status: 'ready', reason: `cache ${join(cache, 'bad.webp')}` }], log: [{ level: 'ERROR', message: `read ${join(photos, 'a.jpg')}`, timestamp: 1 }] },
        keepers: [join(photos, 'a.jpg')], log: [{ level: 'ERROR', message: `scan ${join(photos, 'a.jpg')}`, timestamp: 1 }]
      }, policy)
      expect(JSON.stringify(result)).not.toContain(base)
      expect(result.matches[0].media.path).toBe('photofind://photos/a.jpg')
      expect(result.thumbnails.items[0].thumbnailPath).toBeNull()
      expect(result.thumbnails.items[0].thumbnailUrl).toBe('/api/thumbnails/0123456789abcdef01234567.webp')
      expect(JSON.stringify(result)).not.toContain(base)
      const exported = await mapExportResult({ attempted: 1, exported: 1, failed: 0, destinationRoot: exports, reportPath: join(exports, 'report.json'), files: [{ sourcePath: join(photos, 'a.jpg'), outputPath: join(exports, 'a.jpg'), status: 'exported' }], log: [] }, policy)
      expect(exported.destinationRoot).toBe('photofind://exports')
      expect(exported.reportPath).toContain('photofind://exports')
      expect(exported.files[0].sourcePath).toContain('photofind://photos')
      expect(exported.files[0].outputPath).toContain('photofind://exports')
      await expect(mapExportResult({ attempted: 0, exported: 0, failed: 0, destinationRoot: base, reportPath: join(exports, 'report.json'), files: [], log: [] }, policy)).rejects.toThrow()
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
