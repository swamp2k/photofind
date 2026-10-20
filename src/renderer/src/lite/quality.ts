import type { LiteQualityMeasurements, LiteQualityTier } from './types'

export interface LiteQualityScoreResult {
  qualityScore: number
  qualityTier: LiteQualityTier
  sharpnessScore: number
  exposureScore: number
  resolutionScore: number
  motionBlurRisk: number
  underwater: boolean
  qualityReasons: string[]
}

export function scoreQuality(measurements: LiteQualityMeasurements): LiteQualityScoreResult {
  const underwater = isLikelyUnderwater(measurements)
  // Water scatters light, so even a well-focused underwater shot has less fine detail and contrast.
  // Judge those photos against other underwater photos rather than against dry-land shots.
  const detail = Math.max(0, measurements.laplacianMeanAbs) * (underwater ? UNDERWATER_DETAIL_BOOST : 1)
  const sharpnessScore = roundScore(clamp(Math.log2(1 + detail) * 22, 0, 100))
  const exposureScore = roundScore(scoreExposure(measurements, underwater))
  const resolutionScore = roundScore(scoreResolution(measurements.width, measurements.height))
  const motionBlurRisk = roundScore(scoreMotionBlurRisk(measurements, sharpnessScore))

  const qualityScore = roundScore(
    sharpnessScore * 0.48
      + exposureScore * 0.30
      + resolutionScore * 0.12
      + (100 - motionBlurRisk) * 0.10
  )

  return {
    qualityScore,
    qualityTier: qualityTierForScore(qualityScore),
    sharpnessScore,
    exposureScore,
    resolutionScore,
    motionBlurRisk,
    underwater,
    qualityReasons: buildReasons(measurements, underwater, sharpnessScore, exposureScore, resolutionScore, motionBlurRisk)
  }
}

export function qualityTierForScore(score: number): LiteQualityTier {
  if (score >= 82) return 'great'
  if (score >= 67) return 'good'
  if (score >= 48) return 'okay'
  return 'weak'
}

export function qualityTierLabel(tier: LiteQualityTier): string {
  if (tier === 'great') return 'Great'
  if (tier === 'good') return 'Good'
  if (tier === 'okay') return 'Okay'
  return 'Weak'
}

const UNDERWATER_DETAIL_BOOST = 1.8

/** Most of the frame has the strong blue/green cast that water gives (red light is absorbed first). */
export function isLikelyUnderwater(measurements: LiteQualityMeasurements): boolean {
  return (measurements.waterCastFraction ?? 0) >= 0.7 && (measurements.redDeficit ?? 0) >= 0.3
}

function scoreExposure(measurements: LiteQualityMeasurements, underwater = false): number {
  // Underwater photos are naturally a bit darker and flatter; only penalize the extremes.
  const target = underwater ? 0.42 : 0.5
  const brightnessPenalty = Math.max(0, Math.abs(measurements.meanLuminance - target) - (underwater ? 0.08 : 0)) * 88
  const clippingPenalty = Math.min(58, (measurements.shadowClipFraction + measurements.highlightClipFraction) * 175)
  const minimumContrast = underwater ? 0.07 : 0.12
  const contrastPenalty = measurements.luminanceStdDev < minimumContrast
    ? (minimumContrast - measurements.luminanceStdDev) * 220
    : 0
  return clamp(100 - brightnessPenalty - clippingPenalty - contrastPenalty, 0, 100)
}

function scoreResolution(width: number, height: number): number {
  const megapixels = Math.max(0, width * height) / 1_000_000
  return clamp(100 * (1 - Math.exp(-megapixels / 4)), 0, 100)
}

function scoreMotionBlurRisk(measurements: LiteQualityMeasurements, sharpnessScore: number): number {
  const totalGradient = measurements.horizontalGradient + measurements.verticalGradient
  if (totalGradient <= 0) return sharpnessScore < 25 ? 35 : 0
  const anisotropy = Math.abs(measurements.horizontalGradient - measurements.verticalGradient) / totalGradient
  const softness = 1 - sharpnessScore / 100
  return clamp(softness * Math.max(0, anisotropy - 0.08) * 185, 0, 100)
}

function buildReasons(
  measurements: LiteQualityMeasurements,
  underwater: boolean,
  sharpnessScore: number,
  exposureScore: number,
  resolutionScore: number,
  motionBlurRisk: number
): string[] {
  const reasons: string[] = []
  if (underwater) reasons.push('Underwater — judged on a water-adjusted scale')

  if (sharpnessScore >= 78) reasons.push('Strong fine detail')
  else if (sharpnessScore <= 42) reasons.push('Soft / low fine detail')

  if (exposureScore >= 82) reasons.push('Balanced exposure')
  if (measurements.highlightClipFraction >= 0.06) reasons.push('Highlights clipped')
  if (measurements.shadowClipFraction >= 0.10) reasons.push('Deep shadows clipped')

  if (resolutionScore >= 82) reasons.push('High usable resolution')
  else if (resolutionScore < 45) reasons.push('Limited resolution')

  if (motionBlurRisk >= 55) reasons.push('Possible directional motion blur')

  if (reasons.length === 0) reasons.push('Technically balanced overall')
  return reasons.slice(0, 4)
}

function roundScore(value: number): number {
  return Math.round(clamp(value, 0, 100))
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
