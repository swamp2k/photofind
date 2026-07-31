import { describe, expect, it } from 'vitest'
import { qualityTierForScore, scoreQuality } from './quality'
import type { LiteQualityMeasurements } from './types'

function sample(overrides: Partial<LiteQualityMeasurements> = {}): LiteQualityMeasurements {
  return {
    width: 4000,
    height: 3000,
    meanLuminance: 0.5,
    luminanceStdDev: 0.22,
    shadowClipFraction: 0.01,
    highlightClipFraction: 0.01,
    laplacianMeanAbs: 18,
    horizontalGradient: 18,
    verticalGradient: 17,
    ...overrides
  }
}

describe('technical quality scoring', () => {
  it('ranks a sharp, balanced, high-resolution image highly', () => {
    const result = scoreQuality(sample())
    expect(result.qualityScore).toBeGreaterThanOrEqual(80)
    expect(result.sharpnessScore).toBeGreaterThan(80)
    expect(result.exposureScore).toBeGreaterThan(85)
    expect(result.motionBlurRisk).toBeLessThan(10)
    expect(result.qualityReasons).toContain('Strong fine detail')
  })

  it('penalizes soft, dark, clipped, low-resolution images', () => {
    const result = scoreQuality(sample({
      width: 900,
      height: 600,
      meanLuminance: 0.13,
      luminanceStdDev: 0.07,
      shadowClipFraction: 0.32,
      highlightClipFraction: 0,
      laplacianMeanAbs: 0.7,
      horizontalGradient: 3,
      verticalGradient: 2.8
    }))
    expect(result.qualityScore).toBeLessThan(50)
    expect(result.qualityTier).toBe('weak')
    expect(result.qualityReasons).toContain('Soft / low fine detail')
    expect(result.qualityReasons).toContain('Deep shadows clipped')
  })

  it('only reports strong motion-blur risk when softness is directional', () => {
    const directional = scoreQuality(sample({ laplacianMeanAbs: 1.2, horizontalGradient: 15, verticalGradient: 1 }))
    const isotropic = scoreQuality(sample({ laplacianMeanAbs: 1.2, horizontalGradient: 8, verticalGradient: 8 }))
    expect(directional.motionBlurRisk).toBeGreaterThan(55)
    expect(isotropic.motionBlurRisk).toBeLessThan(10)
  })

  it('uses stable quality tier thresholds', () => {
    expect(qualityTierForScore(82)).toBe('great')
    expect(qualityTierForScore(67)).toBe('good')
    expect(qualityTierForScore(48)).toBe('okay')
    expect(qualityTierForScore(47)).toBe('weak')
  })
})
