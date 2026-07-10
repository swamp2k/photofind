import { useState } from 'react'
import type { CurateScanResult, PhotoAnalysis, Verdict } from '../../../shared/types'

interface VerdictBoardProps {
  result: CurateScanResult
  effectiveVerdict: (mediaPath: string) => Verdict
  hasOverride: (mediaPath: string) => boolean
  selectedPath: string | null
  onSelect: (mediaPath: string) => void
  onOpen: (mediaPath: string) => void
  onSetVerdict: (mediaPath: string, verdict: Verdict) => void
  onClearOverride: (mediaPath: string) => void
}

const SECTIONS: { verdict: Verdict; title: string; hint: string }[] = [
  { verdict: 'keep', title: 'Keep', hint: 'sharp, well exposed, best of each burst' },
  { verdict: 'maybe', title: 'Maybe', hint: 'worth a second look' },
  { verdict: 'discard', title: 'Discard', hint: 'excluded from export — nothing is deleted' }
]

export function VerdictBoard(props: VerdictBoardProps): JSX.Element {
  const { result, effectiveVerdict } = props
  const thumbnailByPath = new Map(result.thumbnails.items.map((item) => [item.mediaPath, item]))
  const photosByBurst = new Map<string, PhotoAnalysis[]>()
  for (const photo of result.photos) {
    if (photo.burstId) {
      const group = photosByBurst.get(photo.burstId) ?? []
      group.push(photo)
      photosByBurst.set(photo.burstId, group)
    }
  }

  return (
    <div className="verdict-board">
      {SECTIONS.map((section) => {
        const photos = result.photos.filter((photo) => effectiveVerdict(photo.media.path) === section.verdict)
        return (
          <section key={section.verdict} className={`verdict-section verdict-section-${section.verdict}`}>
            <header className="verdict-section-header">
              <h2>
                {section.title} <span className="verdict-count">{photos.length}</span>
              </h2>
              <span className="muted">{section.hint}</span>
            </header>
            {photos.length === 0 ? (
              <p className="verdict-empty muted">Nothing here.</p>
            ) : (
              <div className="verdict-grid">
                {photos.map((photo) => (
                  <PhotoTile
                    key={photo.media.path}
                    photo={photo}
                    burstPhotos={photo.burstId ? photosByBurst.get(photo.burstId) ?? [] : []}
                    thumbnailUrl={thumbnailByPath.get(photo.media.path)?.thumbnailUrl ?? null}
                    thumbnailByPath={thumbnailByPath}
                    {...props}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

interface PhotoTileProps extends VerdictBoardProps {
  photo: PhotoAnalysis
  burstPhotos: PhotoAnalysis[]
  thumbnailUrl: string | null
  thumbnailByPath: Map<string, CurateScanResult['thumbnails']['items'][number]>
}

function PhotoTile(props: PhotoTileProps): JSX.Element {
  const { photo, burstPhotos, thumbnailUrl, thumbnailByPath, selectedPath, hasOverride } = props
  const [filmstripOpen, setFilmstripOpen] = useState(false)
  const path = photo.media.path
  const selected = selectedPath === path

  return (
    <div className={selected ? 'photo-tile photo-tile-selected' : 'photo-tile'} data-media-path={path}>
      <button
        className="photo-tile-image"
        onClick={() => props.onSelect(path)}
        onDoubleClick={() => props.onOpen(path)}
        title={photo.media.name}
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={photo.media.name} loading="lazy" />
        ) : (
          <span className="photo-tile-noimage">no preview</span>
        )}
        {photo.burstId && (
          <span className={photo.isBurstPick ? 'burst-badge burst-badge-pick' : 'burst-badge'}>
            {photo.isBurstPick ? `best ×${photo.burstSize}` : `×${photo.burstSize}`}
          </span>
        )}
      </button>
      <div className="photo-tile-info">
        <span className="photo-tile-name">{photo.media.name}</span>
        <span className="photo-tile-reasons">
          {photo.reasons.join(', ')}
          {hasOverride(path) && ' · your call'}
        </span>
      </div>
      <div className="photo-tile-actions">
        <button className="verdict-button verdict-button-keep" title="Keep (K)" onClick={() => props.onSetVerdict(path, 'keep')}>
          K
        </button>
        <button className="verdict-button verdict-button-maybe" title="Maybe (M)" onClick={() => props.onSetVerdict(path, 'maybe')}>
          M
        </button>
        <button
          className="verdict-button verdict-button-discard"
          title="Discard (D)"
          onClick={() => props.onSetVerdict(path, 'discard')}
        >
          D
        </button>
        {hasOverride(path) && (
          <button className="verdict-button" title="Undo override (U)" onClick={() => props.onClearOverride(path)}>
            U
          </button>
        )}
        {photo.burstId && burstPhotos.length > 1 && (
          <button className="verdict-button" title="Compare burst frames" onClick={() => setFilmstripOpen((open) => !open)}>
            {filmstripOpen ? '▾' : '▸'}
          </button>
        )}
      </div>
      {filmstripOpen && (
        <div className="burst-filmstrip">
          {burstPhotos.map((frame) => (
            <button
              key={frame.media.path}
              className={frame.media.path === path ? 'burst-frame burst-frame-current' : 'burst-frame'}
              onClick={() => props.onOpen(frame.media.path)}
              title={`${frame.media.name} — ${frame.reasons.join(', ')}`}
            >
              {thumbnailByPath.get(frame.media.path)?.thumbnailUrl ? (
                <img src={thumbnailByPath.get(frame.media.path)!.thumbnailUrl!} alt={frame.media.name} loading="lazy" />
              ) : (
                <span className="photo-tile-noimage">?</span>
              )}
              {frame.isBurstPick && <span className="burst-badge burst-badge-pick">best</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
