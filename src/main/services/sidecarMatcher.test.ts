import { describe, expect, it } from 'vitest'
import type { ScannedFile } from '../../shared/types'
import { matchSidecars } from './sidecarMatcher'

function file(name: string, kind: ScannedFile['kind'] = 'image'): ScannedFile {
  return { path: `/lib/${name}`, name, kind, sizeBytes: 1000, mtimeMs: 0 }
}

describe('matchSidecars', () => {
  it('matches an exact filename sidecar', () => {
    const [match] = matchSidecars([file('IMG_1234.JPG'), file('IMG_1234.JPG.json', 'sidecar')])
    expect(match.confidence).toBe('safe')
    expect(match.sidecar?.name).toBe('IMG_1234.JPG.json')
  })

  it('matches the supplemental-metadata suffix variant', () => {
    const [match] = matchSidecars([
      file('IMG_5555.HEIC'),
      file('IMG_5555.HEIC.supplemental-metadata.json', 'sidecar')
    ])
    expect(match.confidence).toBe('safe')
    expect(match.reason).toContain('supplemental-metadata')
  })

  it('resolves relocated duplicate counters', () => {
    const [match] = matchSidecars([file('IMG_1234(1).JPG'), file('IMG_1234.JPG(1).json', 'sidecar')])
    expect(match.confidence).toBe('safe')
    expect(match.sidecar?.name).toBe('IMG_1234.JPG(1).json')
  })

  it('lets an edited copy reuse the original sidecar', () => {
    const results = matchSidecars([
      file('IMG_9999.JPG'),
      file('IMG_9999-edited.JPG'),
      file('IMG_9999.JPG.json', 'sidecar')
    ])
    const edited = results.find((r) => r.media.name === 'IMG_9999-edited.JPG')
    expect(edited?.confidence).toBe('safe')
    expect(edited?.sidecar?.name).toBe('IMG_9999.JPG.json')
  })

  it('flags a truncated name as an uncertain single-candidate match', () => {
    const longName = 'a_very_long_filename_that_google_will_truncate_eventually.jpg'
    const truncatedSidecar = 'a_very_long_filename_that_google_will_trunc.json'
    const [match] = matchSidecars([file(longName), file(truncatedSidecar, 'sidecar')])
    expect(match.confidence).toBe('uncertain')
  })

  it('flags ambiguous matches when multiple sidecars could apply', () => {
    const [match] = matchSidecars([
      file('trip_photo_from_summer_vacation.jpg'),
      file('trip_photo_from_summer_va.json', 'sidecar'),
      file('trip_photo_from_summer_vac.json', 'sidecar')
    ])
    expect(match.confidence).toBe('uncertain')
    expect(match.alternateSidecars?.length).toBe(1)
  })

  it('reports missing when no sidecar exists', () => {
    const [match] = matchSidecars([file('IMG_0001.JPG')])
    expect(match.confidence).toBe('missing')
    expect(match.sidecar).toBeNull()
  })

  it('does not treat sidecars or unknown files as media to match', () => {
    const results = matchSidecars([
      file('IMG_1234.JPG'),
      file('IMG_1234.JPG.json', 'sidecar'),
      file('notes.txt', 'unknown')
    ])
    expect(results).toHaveLength(1)
    expect(results[0].media.name).toBe('IMG_1234.JPG')
  })
})
