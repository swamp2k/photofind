/// <reference lib="webworker" />

import { heicTo } from 'heic-to/next'
import type { LiteQualityMeasurements } from './types'

interface AnalyzeRequest {
  id: string
  file: File
}

interface AnalyzeResponse {
  id: string
  measurements?: LiteQualityMeasurements
  error?: string
}

const worker = self as unknown as DedicatedWorkerGlobalScope
const MAX_ANALYSIS_DIMENSION = 384
const HEIC_TIMEOUT_MS = 30_000

worker.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  void analyze(event.data).then((response) => worker.postMessage(response))
}

async function analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  try {
    const bitmap = await decodeBitmap(request.file)
    try {
      const measurements = measureBitmap(bitmap)
      return { id: request.id, measurements }
    } finally {
      bitmap.close()
    }
  } catch (error) {
    return { id: request.id, error: messageOf(error) }
  }
}

async function decodeBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  } catch (nativeError) {
    if (!looksLikeHeic(file)) throw nativeError
    const decoded = await withTimeout(heicTo({ blob: file, type: 'image/jpeg', quality: 0.82 }), HEIC_TIMEOUT_MS)
    if (!(decoded instanceof Blob) || decoded.size === 0) throw new Error('HEIC decoder did not return a usable JPEG image.')
    return createImageBitmap(decoded)
  }
}

function looksLikeHeic(file: File): boolean {
  const mime = file.type.toLowerCase()
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  return mime.includes('heic') || mime.includes('heif') || extension === 'heic' || extension === 'heif'
}

function measureBitmap(bitmap: ImageBitmap): LiteQualityMeasurements {
  const originalWidth = bitmap.width
  const originalHeight = bitmap.height
  if (originalWidth <= 0 || originalHeight <= 0) throw new Error('Image dimensions are unavailable')

  const scale = Math.min(1, MAX_ANALYSIS_DIMENSION / Math.max(originalWidth, originalHeight))
  const width = Math.max(8, Math.round(originalWidth * scale))
  const height = Math.max(8, Math.round(originalHeight * scale))
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('2D canvas is unavailable in this browser worker')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)

  const rgba = context.getImageData(0, 0, width, height).data
  const gray = new Float32Array(width * height)
  let sum = 0
  let sumSquared = 0
  let shadowPixels = 0
  let highlightPixels = 0

  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4
    const luminance = rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114
    gray[index] = luminance
    sum += luminance
    sumSquared += luminance * luminance
    if (luminance <= 8) shadowPixels += 1
    if (luminance >= 247) highlightPixels += 1
  }

  const pixelCount = gray.length
  const mean = sum / pixelCount
  const variance = Math.max(0, sumSquared / pixelCount - mean * mean)
  let laplacianTotal = 0
  let horizontalGradientTotal = 0
  let verticalGradientTotal = 0
  let interiorCount = 0

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      const center = gray[index]
      laplacianTotal += Math.abs(4 * center - gray[index - 1] - gray[index + 1] - gray[index - width] - gray[index + width])
      horizontalGradientTotal += Math.abs(gray[index + 1] - gray[index - 1]) / 2
      verticalGradientTotal += Math.abs(gray[index + width] - gray[index - width]) / 2
      interiorCount += 1
    }
  }

  const denominator = Math.max(1, interiorCount)
  return {
    width: originalWidth,
    height: originalHeight,
    meanLuminance: mean / 255,
    luminanceStdDev: Math.sqrt(variance) / 255,
    shadowClipFraction: shadowPixels / pixelCount,
    highlightClipFraction: highlightPixels / pixelCount,
    laplacianMeanAbs: laplacianTotal / denominator,
    horizontalGradient: horizontalGradientTotal / denominator,
    verticalGradient: verticalGradientTotal / denominator
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`HEIC decoding timed out after ${milliseconds / 1000} seconds.`)), milliseconds)
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value) },
      (error) => { clearTimeout(timeout); reject(error) }
    )
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown quality-analysis error'
}
