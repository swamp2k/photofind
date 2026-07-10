import sharp from 'sharp'
import type { LogEntry, MediaThumbnail, QualityScore } from '../../shared/types'

/**
 * Threshold bands for verdict suggestions. Absolute values anchored by the
 * fixture tests in quality.test.ts: relative-within-scan scoring would wrongly
 * discard the bottom decile of an all-sharp scan, so only burst picking is
 * relative. Tune here, nowhere else.
 */
export const SHARPNESS_BLURRY = 30
export const SHARPNESS_SOFT = 100
export const DARK_MEAN = 50
export const BRIGHT_MEAN = 215
export const CLIP_PCT = 0.3

const SHADOW_LUMA = 10
const HIGHLIGHT_LUMA = 245

export interface QualityAnalysisResult {
  items: QualityScore[]
  log: LogEntry[]
}

/**
 * Scores each photo's cached thumbnail: Laplacian variance for sharpness plus
 * exposure statistics. Thumbnails are 10-50x cheaper to decode than originals
 * and 320px is plenty to separate blur from detail.
 */
export async function analyzeQuality(
  thumbnails: MediaThumbnail[],
  onProgress?: (processed: number, total: number, currentFile: string) => void
): Promise<QualityAnalysisResult> {
  const items: QualityScore[] = []
  const log: LogEntry[] = []
  let processed = 0

  for (const thumbnail of thumbnails) {
    if (thumbnail.status !== 'ready' || !thumbnail.thumbnailPath) {
      items.push(failedScore(thumbnail.mediaPath, thumbnail.reason ?? 'no thumbnail available'))
      log.push({
        level: 'WARN',
        message: `${thumbnail.mediaPath}: quality analysis skipped: ${thumbnail.reason ?? 'no thumbnail available'}`,
        timestamp: Date.now()
      })
    } else {
      try {
        items.push(await scoreThumbnail(thumbnail.mediaPath, thumbnail.thumbnailPath))
      } catch (err) {
        items.push(failedScore(thumbnail.mediaPath, (err as Error).message))
        log.push({
          level: 'WARN',
          message: `${thumbnail.mediaPath}: quality analysis failed: ${(err as Error).message}`,
          timestamp: Date.now()
        })
      }
    }
    processed++
    onProgress?.(processed, thumbnails.length, thumbnail.mediaPath)
  }

  return { items, log }
}

async function scoreThumbnail(mediaPath: string, thumbnailPath: string): Promise<QualityScore> {
  const { data, info } = await sharp(thumbnailPath).greyscale().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info

  // One pass: Laplacian response stats (skipping the 1px border) and luma
  // histogram stats. sharp's convolve() clamps negative responses, so the
  // kernel is applied by hand.
  let lapSum = 0
  let lapSqSum = 0
  let lapCount = 0
  let lumaSum = 0
  let shadows = 0
  let highlights = 0

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const luma = data[row + x]
      lumaSum += luma
      if (luma < SHADOW_LUMA) shadows++
      else if (luma > HIGHLIGHT_LUMA) highlights++

      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const lap = data[row + x - 1] + data[row + x + 1] + data[row - width + x] + data[row + width + x] - 4 * luma
        lapSum += lap
        lapSqSum += lap * lap
        lapCount++
      }
    }
  }

  const totalPixels = width * height
  const lapMean = lapCount > 0 ? lapSum / lapCount : 0
  const sharpness = lapCount > 0 ? lapSqSum / lapCount - lapMean * lapMean : 0

  return {
    mediaPath,
    sharpness,
    exposureMean: lumaSum / totalPixels,
    clippedShadowsPct: shadows / totalPixels,
    clippedHighlightsPct: highlights / totalPixels,
    status: 'ok'
  }
}

function failedScore(mediaPath: string, reason: string): QualityScore {
  return {
    mediaPath,
    sharpness: null,
    exposureMean: null,
    clippedShadowsPct: null,
    clippedHighlightsPct: null,
    status: 'failed',
    reason
  }
}
