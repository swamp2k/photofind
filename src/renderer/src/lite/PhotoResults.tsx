import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCapture, formatLocation } from './formatters'
import { hasLocation } from './filters'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { sortLibraryPhotos, type LitePhotoSort, type LitePhotoSortDirection } from './photoSort'
import { ReviewControls } from './ReviewControls'
import type { LiteMediaRecord, LiteReviewState } from './types'

interface PhotoResultsProps {
  items: LiteMediaRecord[]
  visibleCount: number
  batchSize: number
  flowLoading: boolean
  selectedId: string | null
  sessionFiles: Map<string, File>
  itemActionLabel?: string
  onItemAction?(item: LiteMediaRecord): void
  onShowMore(): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

export function PhotoResults({ items, visibleCount, batchSize, flowLoading, selectedId, sessionFiles, itemActionLabel, onItemAction, onShowMore, onReview }: PhotoResultsProps): JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<LitePhotoSort>('exif')
  const [sortDirection, setSortDirection] = useState<LitePhotoSortDirection>('desc')
  const flowSentinelRef = useRef<HTMLDivElement | null>(null)
  const sortedItems = useMemo(() => sortLibraryPhotos(items, sortBy, sortDirection), [items, sortBy, sortDirection])
  const visible = sortedItems.slice(0, visibleCount)
  const selection = useExplorerPhotoSelection(sortedItems)
  const automaticFlow = flowLoading && typeof IntersectionObserver !== 'undefined'
  const hasMore = visibleCount < sortedItems.length

  useEffect(() => {
    setOpenIndex(null)
  }, [sortBy, sortDirection])

  useEffect(() => {
    if (!automaticFlow || !hasMore) return
    const target = flowSentinelRef.current
    if (!target) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onShowMore()
    }, { rootMargin: '600px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [automaticFlow, hasMore, onShowMore, visibleCount])

  return (
    <section className="viewer-section">
      <div className="section-heading library-section-heading">
        <div>
          <div className="eyebrow">Viewer</div>
          <h2>{items.length.toLocaleString()} matching photos</h2>
        </div>
        <div className="library-sort-toolbar">
          <label><span>Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as LitePhotoSort)}><option value="exif">Date taken (EXIF)</option><option value="filename">Filename</option><option value="folder">Folder name</option></select></label>
          <button type="button" className="quiet-button" onClick={() => setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')} title="Reverse photo sort">{sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}</button>
        </div>
        <span className="muted library-view-hint">Showing {Math.min(visibleCount, items.length).toLocaleString()} · {batchSize.toLocaleString()} per batch{automaticFlow ? ' · Flow on' : ''} · click to preview · Ctrl-click to select · Shift-click for a range</span>
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
              <article className={[selected ? 'photo-card explorer-selected' : 'photo-card', mapSelected ? 'selected' : ''].filter(Boolean).join(' ')} key={item.id} data-photofind-photo-id={item.id}>
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
                {itemActionLabel && onItemAction && <button type="button" className="quiet-button photo-card-extra-action" onClick={() => onItemAction(item)}>{itemActionLabel}</button>}
              </article>
            )
          })}
        </div>
      )}
      {hasMore && !automaticFlow && (
        <button className="load-more" onClick={onShowMore}>
          Show {Math.min(batchSize, sortedItems.length - visibleCount).toLocaleString()} more
        </button>
      )}
      {hasMore && automaticFlow && <div ref={flowSentinelRef} aria-hidden="true" style={{ height: 1 }} />}
      {openIndex !== null && (
        <PhotoLightbox
          items={sortedItems}
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
