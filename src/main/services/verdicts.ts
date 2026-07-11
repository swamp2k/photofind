import type {
  BurstGroup,
  CaptureMetadata,
  PhotoAnalysis,
  PhotoFaces,
  QualityScore,
  ScannedFile,
  Verdict
} from '../../shared/types'
import { skippedFaces } from './faceDetection'
import { BRIGHT_MEAN, CLIP_PCT, DARK_MEAN, SHARPNESS_BLURRY, SHARPNESS_SOFT } from './quality'

/**
 * Combines quality scores, faces and burst grouping into a suggested verdict
 * with human-readable reasons. Suggestions only — the user has the last word,
 * and 'discard' never deletes anything, it just leaves the photo out of export.
 */
export function suggestVerdicts(
  files: ScannedFile[],
  captures: CaptureMetadata[],
  qualities: QualityScore[],
  bursts: BurstGroup[],
  faces: PhotoFaces[] = []
): PhotoAnalysis[] {
  const captureByPath = new Map(captures.map((capture) => [capture.mediaPath, capture]))
  const qualityByPath = new Map(qualities.map((quality) => [quality.mediaPath, quality]))
  const facesByPath = new Map(faces.map((photoFaces) => [photoFaces.mediaPath, photoFaces]))
  const burstByPath = new Map<string, BurstGroup>()
  for (const burst of bursts) {
    for (const path of burst.mediaPaths) {
      burstByPath.set(path, burst)
    }
  }

  const analyses: PhotoAnalysis[] = []
  for (const file of files) {
    const capture = captureByPath.get(file.path)
    const quality = qualityByPath.get(file.path)
    if (!capture || !quality) continue

    const photoFaces = facesByPath.get(file.path) ?? skippedFaces(file.path, 'face detection not run')
    const burst = burstByPath.get(file.path) ?? null
    const isBurstPick = burst?.pickPath === file.path
    const { verdict, reasons } = decide(quality, photoFaces, burst, isBurstPick)

    analyses.push({
      media: file,
      capture,
      quality,
      faces: photoFaces,
      burstId: burst?.id ?? null,
      burstSize: burst?.mediaPaths.length ?? 0,
      isBurstPick,
      suggestedVerdict: verdict,
      reasons,
      userVerdict: null
    })
  }
  return analyses
}

function decide(
  quality: QualityScore,
  faces: PhotoFaces,
  burst: BurstGroup | null,
  isBurstPick: boolean
): { verdict: Verdict; reasons: string[] } {
  const hasFaces = faces.status === 'ok' && faces.count > 0
  const faceChip = `${faces.count} face${faces.count === 1 ? '' : 's'}`

  if (quality.status === 'failed' || quality.sharpness === null) {
    return { verdict: 'maybe', reasons: [`couldn't analyze: ${quality.reason ?? 'no quality data'}`] }
  }

  // Faces never rescue burst siblings — the pick is the same moment, sharper.
  if (burst && !isBurstPick) {
    return { verdict: 'discard', reasons: [`similar to best of burst of ${burst.mediaPaths.length}`] }
  }

  if (quality.sharpness < SHARPNESS_BLURRY) {
    // The sentimental-shot rule: a photo with people in it is never
    // auto-discarded for quality alone.
    if (hasFaces) {
      return { verdict: 'maybe', reasons: ['blurry, but has faces', faceChip] }
    }
    return { verdict: 'discard', reasons: ['blurry'] }
  }

  const cautions: string[] = []
  if (quality.sharpness < SHARPNESS_SOFT) cautions.push('slightly soft focus')
  if (quality.exposureMean !== null && quality.exposureMean < DARK_MEAN) cautions.push('dark')
  if (quality.exposureMean !== null && quality.exposureMean > BRIGHT_MEAN) cautions.push('very bright')
  if (quality.clippedShadowsPct !== null && quality.clippedShadowsPct > CLIP_PCT) cautions.push('crushed shadows')
  if (quality.clippedHighlightsPct !== null && quality.clippedHighlightsPct > CLIP_PCT) cautions.push('blown highlights')

  if (cautions.length > 0) {
    if (hasFaces) cautions.push(faceChip)
    return { verdict: 'maybe', reasons: cautions }
  }

  const reasons = ['sharp and well exposed']
  if (burst && isBurstPick) reasons.push(`best of burst of ${burst.mediaPaths.length}`)
  if (hasFaces) reasons.push(faceChip)
  return { verdict: 'keep', reasons }
}
