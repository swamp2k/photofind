import { createHash } from 'node:crypto'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { LogEntry, MediaThumbnail, ScannedFile, ThumbnailResult } from '../../shared/types'
import { thumbnailUrlForPath } from './thumbnailUrl'

export interface ThumbnailOptions {
  cacheRoot: string
  size?: number
  onProgress?: (processed: number, total: number, currentFile: string) => void
}

const DEFAULT_SIZE = 320

export async function generateThumbnails(files: ScannedFile[], options: ThumbnailOptions): Promise<ThumbnailResult> {
  const size = options.size ?? DEFAULT_SIZE
  const media = files.filter((file) => file.kind === 'image')
  const items: MediaThumbnail[] = []
  const log: LogEntry[] = []
  let generated = 0
  let reused = 0
  let failed = 0
  let processed = 0

  await mkdir(options.cacheRoot, { recursive: true })

  for (const file of media) {
    const thumbnailPath = thumbnailPathFor(file, options.cacheRoot, size)
    try {
      const cached = await existingFile(thumbnailPath)
      if (cached) {
        reused++
        items.push({
          mediaPath: file.path,
          thumbnailPath,
          thumbnailUrl: thumbnailUrlForPath(thumbnailPath),
          status: 'ready'
        })
        log.push(logEntry('INFO', `${file.name}: reused thumbnail`))
      } else {
        const info = await sharp(file.path)
          .rotate()
          .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78 })
          .toFile(thumbnailPath)

        generated++
        items.push({
          mediaPath: file.path,
          thumbnailPath,
          thumbnailUrl: thumbnailUrlForPath(thumbnailPath),
          status: 'ready',
          width: info.width,
          height: info.height
        })
        log.push(logEntry('INFO', `${file.name}: generated thumbnail`))
      }
    } catch (err) {
      failed++
      items.push({
        mediaPath: file.path,
        thumbnailPath: null,
        thumbnailUrl: null,
        status: 'failed',
        reason: (err as Error).message
      })
      log.push(logEntry('WARN', `${file.name}: thumbnail failed: ${(err as Error).message}`))
    }
    processed++
    options.onProgress?.(processed, media.length, file.name)
  }

  return {
    generated,
    reused,
    failed,
    skipped: files.length - media.length,
    items,
    log
  }
}

async function existingFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path)
    return stats.isFile()
  } catch {
    return false
  }
}

function thumbnailPathFor(file: ScannedFile, cacheRoot: string, size: number): string {
  const hash = createHash('sha256').update(`${file.path}\0${file.sizeBytes}\0${size}`).digest('hex').slice(0, 24)
  return join(cacheRoot, `${hash}.webp`)
}

function logEntry(level: LogEntry['level'], message: string): LogEntry {
  return { level, message, timestamp: Date.now() }
}
