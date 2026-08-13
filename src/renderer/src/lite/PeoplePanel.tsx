import { useEffect, useMemo, useState } from 'react'
import { LocalFaceCrop } from './LocalFaceCrop'
import { faceReference, peoplePhotoCounts, rarePersonPairs } from './people'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { SourcePath } from './SourcePathView'
import type { LiteFaceObservation, LiteMediaRecord, LitePeopleProgress, LitePersonRecord, LiteReviewState } from './types'

interface PeoplePanelProps {
  items: LiteMediaRecord[]
  people: LitePersonRecord[]
  sessionFiles: Map<string, File>
  progress: LitePeopleProgress | null
  busy: boolean
  reconnectRequired: boolean
  onRename(personId: string, name: string): void
  onIgnore(personId: string, ignored: boolean): void
  onMerge(sourceId: string, targetId: string): void
  onSplit(faceRef: string): void
  onExclude(faceRef: string, personId: string): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

interface FaceEntry {
  item: LiteMediaRecord
  face: LiteFaceObservation
  ref: string
}

export function PeoplePanel(props: PeoplePanelProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)
  const [showSingletons, setShowSingletons] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const faceEntries = useMemo(() => collectFaceEntries(props.items), [props.items])
  const photoCounts = useMemo(() => peoplePhotoCounts(props.items), [props.items])
  const analyzedPhotos = props.items.filter((item) => item.kind === 'image' && item.faceAnalysisStatus === 'ready').length
  const visiblePeople = useMemo(() => props.people.filter((person) => {
    const visiblePhotos = photoCounts.get(person.id) ?? 0
    return visiblePhotos > 0 && (showIgnored || !person.ignored) && (showSingletons || visiblePhotos > 1)
  }), [photoCounts, props.people, showIgnored, showSingletons])
  const selected = visiblePeople.find((person) => person.id === selectedId) ?? visiblePeople[0] ?? null
  const selectedFaces = selected ? selected.faceRefs.map((ref) => faceEntries.get(ref)).filter(isFaceEntry) : []
  const selectedPhotoItems = useMemo(() => uniquePhotos(selectedFaces), [selectedFaces])
  const selection = useExplorerPhotoSelection(selectedPhotoItems)
  const pairs = useMemo(() => rarePersonPairs(props.items).filter((pair) => pair.photoCount <= 3).slice(0, 8), [props.items])
  const peopleById = useMemo(() => new Map(props.people.map((person) => [person.id, person])), [props.people])

  useEffect(() => {
    if (!selected) return
    setSelectedId(selected.id)
    setNameDraft(selected.name ?? '')
    setMergeTarget('')
    setOpenIndex(null)
    selection.clear()
  }, [selected?.id])

