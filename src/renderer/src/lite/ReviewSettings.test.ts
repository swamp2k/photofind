import { describe, expect, it } from 'vitest'
import { loadReviewSettings, reviewBindings } from './ReviewSettings'

describe('review settings', () => {
  it('maps each supported decision-key preset while reserving U for reset', () => {
    expect(reviewBindings('kmr')).toEqual({ keep: 'k', maybe: 'm', reject: 'r', reset: 'u' })
    expect(reviewBindings('asd')).toEqual({ keep: 'a', maybe: 's', reject: 'd', reset: 'u' })
    expect(reviewBindings('123')).toEqual({ keep: '1', maybe: '2', reject: '3', reset: 'u' })
  })

  it('loads persisted preferences and falls back safely for malformed data', () => {
    expect(loadReviewSettings({ getItem: () => JSON.stringify({ autoAdvance: false, keymap: 'asd' }) })).toEqual({ autoAdvance: false, keymap: 'asd' })
    expect(loadReviewSettings({ getItem: () => '{broken' })).toEqual({ autoAdvance: true, keymap: 'kmr' })
    expect(loadReviewSettings({ getItem: () => JSON.stringify({ autoAdvance: 'yes', keymap: 'wat' }) })).toEqual({ autoAdvance: true, keymap: 'kmr' })
  })
})
