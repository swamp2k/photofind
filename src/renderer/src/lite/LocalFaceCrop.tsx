import { useEffect, useRef, useState } from 'react'
import { decodeBitmapForAnalysis } from './imageDecode'
import type { LiteFaceObservation, LiteMediaRecord } from './types'

const FACE_PREVIEW_MAX_DIMENSION = 2048

export function LocalFaceCrop({ item, face, sessionFile, size = 160 }: { item: LiteMediaRecord; face: LiteFaceObservation; sessionFile?: File; size?: number }): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let disposed = false
    setFailed(false)
    void (async () => {
      const file = sessionFile ?? (item.fileHandle ? await item.fileHandle.getFile() : null)
      if (!file) throw new Error('Reconnect folder to preview face')
      const bitmap = await decodeBitmapForAnalysis(file, item, FACE_PREVIEW_MAX_DIMENSION)
      try {
        if (disposed || !canvas.current) return
        const context = canvas.current.getContext('2d')
        if (!context) throw new Error('Canvas is unavailable')
        const [x, y, width, height] = face.box
        const margin = Math.max(width, height) * 0.35
        const left = Math.max(0, x - margin)
        const top = Math.max(0, y - margin)
        const right = Math.min(1, x + width + margin)
        const bottom = Math.min(1, y + height + margin)
        const sourceX = left * bitmap.width
        const sourceY = top * bitmap.height
        const sourceWidth = Math.max(1, (right - left) * bitmap.width)
        const sourceHeight = Math.max(1, (bottom - top) * bitmap.height)
        const cropSize = Math.max(sourceWidth, sourceHeight)
        const centeredX = Math.max(0, Math.min(bitmap.width - cropSize, sourceX - (cropSize - sourceWidth) / 2))
        const centeredY = Math.max(0, Math.min(bitmap.height - cropSize, sourceY - (cropSize - sourceHeight) / 2))
        context.clearRect(0, 0, size, size)
        context.drawImage(bitmap, centeredX, centeredY, Math.min(cropSize, bitmap.width), Math.min(cropSize, bitmap.height), 0, 0, size, size)
      } finally {
        bitmap.close()
      }
    })().catch(() => {
      if (!disposed) setFailed(true)
    })
    return () => { disposed = true }
  }, [face, item, sessionFile, size])

  if (failed) return <div className="face-crop-fallback">Face preview unavailable</div>
  return <canvas ref={canvas} data-photofind-photo-id={item.id} width={size} height={size} aria-label={`Face from ${item.name}`} />
}