  return (
    <section className="people-section compact-mode-section">
      {props.reconnectRequired && <div className="notice warning inline-notice">Reconnect the source folder before running People analysis.</div>}
      {props.progress && <PeopleProgress progress={props.progress} />}

      {analyzedPhotos === 0 ? (
        props.busy ? null : <div className="compact-empty-state"><strong>People analysis has not been run yet.</strong><span>Use “Analyze people” in the top toolbar. Face detection and embeddings remain local to this browser.</span></div>
      ) : props.people.length === 0 ? <div className="compact-empty-state"><strong>No recurring faces found.</strong><span>Analysis completed, but no usable recurring face clusters were available.</span></div> : (
        <div className="people-workspace">
          <div className="people-browser">
            <div className="people-browser-toolbar"><strong>{visiblePeople.length.toLocaleString()} visible people</strong><span className="muted">{analyzedPhotos.toLocaleString()} photos analyzed</span><label><input type="checkbox" checked={showSingletons} onChange={(event) => setShowSingletons(event.target.checked)} /> Show one-off faces</label><label><input type="checkbox" checked={showIgnored} onChange={(event) => setShowIgnored(event.target.checked)} /> Show ignored</label></div>
            <div className="people-grid">
              {visiblePeople.map((person) => {
                const first = person.faceRefs.map((ref) => faceEntries.get(ref)).find(isFaceEntry)
                return <button type="button" className={selected?.id === person.id ? 'person-card selected' : person.ignored ? 'person-card ignored' : 'person-card'} key={person.id} onClick={() => setSelectedId(person.id)}>
                  <div className="person-cover">{first ? <LocalFaceCrop item={first.item} face={first.face} sessionFile={props.sessionFiles.get(first.item.id)} /> : <span>No preview</span>}</div>
                  <strong>{personLabel(person)}</strong><span>{(photoCounts.get(person.id) ?? 0).toLocaleString()} photos · {person.faceRefs.length.toLocaleString()} faces</span>{person.ignored && <small>Ignored</small>}
                </button>
              })}
            </div>
            {visiblePeople.length === 0 && <p className="muted">No clusters match the current visibility options.</p>}
          </div>

          <aside className="person-detail">
            {!selected ? <p className="muted">Choose a person cluster.</p> : <>
              <div className="person-detail-head"><div><span className="inspector-label">Selected cluster</span><h3>{personLabel(selected)}</h3><p>{(photoCounts.get(selected.id) ?? 0).toLocaleString()} photos · {selected.faceRefs.length.toLocaleString()} detected faces</p></div>{selectedFaces[0] && <div className="person-avatar"><LocalFaceCrop item={selectedFaces[0].item} face={selectedFaces[0].face} sessionFile={props.sessionFiles.get(selectedFaces[0].item.id)} size={120} /></div>}</div>

              <div className="person-editor"><label><span>Name</span><input value={nameDraft} placeholder="Unnamed person" onChange={(event) => setNameDraft(event.target.value)} /></label><button type="button" onClick={() => props.onRename(selected.id, nameDraft)}>Save name</button></div>
              <div className="person-editor"><label><span>Merge this cluster into</span><select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}><option value="">Choose another person…</option>{props.people.filter((person) => person.id !== selected.id && !person.ignored).map((person) => <option key={person.id} value={person.id}>{personLabel(person)} · {person.faceRefs.length} faces</option>)}</select></label><button type="button" disabled={!mergeTarget} onClick={() => { if (mergeTarget && window.confirm(`Merge “${personLabel(selected)}” into “${personLabel(peopleById.get(mergeTarget)!)}”? Every assignment remains local and can later be split again.`)) props.onMerge(selected.id, mergeTarget) }}>Merge</button></div>
              <button type="button" className={selected.ignored ? '' : 'danger-outline'} onClick={() => props.onIgnore(selected.id, !selected.ignored)}>{selected.ignored ? 'Restore person' : 'Ignore this person'}</button>

              <div className="person-face-list-head"><strong>Faces in this cluster</strong><span>Correct false matches directly. “Not this person” becomes a persistent negative constraint.</span></div>
              <PhotoSelectionBar items={selection.selectedItems} onReview={(targets, state) => targets.forEach((item) => props.onReview(item, state))} onClear={selection.clear} />
              <div className="person-face-list">
                {selectedFaces.slice(0, 80).map((entry) => {
                  const photoIndex = selectedPhotoItems.findIndex((item) => item.id === entry.item.id)
                  const photoSelected = selection.isSelected(entry.item.id)
                  return <article className={photoSelected ? 'person-face-entry explorer-selected' : 'person-face-entry'} key={entry.ref}>
                    <button type="button" className="person-face-crop person-face-open" aria-pressed={photoSelected} onClick={(event) => selection.handlePhotoClick(event, entry.item.id, () => setOpenIndex(Math.max(0, photoIndex)))}>
                      <LocalFaceCrop item={entry.item} face={entry.face} sessionFile={props.sessionFiles.get(entry.item.id)} size={110} />
                      {photoSelected && <span className="selection-check">✓</span>}
                    </button>
                    <div><strong>{entry.item.name}</strong><SourcePath item={entry.item} compact /><div className="person-face-actions"><button type="button" className="quiet-button" disabled={selected.faceRefs.length <= 1} onClick={() => props.onSplit(entry.ref)}>Split into new person</button><button type="button" className="danger-outline" onClick={() => props.onExclude(entry.ref, selected.id)}>Not this person</button></div></div>
                  </article>
                })}
              </div>
              {selectedFaces.length > 80 && <p className="muted">Showing the first 80 detected faces in this cluster.</p>}
            </>}
          </aside>
        </div>
      )}

      {pairs.length > 0 && <details className="people-insights"><summary><span>Rare combinations</span><strong>{pairs.length}</strong></summary><p>Potentially meaningful combinations that appear together in only a few photos.</p><div>{pairs.map((pair) => <span key={pair.personIds.join('-')}><strong>{personLabel(peopleById.get(pair.personIds[0]))}</strong> + <strong>{personLabel(peopleById.get(pair.personIds[1]))}</strong> · {pair.photoCount} photo{pair.photoCount === 1 ? '' : 's'}</span>)}</div></details>}

      {openIndex !== null && selectedPhotoItems[openIndex] && <PhotoLightbox items={selectedPhotoItems} index={openIndex} sessionFiles={props.sessionFiles} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} onReview={props.onReview} />}
    </section>
  )
}

function PeopleProgress({ progress }: { progress: LitePeopleProgress }): JSX.Element {
  const label = progress.phase === 'models' ? 'Loading same-origin face models' : progress.phase === 'clustering' ? 'Clustering face descriptors locally' : 'Analyzing photos locally'
  return <div className="analysis-progress people-progress"><div><strong>{label}</strong><span>{progress.complete.toLocaleString()} / {progress.total.toLocaleString()} · {progress.reused.toLocaleString()} reused · {progress.facesFound.toLocaleString()} faces</span></div><progress max={Math.max(1, progress.total)} value={progress.complete} /><span className="muted" title={progress.currentPath}>{progress.currentPath}</span></div>
}

function collectFaceEntries(items: LiteMediaRecord[]): Map<string, FaceEntry> {
  const map = new Map<string, FaceEntry>()
  for (const item of items) for (const face of item.faces ?? []) map.set(faceReference(item.id, face.id), { item, face, ref: faceReference(item.id, face.id) })
  return map
}

function uniquePhotos(entries: FaceEntry[]): LiteMediaRecord[] {
  const seen = new Set<string>()
  const output: LiteMediaRecord[] = []
  for (const entry of entries) {
    if (seen.has(entry.item.id)) continue
    seen.add(entry.item.id)
    output.push(entry.item)
  }
  return output
}

function personLabel(person: LitePersonRecord | undefined): string {
  if (!person) return 'Unknown person'
  return person.name?.trim() || `Unnamed ${person.id.slice(-6)}`
}

function isFaceEntry(value: FaceEntry | undefined): value is FaceEntry {
  return Boolean(value)
}
