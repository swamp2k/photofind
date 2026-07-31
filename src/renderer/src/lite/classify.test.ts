import { describe, expect, it } from 'vitest'
import { classifyMedia } from './classify'

describe('classifyMedia', () => {
  it('classifies common photo, raw, video and sidecar formats', () => {
    expect(classifyMedia('photo.JPG')).toBe('image')
    expect(classifyMedia('capture.CR3')).toBe('raw')
    expect(classifyMedia('clip.WebM')).toBe('video')
    expect(classifyMedia('photo.JPG.supplemental-metadata.json')).toBe('sidecar')
  })

  it('keeps unknown files visible to diagnostics', () => {
    expect(classifyMedia('notes.txt')).toBe('unknown')
  })
})
