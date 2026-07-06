export const THUMBNAIL_PROTOCOL = 'photofind-thumb'

export function thumbnailUrlForPath(path: string): string {
  return `${THUMBNAIL_PROTOCOL}://thumbnail/${Buffer.from(path, 'utf-8').toString('base64url')}`
}

export function pathFromThumbnailUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const encoded = parsed.pathname.replace(/^\//, '')
    if (!encoded) return null
    return Buffer.from(encoded, 'base64url').toString('utf-8')
  } catch {
    return null
  }
}
