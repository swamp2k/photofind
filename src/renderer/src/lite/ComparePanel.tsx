import { useEffect, useMemo, useState } from 'react'
import { formatCapture } from './formatters'
import { LocalPhotoImage } from './LocalPhotoImage'
import { bestTechnicalCandidate } from './qualityRanking'
import { reviewStateOf } from './review'
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
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const group = groups[Math.min(groupIndex, Math.max(0, groups.length - 1))]
  const candidates = useMemo(() => group ? group.itemIds.map((id) => byId.get(id)).filter(isMediaRecord) : [], [byId, group])
  const technicalBest = useMemo(() => bestTechnicalCandidate(candidates), [candidates])
  const [selectedId, setSelectedId] = useState<string | null>(technicalBest?.id ?? candidates[0]?.id ?? null)
  const selected = candidates.find((item) => item.id === selectedId) ?? candidates[0]

  useEffect(() => {
    setSelectedId(technicalBest?.id ?? candidates[0]?.id ?? null)
  }, [group?.id])

  if (groups.length === 0 || !group) {
    return <section className="compare-empty"><h2>No comparison groups yet</h2><p>Run similarity analysis first. PhotoFind will then collect exact duplicates, bursts and similar scenes here.</p></section>
  }

  return (
    <section className="compare-mode">
      <header className="compare-header">
        <button type="button" className="quiet-button" disabled={groupIndex === 0} onClick={() => setGroupIndex(groupIndex - 1)}>← Previous group</button>
        <div><span className={`group-kind ${group.kind}`}>{groupLabel(group.kind)}</span><strong>Compare {candidates.length} related photos</strong><p>{group.reason}</p></div>
        <div className="compare-counter"><strong>{groupIndex + 1} / {groups.length}</strong><button type="button" className="quiet-button" disabled={groupIndex >= groups.length - 1} onClick={() => setGroupIndex(groupIndex + 1)}>Next group →</button></div>
      </header>

      {technicalBest && <div className="technical-suggestion"><span>✦</span><div><strong>Technical suggestion: {technicalBest.name}</strong><p>Highest current technical score in this group. This is guidance only; memory value remains your decision.</p></div><button type="button" onClick={() => setSelectedId(technicalBest.id)}>Select suggestion</button></div>}

      <div className="compare-candidates">
        {candidates.slice(0, 8).map((item) => (
          <article className={selected?.id === item.id ? 'compare-candidate selected' : 'compare-candidate'} key={item.id}>
            <button type="button" className="compare-candidate-image" onClick={() => setSelectedId(item.id)}>
              <LocalPhotoImage item={item} sessionFile={sessionFiles.get(item.id)} />
              {technicalBest?.id === item.id && <span className="technical-crown">Best technical</span>}
              <span className={`candidate-review ${reviewStateOf(item)}`}>{reviewStateOf(item)}</span>
            </button>
            <div className="compare-candidate-meta">
              <strong>{item.name}</strong>
              <span>{formatCapture(item)}</span>
              <div className="candidate-score"><strong>{item.qualityScore ?? '–'}</strong><span>quality</span></div>
              <div className="candidate-signals"><span>Sharp {item.sharpnessScore ?? '–'}</span><span>Exposure {item.exposureScore ?? '–'}</span><span>Resolution {item.resolutionScore ?? '–'}</span></div>
            </div>
          </article>
        ))}
      </div>
      {candidates.length > 8 && <p className="muted">Showing the first 8 of {candidates.length} related photos in this group.</p>}

      <div className="compare-actions">
        <button type="button" className="decision reject" disabled={!selected} onClick={() => selected && onReview(selected, 'reject')}>× Reject selected</button>
        <button type="button" className="decision maybe" disabled={!selected} onClick={() => selected && onReview(selected, 'maybe')}>? Maybe selected</button>
        <button type="button" className="decision keep" disabled={!selected} onClick={() => selected && onReview(selected, 'keep')}>✓ Keep selected</button>
        <button type="button" className="primary" disabled={!selected || candidates.length < 2} onClick={() => {
          if (selected && window.confirm(`Keep “${selected.name}” and reject the other ${candidates.length - 1} photos in this group? Review decisions remain reversible.`)) onPickBest(selected, candidates.filter((item) => item.id !== selected.id))
        }}>Keep one · reject others</button>
      </div>
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
