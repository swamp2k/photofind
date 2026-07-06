import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { protocol } from 'electron'
import { pathFromThumbnailUrl, THUMBNAIL_PROTOCOL } from './thumbnailUrl'

export { THUMBNAIL_PROTOCOL }

export function registerThumbnailProtocol(): void {
  protocol.handle(THUMBNAIL_PROTOCOL, async (request) => {
    const filePath = pathFromThumbnailUrl(request.url)
    if (!filePath || !existsSync(filePath)) {
      return new Response('Thumbnail not found', { status: 404 })
    }

    const data = await readFile(filePath)
    return new Response(data, {
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'no-store'
      }
    })
  })
}
