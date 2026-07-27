import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { protocol } from 'electron'
import { pathFromThumbnailUrl, resolveThumbnailPath, THUMBNAIL_PROTOCOL } from './thumbnailUrl'

export { THUMBNAIL_PROTOCOL }

export function registerThumbnailProtocol(cacheRoot: string): void {
  const root = resolve(cacheRoot)
  protocol.handle(THUMBNAIL_PROTOCOL, async (request) => {
    const filePath = pathFromThumbnailUrl(request.url)
    const safePath = filePath ? resolveThumbnailPath(root, filePath) : null
    if (!safePath || !existsSync(safePath)) {
      return new Response('Thumbnail not found', { status: 404 })
    }

    try {
      const data = await readFile(safePath)
      return new Response(data, {
        headers: {
          'content-type': 'image/webp',
          'cache-control': 'no-store'
        }
      })
    } catch {
      // A cache entry can disappear between existsSync and readFile. Keep the
      // custom protocol failure HTTP-shaped so Chromium reports a normal
      // image load failure instead of surfacing an unhandled handler error.
      return new Response('Thumbnail not found', { status: 404 })
    }
  })
}
