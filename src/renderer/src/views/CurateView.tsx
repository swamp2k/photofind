import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Verdict } from '../../../shared/types'
import { CurateProgress } from '../components/CurateProgress'
import { DiagnosticsDrawer } from '../components/DiagnosticsDrawer'
import { Lightbox } from '../components/Lightbox'
import { VerdictBoard } from '../components/VerdictBoard'
import type { CurateSession } from '../hooks/useCurateSession'

const VERDICT_ORDER: Verdict[] = ['keep', 'maybe', 'discard']

export function CurateView({ session }: { session: CurateSession }): JSX.Element {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const { result, effectiveVerdict } = session

  // Flattened board order (keep, maybe, discard; capture time within each)
  // drives arrow-key navigation and the lightbox sequence.
  const orderedPaths = useMemo(() => {
    if (!result) return []
    const sorted = [...result.photos].sort(
      (a, b) => (a.capture.captureTimeMs ?? 0) - (b.capture.captureTimeMs ?? 0)
    )
    return VERDICT_ORDER.flatMap((verdict) =>
      sorted.filter((photo) => effectiveVerdict(photo.media.path) === verdict).map((photo) => photo.media.path)
    )
  }, [result, effectiveVerdict])

  const photoByPath = useMemo(() => new Map(result?.photos.map((photo) => [photo.media.path, photo]) ?? []), [result])
  const thumbnailByPath = useMemo(
    () => new Map(result?.thumbnails.items.map((item) => [item.mediaPath, item]) ?? []),
    [result]
  )

  const moveSelection = useCallback(
    (delta: number) => {
      if (orderedPaths.length === 0) return
      const index = selectedPath ? orderedPaths.indexOf(selectedPath) : -1
      const next = index === -1 ? (delta > 0 ? 0 : orderedPaths.length - 1) : (index + delta + orderedPaths.length) % orderedPaths.length
      setSelectedPath(orderedPaths[next])
    },
    [orderedPaths, selectedPath]
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const key = event.key.toLowerCase()
      if (key === 'arrowright') {
        event.preventDefault()
        moveSelection(1)
      } else if (key === 'arrowleft') {
        event.preventDefault()
        moveSelection(-1)
      } else if (key === 'k' && selectedPath) {
        session.setVerdict(selectedPath, 'keep')
      } else if (key === 'm' && selectedPath) {
        session.setVerdict(selectedPath, 'maybe')
      } else if (key === 'd' && selectedPath) {
        session.setVerdict(selectedPath, 'discard')
      } else if (key === 'u' && selectedPath) {
        session.clearOverride(selectedPath)
      } else if (key === 'enter' && selectedPath) {
        event.preventDefault()
        setLightboxOpen(true)
      } else if (key === 'escape') {
        setLightboxOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [moveSelection, selectedPath, session])

  // Selection follows the photo when a verdict change moves it to another
  // section; drop it only when the photo disappears entirely (re-scan).
  useEffect(() => {
    if (selectedPath && !photoByPath.has(selectedPath)) {
      setSelectedPath(null)
      setLightboxOpen(false)
    }
  }, [photoByPath, selectedPath])

  const openLightbox = useCallback((mediaPath: string) => {
    setSelectedPath(mediaPath)
    setLightboxOpen(true)
  }, [])

  const selectedPhoto = selectedPath ? photoByPath.get(selectedPath) ?? null : null

  return (
    <div className="curate-view">
      <div className="curate-top">
        <h1>Curate photos</h1>
        <button onClick={session.selectFolder}>Choose folder&hellip;</button>
        {session.rootPath && <span className="source-path">{session.rootPath}</span>}
        <button className="primary" disabled={!session.rootPath || session.scanning} onClick={session.scan}>
          {session.scanning ? 'Analyzing…' : 'Analyze photos'}
        </button>
      </div>

      {!result && !session.scanning && (
        <p className="muted curate-intro">
          Point Photofind at a folder of photos. It scores focus and exposure, picks the best frame of every burst and
          sorts everything into keep / maybe / discard for you to confirm. Discarded photos are only left out of the
          export — nothing is ever deleted.
        </p>
      )}

      {session.scanning && session.progress && <CurateProgress progress={session.progress} />}

      {result && (
        <>
          <div className="curate-summary">
            <span className="stat-safe">{result.photos.filter((p) => effectiveVerdict(p.media.path) === 'keep').length} keep</span>
            <span className="stat-uncertain">
              {result.photos.filter((p) => effectiveVerdict(p.media.path) === 'maybe').length} maybe
            </span>
            <span className="stat-missing">
              {result.photos.filter((p) => effectiveVerdict(p.media.path) === 'discard').length} discard
            </span>
            <span className="muted">
              {result.summary.analyzed} photos · {result.summary.bursts} bursts · {result.summary.withFaces} with faces
              {result.summary.failed > 0 && ` · ${result.summary.failed} could not be analyzed`}
              {result.summary.faceFailed > 0 && ` · ${result.summary.faceFailed} face scans failed`}
            </span>
            <span className="curate-keyhint muted">←/→ select · K/M/D verdict · U undo · Enter preview</span>
            <button className="primary" disabled={session.keepCount === 0 || session.exporting} onClick={session.exportKeeps}>
              {session.exporting ? 'Exporting…' : `Export ${session.keepCount} keeper${session.keepCount === 1 ? '' : 's'}`}
            </button>
          </div>

          {session.exportResult && (
            <div className={session.exportResult.failed > 0 ? 'export-summary export-summary-warn' : 'export-summary'}>
              Exported {session.exportResult.exported} of {session.exportResult.attempted} keepers to{' '}
              {session.exportResult.destinationRoot}. Report: {session.exportResult.reportPath}
            </div>
          )}

          <VerdictBoard
            result={result}
            effectiveVerdict={effectiveVerdict}
            hasOverride={session.hasOverride}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            onOpen={openLightbox}
            onSetVerdict={session.setVerdict}
            onClearOverride={session.clearOverride}
          />
        </>
      )}

      <DiagnosticsDrawer log={result?.log ?? []} />

      {lightboxOpen && selectedPhoto && (
        <Lightbox
          photo={selectedPhoto}
          fallbackThumbnailUrl={thumbnailByPath.get(selectedPhoto.media.path)?.thumbnailUrl ?? null}
          effectiveVerdict={effectiveVerdict(selectedPhoto.media.path)}
          hasOverride={session.hasOverride(selectedPhoto.media.path)}
          onClose={() => setLightboxOpen(false)}
          onPrev={() => moveSelection(-1)}
          onNext={() => moveSelection(1)}
          onSetVerdict={(verdict) => session.setVerdict(selectedPhoto.media.path, verdict)}
          onClearOverride={() => session.clearOverride(selectedPhoto.media.path)}
        />
      )}
    </div>
  )
}
