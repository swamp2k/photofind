import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ScanResult } from '../shared/types'

export const THUMBNAIL_PROTOCOL = 'photofind-thumb'

export function withElectronThumbnailUrls(result: ScanResult): ScanResult {
  return {
    ...result,
    thumbnails: {
      ...result.thumbnails,
      items: result.thumbnails.items.map((item) => ({
        ...item,
        thumbnailUrl: item.thumbnailPath ? thumbnailUrlForPath(item.thumbnailPath) : null
      }))
    }
  }
}

export function thumbnailUrlForPath(path: string): string {
  // Keep the Windows drive colon and separators inside one encoded path
  // segment. Chromium otherwise normalizes backslashes in custom-scheme URLs.
  return `${THUMBNAIL_PROTOCOL}://thumbnail/${encodeURIComponent(path)}`
}

export function pathFromThumbnailUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (
      parsed.protocol !== `${THUMBNAIL_PROTOCOL}:` ||
      parsed.hostname !== 'thumbnail' ||
      parsed.search ||
      parsed.hash
    ) return null

    const encoded = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
    if (!encoded) return null

    return encoded
  } catch {
    return null
  }
}

export function resolveThumbnailPath(cacheRoot: string, reference: string): string | null {
  const root = resolve(cacheRoot)
  const candidate = resolve(reference)
  const fromRoot = relative(root, candidate)

  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    return null
  }

  return candidate
}
