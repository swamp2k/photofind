import { describe, expect, it } from 'vitest'
import { matchTakeoutSidecars, parseTakeoutJson } from './takeout'
import type { LiteMediaKind, LiteMediaRecord } from './types'

function record(path: string, kind: LiteMediaKind): LiteMediaRecord {
  return {
    id: `lib:${path}`,
    libraryId: 'lib',
    relativePath: path,
    name: path.split('/').at(-1) ?? path,
    kind,
    sizeBytes: 100,
    lastModified: 1_700_000_000_000,
    mimeType: ''
  }
}

describe('Takeout sidecar matching', () => {
  it('matches exact and supplemental filenames', () => {
    const photo = record('Trip/IMG_1.JPG', 'image')
    const exact = record('Trip/IMG_1.JPG.json', 'sidecar')
    const matches = matchTakeoutSidecars([photo, exact])
    expect(matches.get(photo.id)?.sidecar?.relativePath).toBe(exact.relativePath)
    expect(matches.get(photo.id)?.confidence).toBe('safe')

    const second = record('Trip/IMG_2.JPG', 'image')
    const supplemental = record('Trip/IMG_2.JPG.supplemental-metadata.json', 'sidecar')
    const supplementalMatches = matchTakeoutSidecars([second, supplemental])
    expect(supplementalMatches.get(second.id)?.sidecar?.relativePath).toBe(supplemental.relativePath)
  })

  it('handles relocated counters and edited copies', () => {
    const duplicate = record('Trip/IMG_1(2).JPG', 'image')
    const duplicateSidecar = record('Trip/IMG_1.JPG(2).json', 'sidecar')
    const edited = record('Trip/IMG_7-edited.JPG', 'image')
    const editedSidecar = record('Trip/IMG_7.JPG.json', 'sidecar')
    const matches = matchTakeoutSidecars([duplicate, duplicateSidecar, edited, editedSidecar])
    expect(matches.get(duplicate.id)?.sidecar?.relativePath).toBe(duplicateSidecar.relativePath)
    expect(matches.get(edited.id)?.sidecar?.relativePath).toBe(editedSidecar.relativePath)
  })

  it('keeps ambiguous truncated matches uncertain', () => {
    const photo = record('Trip/a-very-long-photo-name.jpg', 'image')
    const first = record('Trip/a-very-long-photo.json', 'sidecar')
    const second = record('Trip/a-very-long-photo-name-.json', 'sidecar')
    const match = matchTakeoutSidecars([photo, first, second]).get(photo.id)
    expect(match?.confidence).toBe('uncertain')
    expect(match?.alternateSidecars?.length).toBe(1)
  })
})

describe('Takeout metadata parsing', () => {
  it('parses capture time and meaningful GPS', () => {
    const metadata = parseTakeoutJson({
      photoTakenTime: { timestamp: '1700000000' },
      geoData: { latitude: 56.2, longitude: 10.6 }
    })
    expect(metadata.captureTime).toBe(1_700_000_000_000)
    expect(metadata.latitude).toBe(56.2)
    expect(metadata.longitude).toBe(10.6)
  })

  it('ignores Takeout zero coordinates', () => {
    const metadata = parseTakeoutJson({ geoData: { latitude: 0, longitude: 0 } })
    expect(metadata.latitude).toBeUndefined()
    expect(metadata.longitude).toBeUndefined()
  })
})
