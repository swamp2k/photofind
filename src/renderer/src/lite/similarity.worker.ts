/// <reference lib="webworker" />

import { heicTo } from 'heic-to/next'

interface AnalyzeRequest {
  id: string
  file: File
}

interface AnalyzeResponse {
  id: string
  contentHash?: string
  perceptualHash?: string
  error?: string
}

const worker = self as unknown as DedicatedWorkerGlobalScope
const HEIC_TIMEOUT_MS = 30_000

worker.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  void analyze(event.data).then((response) => worker.postMessage(response))
}

async function analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  try {
    const contentHash = await sha256(request.file)
    let perceptualHash: string | undefined
    let perceptualError: string | undefined
    try {
      perceptualHash = await differenceHash(request.file)
    } catch (error) {
      perceptualError = messageOf(error)
    }

    return {
      id: request.id,
      contentHash,
      ...(perceptualHash ? { perceptualHash } : {}),
      ...(perceptualError ? { error: `Visual fingerprint unavailable: ${perceptualError}` } : {})
    }
  } catch (error) {
    return { id: request.id, error: messageOf(error) }
  }
}

async function sha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function differenceHash(file: File): Promise<string> {
  const bitmap = await decodeBitmap(file)
  try {
    const canvas = new OffscreenCanvas(9, 8)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('2D canvas is unavailable in this browser worker')
    context.drawImage(bitmap, 0, 0, 9, 8)
    const pixels = context.getImageData(0, 0, 9, 8).data
    const bits: number[] = []

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const left = grayAt(pixels, y * 9 + x)
        const right = grayAt(pixels, y * 9 + x + 1)
        bits.push(left > right ? 1 : 0)
      }
    }
    return bitsToHex(bits)
  } finally {
    bitmap.close()
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

function grayAt(data: Uint8ClampedArray, pixelIndex: number): number {
  const offset = pixelIndex * 4
  return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114
}

function bitsToHex(bits: number[]): string {
  let output = ''
  for (let index = 0; index < bits.length; index += 4) {
    const nibble = (bits[index] << 3) | (bits[index + 1] << 2) | (bits[index + 2] << 1) | bits[index + 3]
    output += nibble.toString(16)
  }
  return output
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
  return error instanceof Error ? error.message : 'Unknown analysis error'
}
