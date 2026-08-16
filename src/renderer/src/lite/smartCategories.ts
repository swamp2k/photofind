import { classifyLikelyNonPhoto } from './contentClassification'
import type {
  LiteMediaRecord,
  LiteProductPhotoSettings,
  LiteSimilarityGroup,
  LiteSmartCategorySettings,
  LiteSmartCategorySensitivity
} from './types'

export const DEFAULT_SMART_CATEGORY_SETTINGS: LiteSmartCategorySettings = {
  productPhotos: {
    sensitivity: 'balanced',
    recognizeSeries: true,
    preferNoPeople: true
  }
}

export interface LiteProductPhotoMatch {
  item: LiteMediaRecord
  score: number
  reasons: string[]
  seriesSize: number
  manuallyIncluded: boolean
}

interface SimilaritySignal {
  strength: number
  size: number
  label: string
}

const PRODUCT_PATH_HINT = /(?:^|[\\/\s_.-])(product|products|sale|selling|marketplace|dba|til[\s_-]?salg|for[\s_-]?sale)(?:[\\/\s_.-]|$)/i
const TEMPORAL_SERIES_GAP_MS = 120_000
const TEMPORAL_SERIES_SPAN_MS = 8 * 60_000

export function normalizeSmartCategorySettings(settings?: LiteSmartCategorySettings): LiteSmartCategorySettings {
  const product = settings?.productPhotos
  return {
    productPhotos: {
      sensitivity: isSensitivity(product?.sensitivity) ? product.sensitivity : DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos.sensitivity,
      recognizeSeries: typeof product?.recognizeSeries === 'boolean' ? product.recognizeSeries : DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos.recognizeSeries,
      preferNoPeople: typeof product?.preferNoPeople === 'boolean' ? product.preferNoPeople : DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos.preferNoPeople
    }
  }
}

export function productPhotoThreshold(sensitivity: LiteSmartCategorySensitivity): number {
  if (sensitivity === 'conservative') return 0.72
  if (sensitivity === 'broad') return 0.46
  return 0.58
}

export function productSemanticFloor(sensitivity: LiteSmartCategorySensitivity): number {
  // Five positive and five negative prompts make ~0.50 the neutral semantic mass.
  // Keep every automatic mode above that neutral point so an ambiguous image
  // cannot become a product match merely because similarity/series boosters fire.
  if (sensitivity === 'conservative') return 0.75
  if (sensitivity === 'broad') return 0.53
  return 0.62
}

export function findLikelyProductPhotos(
  items: LiteMediaRecord[],
  similarityGroups: LiteSimilarityGroup[],
  settings: LiteProductPhotoSettings
): LiteProductPhotoMatch[] {
  const images = items.filter((item) => item.kind === 'image')
  const similarityByItem = buildSimilaritySignals(similarityGroups)
  const temporalSeriesByItem = settings.recognizeSeries ? buildTemporalSeriesSizes(images) : new Map<string, number>()
  const threshold = productPhotoThreshold(settings.sensitivity)
  const semanticFloor = productSemanticFloor(settings.sensitivity)
  const matches: LiteProductPhotoMatch[] = []

  for (const item of images) {
    if (item.productPhotoOverride === false) continue
    if (item.productPhotoOverride === true) {
      matches.push({ item, score: 1, reasons: ['Manually marked as a product photo'], seriesSize: temporalSeriesByItem.get(item.id) ?? 1, manuallyIncluded: true })
      continue
    }
    if (classifyLikelyNonPhoto(item)) continue

    const pathHint = PRODUCT_PATH_HINT.test(item.relativePath) || PRODUCT_PATH_HINT.test(item.name)
    const semanticReady = item.productAnalysisStatus === 'ready' && typeof item.productSemanticScore === 'number'
    const semanticScore = semanticReady ? item.productSemanticScore! : 0

    // Visual similarity and burst timing are common in family photos too. They may
    // strengthen a semantic product match, but are never sufficient by themselves.
    if (!pathHint && (!semanticReady || semanticScore < semanticFloor)) continue

    let score = semanticReady ? semanticScore * 0.85 : 0.7
    const reasons: string[] = []
    let seriesSize = temporalSeriesByItem.get(item.id) ?? 1

    if (semanticReady) {
      reasons.push(`${Math.round(semanticScore * 100)}% semantic product signal${item.productSemanticLabel ? ` — ${item.productSemanticLabel}` : ''}`)
    }

    if (pathHint) {
      score += 0.15
      reasons.push('Folder or filename explicitly suggests sale/product photos')
    }

    if (settings.recognizeSeries) {
      const visual = similarityByItem.get(item.id)
      if (visual) {
        score += visual.strength
        seriesSize = Math.max(seriesSize, visual.size)
        reasons.push(visual.label)
      }
      if (seriesSize >= 3) {
        score += 0.04
        reasons.push(`${seriesSize} photos were captured as a short series`)
        if (seriesSize >= 5) score += 0.02
      }
    }

    if (item.faceAnalysisStatus === 'ready' && settings.preferNoPeople) {
      const faceCount = item.faces?.length ?? 0
      if (faceCount === 0) {
        score += 0.05
        reasons.push('No people detected')
      } else {
        score -= 0.2
        reasons.push('People detected in the photo')
      }
    }

    score = roundScore(score)
    if (score >= threshold) matches.push({ item, score, reasons, seriesSize, manuallyIncluded: false })
  }

  return matches.sort((left, right) => right.score - left.score || captureTime(right.item) - captureTime(left.item) || left.item.relativePath.localeCompare(right.item.relativePath))
}

