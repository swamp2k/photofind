import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BatchJobsPanel } from './BatchJobsPanel'
import { createBatchJobs } from './batchJobs'

describe('batch controls', () => {
  const props = { libraries: [], running: false, stopping: false, unavailable: false, jobs: [], progress: null, notice: null,
    onStart: () => {}, onResume: () => {}, onStop: () => {}, onReconnect: () => {} }
  it('offers resume for a restored queue even with no new indexes selected', () => {
    const jobs = createBatchJobs([{ libraryId: 'one', libraryName: 'One' }], ['quality'])
    const html = renderToStaticMarkup(createElement(BatchJobsPanel, { ...props, jobs }))
    expect(html).toContain('Resume / retry unfinished jobs')
    expect(html).toContain('Queued')
    expect(html).toContain('Start new batch')
  })
  it('leaves People unchecked and explains local processing before opt-in', () => {
    const html = renderToStaticMarkup(createElement(BatchJobsPanel, props))
    expect(html).toContain('<input type="checkbox"/><span><strong>People</strong>')
    expect(html).toContain('Face models and embeddings stay local')
    expect(html).toContain('computer awake')
  })
  it('disables setup while stopping but preserves a visible stopping status', () => {
    const html = renderToStaticMarkup(createElement(BatchJobsPanel, { ...props, running: true, stopping: true }))
    expect(html).toContain('<fieldset disabled=""')
    expect(html).toContain('Stopping…')
    expect(html).not.toContain('Start batch')
  })
})
