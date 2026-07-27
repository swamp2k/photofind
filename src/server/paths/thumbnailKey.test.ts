import { describe, expect, it } from 'vitest'
import { isValidThumbnailKey, validateThumbnailKey } from './thumbnailKey'
describe('thumbnail keys', () => {
  it('accepts only canonical hash webp names', () => {
    expect(validateThumbnailKey('0123456789abcdef01234567.webp')).toBe('0123456789abcdef01234567.webp')
    expect(isValidThumbnailKey('../secret.webp')).toBe(false)
    expect(isValidThumbnailKey('0123456789abcdef01234567.jpg')).toBe(false)
    expect(isValidThumbnailKey('0123456789abcdef01234567.webp%2f..')).toBe(false)
  })
})
