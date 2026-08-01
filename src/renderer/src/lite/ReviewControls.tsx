import { reviewStateOf } from './review'
import type { LiteMediaRecord, LiteReviewState } from './types'

interface ReviewControlsProps {
  item: LiteMediaRecord
  compact?: boolean
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

const STATES: Array<{ state: LiteReviewState; label: string; compact: string }> = [
  { state: 'unreviewed', label: 'Unreviewed', compact: '○' },
  { state: 'keep', label: 'Keep', compact: '✓' },
  { state: 'maybe', label: 'Maybe', compact: '?' },
  { state: 'reject', label: 'Reject', compact: '×' }
]

export function ReviewControls({ item, compact = false, onReview }: ReviewControlsProps): JSX.Element {
  const current = reviewStateOf(item)
  return (
    <div className={compact ? 'review-controls compact' : 'review-controls'} aria-label={`Review ${item.name}`}>
      {STATES.map((entry) => (
        <button
          type="button"
          className={`${entry.state}${current === entry.state ? ' active' : ''}`}
          key={entry.state}
          title={entry.label}
          aria-label={`${entry.label}: ${item.name}`}
          aria-pressed={current === entry.state}
          onClick={(event) => { event.stopPropagation(); onReview(item, entry.state) }}
        >
          {compact ? entry.compact : entry.label}
        </button>
      ))}
    </div>
  )
}
