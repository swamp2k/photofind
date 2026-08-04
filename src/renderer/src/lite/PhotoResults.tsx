import { useState } from 'react'
import { formatCapture, formatLocation } from './formatters'
import { hasLocation } from './filters'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { ReviewControls } from './ReviewControls'
import type { LiteMediaRecord, LiteReviewState } from './types'

interface PhotoResultsProps {
  items: LiteMediaRecord[]
  visibleCount: number
  selectedId: string | null
  sessionFiles: Map<string, File>
  onShowMore(): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

export function PhotoResults({ items, visibleCount, selectedId, sessionFiles, onShowMore, onReview }: PhotoResultsProps): JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const visible = items.slice(0, visibleCount)
  const selection = useExplorerPhotoSelection(items)
  return (
    <section className="viewer-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Viewer</div>
          <h2>{items.length.toLocaleString()} matching photos</h2>
        </div>
        <span className="muted">Showing {Math.min(visibleCount, items.length).toLocaleString()} · click to preview · Ctrl-click to select · Shift-click for a range</span>
      </div>

      <PhotoSelectionBar items={selection.selectedItems} onReview={(targets, state) => targets.forEach((item) => onReview(item, state))} onClear={selection.clear} />

      {items.length === 0 ? (
        <p className="muted">No photos match the current filters.</p>
      ) : (
        <div className="photo-grid">
          {visible.map((item, index) => {
            const selected = selection.isSelected(item.id)
            const mapSelected = selectedId === item.id
            return (
              <article className={[selected ? 'photo-card explorer-selected' : 'photo-card', mapSelected ? 'selected' : ''].filter(Boolean).join(' ')} key={item.id}>
                <button
                  type="button"
                  className="photo-open-button"
                  aria-pressed={selected}
                  onClick={(event) => selection.handlePhotoClick(event, item.id, () => setOpenIndex(index))}
                  title={`Open ${item.name}`}
                >
                  <div className="photo-preview">
                    <LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} />
                    {item.qualityStatus === 'ready' && item.qualityTier && <span className={`photo-quality-badge ${item.qualityTier}`}>{item.qualityScore}</span>}
                    {selected && <span className="selection-check">✓</span>}
                  </div>
                  <div className="photo-card-body">
                    <strong className="photo-name" title={item.relativePath}>{item.name}</strong>
                    <span className="photo-date">{formatCapture(item)}</span>
                    <span className="photo-detail">{hasLocation(item) ? formatLocation(item) : 'No location'}{item.cameraModel ? ` · ${item.cameraModel}` : ''}</span>
                  </div>
                </button>
                <ReviewControls item={item} compact onReview={onReview} />
              </article>
            )
          })}
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
          onReview={onReview}
        />
      )}
    </section>
  )
}
