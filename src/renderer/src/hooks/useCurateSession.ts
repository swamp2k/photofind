import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CurateScanResult, ExportResult, ScanProgressEvent, Verdict } from '../../../shared/types'

export interface CurateSession {
  rootPath: string | null
  scanning: boolean
  progress: ScanProgressEvent | null
  result: CurateScanResult | null
  exporting: boolean
  exportResult: ExportResult | null
  /** Effective verdict per photo: user override if any, else the suggestion */
  effectiveVerdict: (mediaPath: string) => Verdict
  hasOverride: (mediaPath: string) => boolean
  keepCount: number
  selectFolder: () => Promise<void>
  scan: () => Promise<void>
  setVerdict: (mediaPath: string, verdict: Verdict) => Promise<void>
  clearOverride: (mediaPath: string) => Promise<void>
  exportKeeps: () => Promise<void>
}

export function useCurateSession(): CurateSession {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgressEvent | null>(null)
  const [result, setResult] = useState<CurateScanResult | null>(null)
  const [overrides, setOverrides] = useState<Map<string, Verdict>>(() => new Map())
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => unsubscribeRef.current?.()
  }, [])

  const suggestedByPath = useMemo(
    () => new Map(result?.photos.map((photo) => [photo.media.path, photo.suggestedVerdict]) ?? []),
    [result]
  )

  const effectiveVerdict = useCallback(
    (mediaPath: string): Verdict => overrides.get(mediaPath) ?? suggestedByPath.get(mediaPath) ?? 'maybe',
    [overrides, suggestedByPath]
  )

  const hasOverride = useCallback((mediaPath: string) => overrides.has(mediaPath), [overrides])

  const keepCount = useMemo(
    () => result?.photos.filter((photo) => effectiveVerdict(photo.media.path) === 'keep').length ?? 0,
    [result, effectiveVerdict]
  )

  const selectFolder = useCallback(async () => {
    const path = await window.api.selectFolder()
    if (path) {
      setRootPath(path)
      setResult(null)
      setProgress(null)
      setOverrides(new Map())
      setExportResult(null)
    }
  }, [])

  const scan = useCallback(async () => {
    if (!rootPath) return
    setScanning(true)
    setResult(null)
    setProgress(null)
    setOverrides(new Map())
    setExportResult(null)
    unsubscribeRef.current?.()
    unsubscribeRef.current = window.api.onCurateScanProgress(setProgress)
    try {
      const scanResult = await window.api.runCurateScan(rootPath)
      setResult(scanResult)
      // Persisted overrides from earlier sessions come back on the photos.
      setOverrides(
        new Map(
          scanResult.photos
            .filter((photo) => photo.userVerdict !== null)
            .map((photo) => [photo.media.path, photo.userVerdict!])
        )
      )
    } finally {
      setScanning(false)
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
    }
  }, [rootPath])

  const setVerdict = useCallback(
    async (mediaPath: string, verdict: Verdict) => {
      const previous = overrides.get(mediaPath)
      setOverrides((current) => new Map(current).set(mediaPath, verdict))
      try {
        await window.api.setVerdict(mediaPath, verdict)
      } catch (err) {
        setOverrides((current) => {
          const next = new Map(current)
          if (previous === undefined) next.delete(mediaPath)
          else next.set(mediaPath, previous)
          return next
        })
        console.error('Failed to persist verdict', err)
      }
    },
    [overrides]
  )

  const clearOverride = useCallback(
    async (mediaPath: string) => {
      const previous = overrides.get(mediaPath)
      if (previous === undefined) return
      setOverrides((current) => {
        const next = new Map(current)
        next.delete(mediaPath)
        return next
      })
      try {
        await window.api.setVerdict(mediaPath, null)
      } catch (err) {
        setOverrides((current) => new Map(current).set(mediaPath, previous))
        console.error('Failed to clear verdict override', err)
      }
    },
    [overrides]
  )

  const exportKeeps = useCallback(async () => {
    if (!result) return
    const keeps = result.photos
      .filter((photo) => effectiveVerdict(photo.media.path) === 'keep')
      .map((photo) => photo.media.path)
    if (keeps.length === 0) return

    const destination = await window.api.selectExportFolder()
    if (!destination) return

    setExporting(true)
    try {
      setExportResult(await window.api.exportKeepers(keeps, destination))
    } finally {
      setExporting(false)
    }
  }, [result, effectiveVerdict])

  return {
    rootPath,
    scanning,
    progress,
    result,
    exporting,
    exportResult,
    effectiveVerdict,
    hasOverride,
    keepCount,
    selectFolder,
    scan,
    setVerdict,
    clearOverride,
    exportKeeps
  }
}
