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
      <div className="review-bulk">
        <span>{matchingCount.toLocaleString()} current results</span>
        <button type="button" disabled={matchingCount === 0} onClick={() => onBulk('keep')}>Keep results</button>
        <button type="button" disabled={matchingCount === 0} onClick={() => onBulk('maybe')}>Maybe results</button>
        <button type="button" disabled={matchingCount === 0} onClick={() => onBulk('reject')}>Reject results</button>
        <button type="button" disabled={matchingCount === 0} onClick={() => onBulk('unreviewed')}>Reset results</button>
      </div>
    </section>
  )
}

function ReviewFilterButton({ label, value, count, current, onFilter }: { label: string; value: LiteReviewFilter; count: number; current: LiteReviewFilter; onFilter(filter: LiteReviewFilter): void }): JSX.Element {
  return <button type="button" className={current === value ? 'active' : ''} onClick={() => onFilter(value)}>{label} <span>{count.toLocaleString()}</span></button>
}

function sumCounts(counts: LiteReviewCounts): number {
  return counts.unreviewed + counts.keep + counts.maybe + counts.reject
}
