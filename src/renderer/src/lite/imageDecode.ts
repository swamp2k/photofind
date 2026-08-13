import { heicTo } from 'heic-to/csp'
import type { LiteMediaRecord } from './types'

const HEIC_EXTENSIONS = new Set(['heic', 'heif'])
const HEIC_DECODE_TIMEOUT_MS = 30_000
const HEIC_NATIVE_DECODE_TIMEOUT_MS = 8_000

export function isHeicMedia(file: Blob, item?: Pick<LiteMediaRecord, 'name' | 'mimeType'>): boolean {
  const mime = (file.type || item?.mimeType || '').toLowerCase()
  if (mime.includes('heic') || mime.includes('heif')) return true
  const name = item?.name || ('name' in file && typeof (file as File).name === 'string' ? (file as File).name : '')
  const extension = name.split('.').at(-1)?.toLowerCase() ?? ''
  return HEIC_EXTENSIONS.has(extension)
}

export async function displayBlobForPhoto(
  file: File,
  item: Pick<LiteMediaRecord, 'name' | 'mimeType'>,
  maxDimension?: number
): Promise<Blob> {
  if (!isHeicMedia(file, item)) return file

  let nativeError: unknown
  try {
    return await browserDecodeHeicJpeg(file, maxDimension)
  } catch (cause) {
    nativeError = cause
  }

  try {
    const jpeg = await decodeHeicJpeg(file)
    if (!maxDimension || maxDimension <= 0) return jpeg

    const bitmap = await createImageBitmap(jpeg)
    try {
      return await bitmapToJpeg(bitmap, maxDimension)
    } finally {
      bitmap.close()
    }
  } catch (fallbackError) {
    throw new Error(`Unable to open this HEIC locally. Browser decode failed: ${messageOf(nativeError)} Fallback decoder failed: ${messageOf(fallbackError)}`)
  }
}

export async function decodeBitmapForAnalysis(
  file: File,
  item: Pick<LiteMediaRecord, 'name' | 'mimeType' | 'width' | 'height'>,
  maxDimension: number
): Promise<ImageBitmap> {
  if (isHeicMedia(file, item)) {
    const source = await displayBlobForPhoto(file, item, maxDimension)
    return createImageBitmap(source)
  }
  const bitmap = await createImageBitmap(file)
  return resizeBitmap(bitmap, maxDimension)
}

async function browserDecodeHeicJpeg(file: File, maxDimension?: number): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = await withTimeout(
      loadImage(sourceUrl),
      HEIC_NATIVE_DECODE_TIMEOUT_MS,
      `Browser HEIC decoding timed out after ${HEIC_NATIVE_DECODE_TIMEOUT_MS / 1000} seconds.`
    )
    return imageToJpeg(image, maxDimension)
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

function loadImage(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The browser could not decode the original HEIC image.'))
    image.src = sourceUrl
  })
}

async function imageToJpeg(image: HTMLImageElement, maxDimension?: number): Promise<Blob> {
  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height
  if (naturalWidth <= 0 || naturalHeight <= 0) throw new Error('Browser HEIC decoding returned invalid image dimensions.')
  const largest = Math.max(naturalWidth, naturalHeight)
  const scale = maxDimension && maxDimension > 0 && largest > maxDimension ? maxDimension / largest : 1
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable for HEIC preview conversion.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return canvasToJpeg(canvas)
}

async function decodeHeicJpeg(file: File, quality = 0.92): Promise<Blob> {
  const decoded = await withTimeout(
    heicTo({ blob: file, type: 'image/jpeg', quality }),
    HEIC_DECODE_TIMEOUT_MS,
    `HEIC decoding timed out after ${HEIC_DECODE_TIMEOUT_MS / 1000} seconds.`
  )
  if (!(decoded instanceof Blob)) throw new Error('HEIC decoder did not return a JPEG image.')
  if (decoded.size === 0) throw new Error('HEIC decoder returned an empty JPEG image.')
  return decoded
}

async function resizeBitmap(bitmap: ImageBitmap, maxDimension: number): Promise<ImageBitmap> {
  const largest = Math.max(bitmap.width, bitmap.height)
  if (!Number.isFinite(maxDimension) || maxDimension <= 0 || largest <= maxDimension) return bitmap
  const scale = maxDimension / largest
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  try {
    const resized = await createImageBitmap(bitmap, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })
    bitmap.close()
    return resized
  } catch {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return bitmap
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    const resized = await createImageBitmap(canvas)
    bitmap.close()
    return resized
  }
}

async function bitmapToJpeg(bitmap: ImageBitmap, maxDimension?: number): Promise<Blob> {
  const largest = Math.max(bitmap.width, bitmap.height)
  const scale = maxDimension && maxDimension > 0 && largest > maxDimension ? maxDimension / largest : 1
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable for HEIC preview conversion.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  return canvasToJpeg(canvas)
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('HEIC preview conversion failed.')), 'image/jpeg', 0.92)
  })
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), milliseconds)
    promise.then(
      (value) => { window.clearTimeout(timeout); resolve(value) },
      (error) => { window.clearTimeout(timeout); reject(error) }
    )
  })
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'string' && cause.trim()) return cause
  return 'unknown error.'
}
