import type { LiteQualityMeasurements, LiteQualityTier } from './types'

export interface LiteQualityScoreResult {
  qualityScore: number
  qualityTier: LiteQualityTier
  sharpnessScore: number
  exposureScore: number
  resolutionScore: number
  motionBlurRisk: number
  qualityReasons: string[]
}

export function scoreQuality(measurements: LiteQualityMeasurements): LiteQualityScoreResult {
  const sharpnessScore = roundScore(clamp(Math.log2(1 + Math.max(0, measurements.laplacianMeanAbs)) * 22, 0, 100))
  const exposureScore = roundScore(scoreExposure(measurements))
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
    qualityReasons: buildReasons(measurements, sharpnessScore, exposureScore, resolutionScore, motionBlurRisk)
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

function scoreExposure(measurements: LiteQualityMeasurements): number {
  const brightnessPenalty = Math.abs(measurements.meanLuminance - 0.5) * 88
  const clippingPenalty = Math.min(58, (measurements.shadowClipFraction + measurements.highlightClipFraction) * 175)
  const contrastPenalty = measurements.luminanceStdDev < 0.12
    ? (0.12 - measurements.luminanceStdDev) * 220
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
  sharpnessScore: number,
  exposureScore: number,
  resolutionScore: number,
  motionBlurRisk: number
): string[] {
  const reasons: string[] = []

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
