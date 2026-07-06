import { useState } from 'react'
import type { MediaThumbnail, SidecarMatch } from '../../../shared/types'

interface MediaGridProps {
  thumbnails: MediaThumbnail[]
  matches: SidecarMatch[]
  keepers: Set<string>
  onToggleKeeper: (mediaPath: string) => void
}

export function MediaGrid({ thumbnails, matches, keepers, onToggleKeeper }: MediaGridProps): JSX.Element {
  const matchByPath = new Map(matches.map((match) => [match.media.path, match]))
  const readyCount = thumbnails.filter((thumbnail) => thumbnail.status === 'ready').length

  return (
    <section className="media-grid-section">
      <div className="media-grid-header">
        <h2>Viewer</h2>
        <div className="media-grid-stats">
          <span>{readyCount} thumbnails</span>
          <span>{keepers.size} keepers</span>
        </div>
      </div>

      {thumbnails.length === 0 ? (
        <div className="media-grid-empty">No thumbnails generated yet.</div>
      ) : (
        <div className="media-grid">
          {thumbnails.map((thumbnail) => {
            const match = matchByPath.get(thumbnail.mediaPath)
            const name = match?.media.name ?? thumbnail.mediaPath
            const kept = keepers.has(thumbnail.mediaPath)
            return (
              <article className={`media-tile ${kept ? 'media-tile-kept' : ''}`} key={thumbnail.mediaPath}>
                <button
                  className="media-thumb-button"
                  type="button"
                  onClick={() => onToggleKeeper(thumbnail.mediaPath)}
                  title={kept ? 'Remove keeper mark' : 'Mark as keeper'}
                >
                  <ThumbnailPreview name={name} thumbnailUrl={thumbnail.thumbnailUrl} />
                </button>
                <div className="media-tile-meta">
                  <span className="media-tile-name" title={name}>
                    {name}
                  </span>
                  <span className={`media-tile-confidence confidence-${match?.confidence ?? 'missing'}`}>
                    {match?.confidence ?? thumbnail.status}
                  </span>
                </div>
                <button className={kept ? 'keeper-button keeper-active' : 'keeper-button'} onClick={() => onToggleKeeper(thumbnail.mediaPath)}>
                  {kept ? 'Keeper' : 'Keep'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ThumbnailPreview({ name, thumbnailUrl }: { name: string; thumbnailUrl: string | null }): JSX.Element {
  const [failed, setFailed] = useState(false)

  if (!thumbnailUrl || failed) {
    return <span className="media-thumb-failed">Preview failed</span>
  }

  return <img alt={name} src={thumbnailUrl} onError={() => setFailed(true)} />
}