export function setProductPhotoOverride(
  items: LiteMediaRecord[],
  itemId: string,
  productPhoto: boolean | null,
  updatedAt = Date.now()
): { items: LiteMediaRecord[]; changed: LiteMediaRecord | null } {
  let changed: LiteMediaRecord | null = null
  const next = items.map((item) => {
    if (item.id !== itemId || item.kind !== 'image') return item
    const nextValue = productPhoto === null ? undefined : productPhoto
    if (item.productPhotoOverride === nextValue) return item
    changed = {
      ...item,
      productPhotoOverride: nextValue,
      productPhotoOverrideUpdatedAt: updatedAt
    }
    return changed
  })
  return { items: next, changed }
}

function buildSimilaritySignals(groups: LiteSimilarityGroup[]): Map<string, SimilaritySignal> {
  const output = new Map<string, SimilaritySignal>()
  for (const group of groups) {
    if (group.kind === 'exact') continue
    const size = group.itemIds.length
    if (size < 2) continue
    const strength = size >= 3 ? (group.kind === 'burst' ? 0.06 : 0.05) : 0.03
    const label = group.kind === 'burst'
      ? `${size} visually related burst photos`
      : `${size} visually similar photos`
    for (const itemId of group.itemIds) {
      const current = output.get(itemId)
      if (!current || strength > current.strength || (strength === current.strength && size > current.size)) output.set(itemId, { strength, size, label })
    }
  }
  return output
}

function buildTemporalSeriesSizes(items: LiteMediaRecord[]): Map<string, number> {
  const reliable = items
    .filter((item) => item.captureTimeSource !== 'file' && typeof item.effectiveCaptureTime === 'number')
    .sort((left, right) => left.effectiveCaptureTime! - right.effectiveCaptureTime!)
  const sizes = new Map<string, number>()
  let cluster: LiteMediaRecord[] = []

  const flush = (): void => {
    if (cluster.length >= 3) for (const item of cluster) sizes.set(item.id, cluster.length)
    cluster = []
  }

  for (const item of reliable) {
    const previous = cluster[cluster.length - 1]
    const first = cluster[0]
    if (!previous || !first) {
      cluster = [item]
      continue
    }
    const gap = item.effectiveCaptureTime! - previous.effectiveCaptureTime!
    const span = item.effectiveCaptureTime! - first.effectiveCaptureTime!
    if (gap <= TEMPORAL_SERIES_GAP_MS && span <= TEMPORAL_SERIES_SPAN_MS && sameFrameShape(previous, item)) {
      cluster.push(item)
      continue
    }
    flush()
    cluster = [item]
  }
  flush()
  return sizes
}

function sameFrameShape(left: LiteMediaRecord, right: LiteMediaRecord): boolean {
  if (!left.width || !left.height || !right.width || !right.height) return true
  const leftLandscape = left.width >= left.height
  const rightLandscape = right.width >= right.height
  if (leftLandscape !== rightLandscape) return false
  const leftRatio = left.width / left.height
  const rightRatio = right.width / right.height
  return Math.abs(leftRatio - rightRatio) <= 0.08
}

function captureTime(item: LiteMediaRecord): number {
  return item.effectiveCaptureTime ?? item.lastModified
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100
}

function isSensitivity(value: unknown): value is LiteSmartCategorySensitivity {
  return value === 'conservative' || value === 'balanced' || value === 'broad'
}
