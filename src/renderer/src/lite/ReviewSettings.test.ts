import { describe, expect, it } from 'vitest'
import { loadReviewSettings, reviewBindings } from './ReviewSettings'

describe('review settings', () => {
  it('maps each supported decision-key preset while reserving U for reset', () => {
    expect(reviewBindings('kmr')).toEqual({ keep: 'k', maybe: 'm', reject: 'r', reset: 'u' })
    expect(reviewBindings('asd')).toEqual({ keep: 'a', maybe: 's', reject: 'd', reset: 'u' })
    expect(reviewBindings('123')).toEqual({ keep: '1', maybe: '2', reject: '3', reset: 'u' })
  })

  it('loads persisted preferences and fills new browsing defaults for old settings', () => {
    expect(loadReviewSettings({ getItem: () => JSON.stringify({ autoAdvance: false, keymap: 'asd' }) })).toEqual({
      autoAdvance: false,
      keymap: 'asd',
      photoBatchSize: 500,
      flowLoading: false
    })
  })

  it('loads supported photo batching and flow preferences', () => {
    expect(loadReviewSettings({ getItem: () => JSON.stringify({ autoAdvance: true, keymap: 'kmr', photoBatchSize: 1000, flowLoading: true }) })).toEqual({
      autoAdvance: true,
      keymap: 'kmr',
      photoBatchSize: 1000,
      flowLoading: true
    })
  })

  it('falls back safely for malformed or unsupported settings', () => {
    expect(loadReviewSettings({ getItem: () => '{broken' })).toEqual({ autoAdvance: true, keymap: 'kmr', photoBatchSize: 500, flowLoading: false })
    expect(loadReviewSettings({ getItem: () => JSON.stringify({ autoAdvance: 'yes', keymap: 'wat', photoBatchSize: 333, flowLoading: 'yes' }) })).toEqual({ autoAdvance: true, keymap: 'kmr', photoBatchSize: 500, flowLoading: false })
  })
})
