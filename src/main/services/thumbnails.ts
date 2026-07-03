import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import sharp from 'sharp'

const THUMB_SIZE = 320

export async function generateThumbnail(sourcePath: string): Promise<string> {
  const dir = join(app.getPath('userData'), 'thumbnails')
  await mkdir(dir, { recursive: true })
  const hash = createHash('sha1').update(sourcePath).digest('hex')
  const destPath = join(dir, `${hash}.jpg`)
  await sharp(sourcePath)
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside' })
    .jpeg({ quality: 75 })
    .toFile(destPath)
  return destPath
}
