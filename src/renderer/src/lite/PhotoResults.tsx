import { useEffect, useMemo, useState } from 'react'
import { formatCapture, formatLocation } from './formatters'
import { hasLocation } from './filters'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { ReviewControls } from './ReviewControls'
import { sourceFolderOf } from './sourcePaths'
import type { LiteMediaRecord, LiteReviewState } from './types'

interface PhotoResultsProps {
  items: LiteMediaRecord[]
  visibleCount: number
  selectedId: string | null
  sessionFiles: Map<string, File>
  onShowMore(): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

type PhotoSort = 'exif' | 'filename' | 'folder'
type SortDirection = 'asc' | 'desc'

export function PhotoResults({ items, visibleCount, selectedId, sessionFiles, onShowMore, onReview }: PhotoResultsProps): JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<PhotoSort>('exif')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const sortedItems = useMemo(() => sortPhotos(items, sortBy, sortDirection), [items, sortBy, sortDirection])
  const visible = sortedItems.slice(0, visibleCount)
  const selection = useExplorerPhotoSelection(sortedItems)

  useEffect(() => {
    setOpenIndex(null)
    selection.clear()
  }, [sortBy, sortDirection])

  return (
    <section className="viewer-section">
      <div className="section-heading library-section-heading">
        <div>
          <div className="eyebrow">Viewer</div>
          <h2>{items.length.toLocaleString()} matching photos</h2>
        </div>
        <div className="library-sort-toolbar">
          <label><span>Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as PhotoSort)}><option value="exif">Date taken (EXIF)</option><option value="filename">Filename</option><option value="folder">Folder name</option></select></label>
          <button type="button" className="quiet-button" onClick={() => setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')} title="Reverse photo sort">{sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}</button>
        </div>
        <span className="muted library-view-hint">Showing {Math.min(visibleCount, items.length).toLocaleString()} · click to preview · Ctrl-click to select · Shift-click for a range</span>
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
      {visibleCount < sortedItems.length && (
        <button className="load-more" onClick={onShowMore}>
          Show {Math.min(120, sortedItems.length - visibleCount)} more
        </button>
      )}
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

function sortPhotos(items: LiteMediaRecord[], sortBy: PhotoSort, direction: SortDirection): LiteMediaRecord[] {
  const multiplier = direction === 'asc' ? 1 : -1
  const originalIndex = new Map(items.map((item, index) => [item.id, index]))
  return [...items].sort((left, right) => {
    if (sortBy === 'exif') {
      const leftTime = exifCaptureTime(left)
      const rightTime = exifCaptureTime(right)
      if (leftTime === undefined && rightTime === undefined) return (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0)
      if (leftTime === undefined) return 1
      if (rightTime === undefined) return -1
      return multiplier * (leftTime - rightTime || comparePath(left, right))
    }
    if (sortBy === 'folder') {
      const folder = sourceFolderOf(left.relativePath).localeCompare(sourceFolderOf(right.relativePath), undefined, { numeric: true, sensitivity: 'base' })
      return multiplier * (folder || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
    }
    return multiplier * left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function exifCaptureTime(item: LiteMediaRecord): number | undefined {
  return item.captureTimeSource === 'exif' && typeof item.effectiveCaptureTime === 'number' && Number.isFinite(item.effectiveCaptureTime)
    ? item.effectiveCaptureTime
    : undefined
}

function comparePath(left: LiteMediaRecord, right: LiteMediaRecord): number {
  return left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: 'base' })
}
