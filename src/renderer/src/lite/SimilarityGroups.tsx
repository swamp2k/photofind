import { useMemo, useState } from 'react'
import { formatCapture } from './formatters'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import type { LiteMediaRecord, LiteSimilarityGroup, LiteSimilarityProgress } from './types'

interface SimilarityGroupsProps {
  items: LiteMediaRecord[]
  groups: LiteSimilarityGroup[]
  sessionFiles: Map<string, File>
  progress: LiteSimilarityProgress | null
  busy: boolean
  reconnectRequired: boolean
  onAnalyze(): void
}

export function SimilarityGroups({ items, groups, sessionFiles, progress, busy, reconnectRequired, onAnalyze }: SimilarityGroupsProps): JSX.Element {
  const [kind, setKind] = useState<'all' | 'exact' | 'burst' | 'similar'>('all')
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [openIndex, setOpenIndex] = useState(0)
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const analyzed = items.filter((item) => item.kind === 'image' && item.similarityStatus === 'ready').length
  const failed = items.filter((item) => item.kind === 'image' && item.similarityStatus === 'failed').length
  const total = items.filter((item) => item.kind === 'image').length
  const visibleGroups = kind === 'all' ? groups : groups.filter((group) => group.kind === kind)
  const exactCount = groups.filter((group) => group.kind === 'exact').length
  const burstCount = groups.filter((group) => group.kind === 'burst').length
  const similarCount = groups.filter((group) => group.kind === 'similar').length
  const openGroup = openGroupId ? groups.find((group) => group.id === openGroupId) ?? null : null
  const openItems = openGroup ? openGroup.itemIds.map((id) => byId.get(id)).filter(isMediaRecord) : []

  return (
    <section className="similarity-section">
      <div className="similarity-hero">
        <div>
          <div className="eyebrow">Lite 3 · local analysis</div>
          <h2>Duplicates, bursts & similar moments</h2>
          <p className="muted">PhotoFind hashes and visually fingerprints photos in a browser worker. Derived fingerprints stay in this browser index.</p>
        </div>
        <button className="primary" type="button" disabled={busy || reconnectRequired || total === 0} onClick={onAnalyze}>
          {busy ? 'Analyzing…' : analyzed > 0 ? 'Refresh similarity analysis' : 'Analyze similarity'}
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
      ) : (
        <>
          <div className="group-filter-tabs" aria-label="Similarity group type">
            <button className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>All <span>{groups.length}</span></button>
            <button className={kind === 'exact' ? 'active' : ''} onClick={() => setKind('exact')}>Exact <span>{exactCount}</span></button>
            <button className={kind === 'burst' ? 'active' : ''} onClick={() => setKind('burst')}>Bursts <span>{burstCount}</span></button>
            <button className={kind === 'similar' ? 'active' : ''} onClick={() => setKind('similar')}>Similar <span>{similarCount}</span></button>
          </div>
          <div className="similarity-groups">
            {visibleGroups.slice(0, 100).map((group) => {
              const groupItems = group.itemIds.map((id) => byId.get(id)).filter(isMediaRecord)
              return (
                <article className="similarity-group" key={group.id}>
                  <div className="similarity-group-head">
                    <div><span className={`group-kind ${group.kind}`}>{groupLabel(group.kind)}</span><strong>{groupItems.length} photos</strong><p>{group.reason}</p></div>
                    <button type="button" onClick={() => { setOpenGroupId(group.id); setOpenIndex(0) }}>Compare</button>
                  </div>
                  <div className="compare-strip">
                    {groupItems.slice(0, 10).map((item, index) => (
                      <button type="button" className="compare-thumb" key={item.id} onClick={() => { setOpenGroupId(group.id); setOpenIndex(index) }}>
                        <div className="compare-image"><LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} /></div>
                        <span>{formatCapture(item)}</span>
                      </button>
                    ))}
                    {groupItems.length > 10 && <div className="compare-more">+{groupItems.length - 10}</div>}
                  </div>
                </article>
              )
            })}
          </div>
          {visibleGroups.length > 100 && <p className="muted">Showing the first 100 groups. More focused group filtering will come with the review workflow.</p>}
        </>
      )}

      {openGroup && openItems.length > 0 && (
        <PhotoLightbox
          items={openItems}
          index={Math.min(openIndex, openItems.length - 1)}
          sessionFiles={sessionFiles}
          onIndex={setOpenIndex}
          onClose={() => setOpenGroupId(null)}
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
