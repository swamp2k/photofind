import { useState } from 'react'
import { formatCapture, formatLocation } from './formatters'
import { hasLocation } from './filters'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import type { LiteMediaRecord } from './types'

interface PhotoResultsProps {
  items: LiteMediaRecord[]
  visibleCount: number
  selectedId: string | null
  sessionFiles: Map<string, File>
  onShowMore(): void
}

export function PhotoResults({ items, visibleCount, selectedId, sessionFiles, onShowMore }: PhotoResultsProps): JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const visible = items.slice(0, visibleCount)
  return (
    <section className="viewer-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Viewer</div>
          <h2>{items.length.toLocaleString()} matching photos</h2>
        </div>
        <span className="muted">Showing {Math.min(visibleCount, items.length).toLocaleString()} · click a photo to enlarge</span>
      </div>
      {items.length === 0 ? (
        <p className="muted">No photos match the current filters.</p>
      ) : (
        <div className="photo-grid">
          {visible.map((item, index) => (
            <button
              type="button"
              className={selectedId === item.id ? 'photo-card photo-card-button selected' : 'photo-card photo-card-button'}
              key={item.id}
              onClick={() => setOpenIndex(index)}
              title={`Open ${item.name}`}
            >
              <div className="photo-preview"><LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} /></div>
              <div className="photo-card-body">
                <strong className="photo-name" title={item.relativePath}>{item.name}</strong>
                <span className="photo-date">{formatCapture(item)}</span>
                <span className="photo-detail">{hasLocation(item) ? formatLocation(item) : 'No location'}{item.cameraModel ? ` · ${item.cameraModel}` : ''}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {visibleCount < items.length && (
        <button className="load-more" onClick={onShowMore}>
          Show {Math.min(120, items.length - visibleCount)} more
        </button>
      )}
      {openIndex !== null && (
        <PhotoLightbox
          items={items}
          index={openIndex}
          sessionFiles={sessionFiles}
          onIndex={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </section>
  )
}
