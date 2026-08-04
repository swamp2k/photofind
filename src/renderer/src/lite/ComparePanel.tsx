import { useEffect, useMemo, useState } from 'react'
import { formatCapture } from './formatters'
import { LocalPhotoImage } from './LocalPhotoImage'
import { PhotoLightbox } from './PhotoLightbox'
import { bestTechnicalCandidate } from './qualityRanking'
import { reviewStateOf } from './review'
import { SourcePath } from './SourcePathView'
import { sourceFolderLabel, summarizeSourceFolders } from './sourcePaths'
import type { LiteMediaRecord, LiteReviewState, LiteSimilarityGroup } from './types'

interface ComparePanelProps {
  items: LiteMediaRecord[]
  groups: LiteSimilarityGroup[]
  sessionFiles: Map<string, File>
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
  onPickBest(selected: LiteMediaRecord, others: LiteMediaRecord[]): void
}

export function ComparePanel({ items, groups, sessionFiles, onReview, onPickBest }: ComparePanelProps): JSX.Element {
  const [groupIndex, setGroupIndex] = useState(0)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const resolvedGroupIndex = Math.min(groupIndex, Math.max(0, groups.length - 1))
  const group = groups[resolvedGroupIndex]
  const candidates = useMemo(() => group ? group.itemIds.map((id) => byId.get(id)).filter(isMediaRecord) : [], [byId, group])
  const sourceFolders = useMemo(() => summarizeSourceFolders(candidates), [candidates])
  const technicalBest = useMemo(() => bestTechnicalCandidate(candidates), [candidates])
  const [selectedId, setSelectedId] = useState<string | null>(technicalBest?.id ?? candidates[0]?.id ?? null)
  const selected = candidates.find((item) => item.id === selectedId) ?? candidates[0]

  function moveGroup(direction: -1 | 1): void {
    setOpenIndex(null)
    setGroupIndex((current) => Math.max(0, Math.min(groups.length - 1, current + direction)))
  }

  function keepSuggestionAndAdvance(): void {
    if (!technicalBest) return
    onReview(technicalBest, 'keep')
    if (resolvedGroupIndex < groups.length - 1) moveGroup(1)
  }

  useEffect(() => {
    setSelectedId(technicalBest?.id ?? candidates[0]?.id ?? null)
    setOpenIndex(null)
  }, [group?.id])

  useEffect(() => {
    if (groupIndex < groups.length) return
    setGroupIndex(Math.max(0, groups.length - 1))
  }, [groupIndex, groups.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (openIndex !== null || isEditableTarget(event.target)) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        moveGroup(-1)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        moveGroup(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [groups.length, openIndex])

  if (groups.length === 0 || !group) {
    return <section className="compare-empty"><h2>No comparison groups yet</h2><p>Run duplicate analysis first. PhotoFind will then collect exact duplicates, bursts and similar scenes here.</p></section>
  }

  return (
    <section className="compare-mode">
      <header className="compare-header">
        <button type="button" className="quiet-button" disabled={resolvedGroupIndex === 0} onClick={() => moveGroup(-1)}>← Previous group</button>
        <div><span className={`group-kind ${group.kind}`}>{groupLabel(group.kind)}</span><strong>Compare {candidates.length} related photos</strong><p>{group.reason}</p><div className="compare-source-summary">{sourceFolders.map((summary) => <span key={summary.folder}>{sourceFolderLabel(summary.folder)} <b>{summary.count}</b></span>)}</div></div>
        <div className="compare-counter"><strong>{resolvedGroupIndex + 1} / {groups.length}</strong><span>Use ← and →</span><button type="button" className="quiet-button" disabled={resolvedGroupIndex >= groups.length - 1} onClick={() => moveGroup(1)}>Next group →</button></div>
      </header>

      {technicalBest && <div className="technical-suggestion"><span>✦</span><div><strong>Technical suggestion: {technicalBest.name}</strong><p>Highest current technical score in this group. Keeping it does not reject the alternatives.</p></div><button type="button" onClick={keepSuggestionAndAdvance}>Keep suggestion {resolvedGroupIndex < groups.length - 1 ? '& next' : ''}</button></div>}

      <div className="compare-candidates">
        {candidates.slice(0, 8).map((item, index) => (
          <article className={selected?.id === item.id ? 'compare-candidate selected' : 'compare-candidate'} key={item.id}>
            <button type="button" className="compare-candidate-image" onClick={() => { setSelectedId(item.id); setOpenIndex(index) }} title={`Open larger preview of ${item.name}`}>
              <LocalPhotoImage item={item} sessionFile={sessionFiles.get(item.id)} />
              {technicalBest?.id === item.id && <span className="technical-crown">Best technical</span>}
              <span className={`candidate-review ${reviewStateOf(item)}`}>{reviewStateOf(item)}</span>
              <span className="compare-enlarge-hint">Click to enlarge</span>
            </button>
            <div className="compare-candidate-meta">
              <strong>{item.name}</strong>
              <SourcePath item={item} compact />
              <span>{formatCapture(item)}</span>
              <div className="candidate-score"><strong>{item.qualityScore ?? '–'}</strong><span>quality</span></div>
              <div className="candidate-signals"><span>Sharp {item.sharpnessScore ?? '–'}</span><span>Exposure {item.exposureScore ?? '–'}</span><span>Resolution {item.resolutionScore ?? '–'}</span></div>
              <button type="button" className={selected?.id === item.id ? 'candidate-select active' : 'candidate-select'} onClick={() => setSelectedId(item.id)}>{selected?.id === item.id ? 'Selected' : 'Select this photo'}</button>
            </div>
          </article>
        ))}
      </div>
      {candidates.length > 8 && <p className="muted">Showing the first 8 of {candidates.length} related photos in this group. The larger preview can navigate the complete group.</p>}

      <div className="compare-actions">
        <button type="button" className="decision reject" disabled={!selected} onClick={() => selected && onReview(selected, 'reject')}>× Reject selected</button>
        <button type="button" className="decision maybe" disabled={!selected} onClick={() => selected && onReview(selected, 'maybe')}>? Maybe selected</button>
        <button type="button" className="decision keep" disabled={!selected} onClick={() => selected && onReview(selected, 'keep')}>✓ Keep selected</button>
        <button type="button" className="primary" disabled={!selected || candidates.length < 2} onClick={() => {
          if (selected && window.confirm(`Keep “${selected.name}” and reject the other ${candidates.length - 1} photos in this group? Review decisions remain reversible.`)) onPickBest(selected, candidates.filter((item) => item.id !== selected.id))
        }}>Keep one · reject others</button>
      </div>

      {openIndex !== null && candidates[openIndex] && (
        <PhotoLightbox
          items={candidates}
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

function groupLabel(kind: LiteSimilarityGroup['kind']): string {
  if (kind === 'exact') return 'Exact duplicates'
  if (kind === 'burst') return 'Burst sequence'
  return 'Similar scene'
}

function isMediaRecord(item: LiteMediaRecord | undefined): item is LiteMediaRecord {
  return Boolean(item)
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)
}
