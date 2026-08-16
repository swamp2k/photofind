import { useMemo, useState } from 'react'
import { formatCapture } from './formatters'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { qualityTierLabel } from './quality'
import { bestTechnicalCandidate } from './qualityRanking'
import { ReviewControls } from './ReviewControls'
import { reviewStateOf } from './review'
import { SourceFolderButton, SourcePath } from './SourcePathView'
import { summarizeSourceFolders } from './sourcePaths'
import type { LiteMediaRecord, LiteReviewFilter, LiteReviewState, LiteSimilarityGroup, LiteSimilarityProgress } from './types'

interface SimilarityGroupsProps {
  items: LiteMediaRecord[]
  groups: LiteSimilarityGroup[]
  reviewFilter: LiteReviewFilter
  sessionFiles: Map<string, File>
  progress: LiteSimilarityProgress | null
  busy: boolean
  reconnectRequired: boolean
  onAnalyze(): void
  onAbort(): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
  onApprove(items: LiteMediaRecord[]): void
}

export function SimilarityGroups({ items, groups, reviewFilter, sessionFiles, progress, busy, reconnectRequired, onAnalyze, onAbort, onReview, onApprove }: SimilarityGroupsProps): JSX.Element {
  const [kind, setKind] = useState<'all' | 'exact' | 'burst' | 'similar'>('all')
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [openIndex, setOpenIndex] = useState(0)
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const analyzed = items.filter((item) => item.kind === 'image' && item.similarityStatus === 'ready').length
  const failed = items.filter((item) => item.kind === 'image' && item.similarityStatus === 'failed').length
  const total = items.filter((item) => item.kind === 'image').length
  const reviewGroups = useMemo(() => groups.filter((group) => reviewFilter === 'all' || group.itemIds.some((id) => {
    const item = byId.get(id)
    return item ? reviewStateOf(item) === reviewFilter : false
  })), [byId, groups, reviewFilter])
  const visibleGroups = kind === 'all' ? reviewGroups : reviewGroups.filter((group) => group.kind === kind)
  const exactCount = reviewGroups.filter((group) => group.kind === 'exact').length
  const burstCount = reviewGroups.filter((group) => group.kind === 'burst').length
  const similarCount = reviewGroups.filter((group) => group.kind === 'similar').length
  const openGroup = openGroupId ? groups.find((group) => group.id === openGroupId) ?? null : null
  const openItems = openGroup ? openGroup.itemIds.map((id) => byId.get(id)).filter(isMediaRecord) : []
  const selectableItems = useMemo(() => {
    const seen = new Set<string>()
    const output: LiteMediaRecord[] = []
    for (const group of visibleGroups.slice(0, 100)) {
      for (const id of group.itemIds.slice(0, 10)) {
        if (seen.has(id)) continue
        const item = byId.get(id)
        if (!item) continue
        seen.add(id)
        output.push(item)
      }
    }
    return output
  }, [byId, visibleGroups])
  const selection = useExplorerPhotoSelection(selectableItems)

  return (
    <section className="similarity-section">
      <div className="similarity-hero">
        <div>
          <div className="eyebrow">Lite 3 · local analysis</div>
          <h2>Duplicates, bursts & similar moments</h2>
          <p className="muted">PhotoFind hashes and visually fingerprints photos in a browser worker. Click to preview; Ctrl-click or Shift-click to select photos across groups.</p>
        </div>
        <button className={busy ? 'danger-outline' : 'primary'} type="button" disabled={reconnectRequired || total === 0} onClick={busy ? onAbort : onAnalyze}>
          {busy ? 'Stop similarity analysis' : analyzed > 0 ? 'Refresh similarity analysis' : 'Analyze similarity'}
        </button>
      </div>

      {reconnectRequired && <div className="notice warning inline-notice">Reconnect the source folder before running similarity analysis.</div>}
      {progress && (
        <div className="analysis-progress">
          <div><strong>{progress.complete.toLocaleString()} / {progress.total.toLocaleString()}</strong><span>{progress.reused.toLocaleString()} unchanged reused</span></div>
          <progress max={Math.max(1, progress.total)} value={progress.complete} />
          <span className="muted" title={progress.currentPath}>{progress.currentPath}</span>
        </div>
      )}

      <div className="similarity-stats">
        <Summary label="Analyzed" value={analyzed} detail={`of ${total.toLocaleString()} photos`} />
        <Summary label="Exact duplicate sets" value={exactCount} />
        <Summary label="Bursts" value={burstCount} />
        <Summary label="Similar scenes" value={similarCount} />
        <Summary label="Analysis failures" value={failed} warn={failed > 0} />
      </div>

      {analyzed === 0 ? (
        <div className="similarity-empty"><h3>Turn the pile into moments</h3><p>Run local analysis to find byte-identical copies, burst sequences and visually similar photos. No source file is changed.</p></div>
      ) : groups.length === 0 ? (
        <div className="similarity-empty"><h3>No groups found yet</h3><p>The analyzed photos did not meet the current duplicate, burst or perceptual-similarity thresholds.</p></div>
      ) : reviewGroups.length === 0 ? (
        <div className="similarity-empty"><h3>No groups match the review filter</h3><p>Change the review filter above to see other comparison groups.</p></div>
      ) : (
        <>
          <div className="group-filter-tabs" aria-label="Similarity group type">
            <button className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>All <span>{reviewGroups.length}</span></button>
            <button className={kind === 'exact' ? 'active' : ''} onClick={() => setKind('exact')}>Exact <span>{exactCount}</span></button>
            <button className={kind === 'burst' ? 'active' : ''} onClick={() => setKind('burst')}>Bursts <span>{burstCount}</span></button>
            <button className={kind === 'similar' ? 'active' : ''} onClick={() => setKind('similar')}>Similar <span>{similarCount}</span></button>
          </div>
          <PhotoSelectionBar items={selection.selectedItems} onReview={(targets, state) => targets.forEach((item) => onReview(item, state))} onClear={selection.clear} />
          <div className="similarity-groups">
            {visibleGroups.slice(0, 100).map((group) => {
              const groupItems = group.itemIds.map((id) => byId.get(id)).filter(isMediaRecord)
              const sourceFolders = summarizeSourceFolders(groupItems)
              const best = bestTechnicalCandidate(groupItems)
              const bestIndex = best ? groupItems.findIndex((item) => item.id === best.id) : 0
              const approved = groupItems.length > 0 && groupItems.every((item) => reviewStateOf(item) === 'keep')
              return (
                <article className="similarity-group" key={group.id}>
                  <div className="similarity-group-head">
                    <div>
                      <span className={`group-kind ${group.kind}`}>{groupLabel(group.kind)}</span><strong>{groupItems.length} photos</strong><p>{group.reason}</p>
                      <div className="group-source-folders" aria-label="Source folders represented in this group">
                        <span className="group-source-label">{sourceFolders.length} source folder{sourceFolders.length === 1 ? '' : 's'}</span>
                        {sourceFolders.slice(0, 8).map((summary) => <SourceFolderButton key={summary.folder} folder={summary.folder} count={summary.count} />)}
                        {sourceFolders.length > 8 && <span className="muted">+{sourceFolders.length - 8} more</span>}
                      </div>
                      {best?.qualityTier && <p className="group-best">Best technical candidate: <strong>{best.name}</strong> · {best.qualityScore}/100 {qualityTierLabel(best.qualityTier).toLowerCase()}</p>}
                    </div>
                    <div className="similarity-group-actions">
                      <button type="button" disabled={approved} onClick={() => onApprove(groupItems)}>Approve</button>
                      <button type="button" onClick={() => { setOpenGroupId(group.id); setOpenIndex(Math.max(0, bestIndex)) }}>Compare</button>
                    </div>
                  </div>
                  <div className="compare-strip">
                    {groupItems.slice(0, 10).map((item, index) => {
                      const selected = selection.isSelected(item.id)
                      return <article className={[best?.id === item.id ? 'compare-thumb best' : 'compare-thumb', selected ? 'explorer-selected' : ''].filter(Boolean).join(' ')} key={item.id}>
                        <button type="button" className="compare-open" aria-pressed={selected} onClick={(event) => selection.handlePhotoClick(event, item.id, () => { setOpenGroupId(group.id); setOpenIndex(index) })}>
                          <div className="compare-image">
                            <LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} />
                            {best?.id === item.id && <span className="best-badge">Best technical</span>}
                            {item.qualityStatus === 'ready' && <span className={`mini-quality ${item.qualityTier ?? 'okay'}`}>{item.qualityScore}</span>}
                            {selected && <span className="selection-check">✓</span>}
                          </div>
                          <span>{formatCapture(item)}</span>
                        </button>
                        <SourcePath item={item} compact />
                        <ReviewControls item={item} compact onReview={onReview} />
                      </article>
                    })}
                    {groupItems.length > 10 && <div className="compare-more">+{groupItems.length - 10}</div>}
                  </div>
                </article>
              )
            })}
          </div>
          {visibleGroups.length > 100 && <p className="muted">Showing the first 100 groups. Use the group-type filters to narrow the set.</p>}
        </>
      )}

      {openGroup && openItems.length > 0 && (
        <PhotoLightbox
          items={openItems}
          index={Math.min(openIndex, openItems.length - 1)}
          sessionFiles={sessionFiles}
          onIndex={setOpenIndex}
          onClose={() => setOpenGroupId(null)}
          onReview={onReview}
        />
      )}
    </section>
  )
}

function Summary({ label, value, detail, warn = false }: { label: string; value: number; detail?: string; warn?: boolean }): JSX.Element {
  return <div className={warn ? 'similarity-summary warn' : 'similarity-summary'}><span>{label}</span><strong>{value.toLocaleString()}</strong>{detail && <small>{detail}</small>}</div>
}

function groupLabel(kind: LiteSimilarityGroup['kind']): string {
  if (kind === 'exact') return 'Exact duplicate'
  if (kind === 'burst') return 'Burst'
  return 'Similar scene'
}

function isMediaRecord(item: LiteMediaRecord | undefined): item is LiteMediaRecord {
  return Boolean(item)
}
