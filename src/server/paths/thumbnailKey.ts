const THUMBNAIL_KEY = /^[a-f0-9]{24}\.webp$/i
export function validateThumbnailKey(value: string): string {
  let decoded: string
  try { decoded = decodeURIComponent(value) } catch { throw new Error('Invalid thumbnail key') }
  if (!THUMBNAIL_KEY.test(decoded) || decoded.includes('/') || decoded.includes('\\')) throw new Error('Invalid thumbnail key')
  return decoded.toLowerCase()
}
export const isValidThumbnailKey = (value: string): boolean => { try { validateThumbnailKey(value); return true } catch { return false } }
