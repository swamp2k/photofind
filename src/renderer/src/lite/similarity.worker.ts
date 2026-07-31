/// <reference lib="webworker" />

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
  const bitmap = await createImageBitmap(file)
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown analysis error'
}
