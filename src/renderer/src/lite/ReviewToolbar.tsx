import type { LiteReviewCounts, LiteReviewFilter, LiteReviewState } from './types'

interface ReviewToolbarProps {
  counts: LiteReviewCounts
  filter: LiteReviewFilter
  matchingCount: number
  onFilter(filter: LiteReviewFilter): void
  onBulk(state: LiteReviewState): void
}

export function ReviewToolbar({ counts, filter, matchingCount, onFilter, onBulk }: ReviewToolbarProps): JSX.Element {
  return (
    <section className="review-toolbar">
      <div className="review-filter-tabs" aria-label="Review filter">
        <ReviewFilterButton label="All" value="all" count={sumCounts(counts)} current={filter} onFilter={onFilter} />
        <ReviewFilterButton label="Unreviewed" value="unreviewed" count={counts.unreviewed} current={filter} onFilter={onFilter} />
        <ReviewFilterButton label="Keep" value="keep" count={counts.keep} current={filter} onFilter={onFilter} />
        <ReviewFilterButton label="Maybe" value="maybe" count={counts.maybe} current={filter} onFilter={onFilter} />
        <ReviewFilterButton label="Reject" value="reject" count={counts.reject} current={filter} onFilter={onFilter} />
      </div>
      <details className="review-bulk">
        <summary>Bulk actions · {matchingCount.toLocaleString()} results</summary>
        <div>
          <button type="button" disabled={matchingCount === 0} onClick={() => onBulk('keep')}>Keep all results</button>
          <button type="button" disabled={matchingCount === 0} onClick={() => onBulk('maybe')}>Maybe all results</button>
          <button type="button" disabled={matchingCount === 0} onClick={() => onBulk('reject')}>Reject all results</button>
          <button type="button" disabled={matchingCount === 0} onClick={() => onBulk('unreviewed')}>Reset results</button>
        </div>
      </details>
    </section>
  )
}

function ReviewFilterButton({ label, value, count, current, onFilter }: { label: string; value: LiteReviewFilter; count: number; current: LiteReviewFilter; onFilter(filter: LiteReviewFilter): void }): JSX.Element {
  return <button type="button" className={`${value}${current === value ? ' active' : ''}`} onClick={() => onFilter(value)}>{label} <span>{count.toLocaleString()}</span></button>
}

function sumCounts(counts: LiteReviewCounts): number {
  return counts.unreviewed + counts.keep + counts.maybe + counts.reject
}
