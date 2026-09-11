import { useState } from 'react'
import { batchAnalysisLabel, createBatchJobs, type BatchAnalysis, type BatchJob } from './batchJobs'
import type { BatchAnalysisProgress } from './batchAnalysis'
import type { LiteLibraryRecord } from './types'
import './batch-jobs.css'

interface BatchJobsPanelProps {
  libraries: LiteLibraryRecord[]
  running: boolean
  stopping: boolean
  unavailable: boolean
  jobs: BatchJob[]
  progress: BatchAnalysisProgress | null
  notice: string | null
  onStart(jobs: BatchJob[]): void
  onResume(): void
  onStop(): void
  onReconnect(library: LiteLibraryRecord): void
}
const ANALYSES: BatchAnalysis[] = ['people', 'products', 'quality', 'duplicates']
const DESCRIPTIONS: Record<BatchAnalysis, string> = {
  people: 'Opt in to face detection and clustering. Face models and embeddings stay local; names come from you.',
  products: 'Find likely product and marketplace photos using the existing local analysis.',
  quality: 'Measure sharpness, exposure and usable detail.',
  duplicates: 'Find duplicates, bursts and similar photos within each index.'
}

export function BatchJobsPanel({ libraries, running, stopping, unavailable, jobs, progress, notice, onStart, onResume, onStop, onReconnect }: BatchJobsPanelProps): JSX.Element {
  const [selectedLibraries, setSelectedLibraries] = useState<string[]>([])
  const [selectedAnalyses, setSelectedAnalyses] = useState<BatchAnalysis[]>(['quality', 'products'])
  const selected = libraries.filter(library => selectedLibraries.includes(library.id))
  const selectionReady = selected.length > 0 && selectedAnalyses.length > 0
  const unfinished = jobs.some(job => job.status !== 'complete')
  const allSelected = selected.length === libraries.length && libraries.length > 0
  const current = jobs.find(job => job.status === 'running')
  const disabled = running || unavailable
  function toggleLibrary(id: string): void { setSelectedLibraries(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]) }
  function toggleAnalysis(analysis: BatchAnalysis): void { setSelectedAnalyses(current => current.includes(analysis) ? current.filter(value => value !== analysis) : [...current, analysis]) }
  function start(): void { onStart(createBatchJobs(selected.map(library => ({ libraryId: library.id, libraryName: library.name })), selectedAnalyses)) }

  return <section className="batch-jobs-section" aria-labelledby="batch-title">
    <div className="batch-jobs-hero">
      <div><span className="mode-kicker">Batch jobs</span><h1 id="batch-title">Run analyses across your indexes</h1><p>Choose the work once. PhotoFind runs one job at a time and saves results in each local index, reusing current analysis. Originals and review decisions stay unchanged.</p></div>
      <div className="batch-jobs-actions">{running ? <button type="button" className="danger-outline" disabled={stopping} onClick={onStop}>{stopping ? 'Stopping…' : 'Stop batch'}</button> : <>
        {unfinished && <button type="button" disabled={unavailable} onClick={onResume}>Resume / retry unfinished jobs</button>}
        <button type="button" className="primary" disabled={disabled || !selectionReady} onClick={start}>{jobs.length ? 'Start new batch' : 'Start batch'}{selectionReady ? ` · ${selected.length * selectedAnalyses.length} job${selected.length * selectedAnalyses.length === 1 ? '' : 's'}` : ''}</button>
      </>}</div>
    </div>
    <p className="batch-guidance">Keep this tab open and your computer awake. Closing or reloading the tab stops processing; the saved queue can be resumed later. Folder access is checked before starting. Failures during a run are reported while other jobs continue.</p>
    {unavailable && !running && <p role="status">Wait for the current PhotoFind operation to finish before starting a batch.</p>}
    {notice && <p className="batch-notice" role="status">{notice}</p>}
    <div className="batch-jobs-grid">
      <fieldset disabled={disabled}><legend>Analyses</legend>{ANALYSES.map(analysis => <label className="batch-choice" key={analysis}><input type="checkbox" checked={selectedAnalyses.includes(analysis)} onChange={() => toggleAnalysis(analysis)} /><span><strong>{batchAnalysisLabel(analysis)}</strong><small>{DESCRIPTIONS[analysis]}</small></span></label>)}</fieldset>
      <fieldset disabled={disabled}><legend>Indexes</legend>
        <label className="batch-choice"><input type="checkbox" checked={allSelected} onChange={() => setSelectedLibraries(allSelected ? [] : libraries.map(library => library.id))} /><span><strong>Select all indexes</strong></span></label>
        {!libraries.length && <p>Add a local folder first.</p>}
        {libraries.map(library => <div className="batch-index" key={library.id}>
          <label className="batch-choice"><input type="checkbox" checked={selectedLibraries.includes(library.id)} onChange={() => toggleLibrary(library.id)} /><span><strong>{library.name}</strong><small>{library.imageCount.toLocaleString()} photos{!library.rootHandle ? ' · reselect in Library if access is unavailable' : ''}</small></span></label>
          {library.rootHandle && <button type="button" className="quiet-button" onClick={() => onReconnect(library)} aria-label={`Reconnect ${library.name}`}>Reconnect</button>}
        </div>)}
      </fieldset>
    </div>
    {current && progress && <div className="batch-live-progress"><strong>{current.libraryName} · {batchAnalysisLabel(current.analysis)}</strong><progress aria-label="Current analysis progress" value={progress.complete} max={Math.max(1, progress.total)} /><span>{progress.complete.toLocaleString()} / {progress.total.toLocaleString()} photos · {progress.reused.toLocaleString()} reused</span><small>{progress.currentPath}</small></div>}
    {stopping && <p role="status">Stopping when the current operation yields. Already saved results will be reused on resume.</p>}
    {jobs.length > 0 && <div className="batch-job-list">
      <div className="batch-job-list-heading"><h2>Queue</h2><span>{jobs.filter(job => job.status === 'complete').length} of {jobs.length} complete{jobs.some(job => job.status === 'failed') ? ` · ${jobs.filter(job => job.status === 'failed').length} need attention` : ''}</span></div>
      <ol>{jobs.map(job => <li className={`batch-job-row batch-job-${job.status}`} key={job.id}><div><strong>{job.libraryName}</strong><span>{batchAnalysisLabel(job.analysis)}</span>{job.error && <p className="batch-job-error">{job.error}</p>}</div><span>{statusLabel(job.status)}</span></li>)}</ol>
    </div>}
  </section>
}
function statusLabel(status: BatchJob['status']): string { return status === 'complete' ? 'Complete' : status === 'failed' ? 'Needs attention' : status === 'running' ? 'Running' : status === 'stopped' ? 'Stopped' : 'Queued' }
