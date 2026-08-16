import { useMemo, useState } from 'react'
import { PeoplePanel as PeopleFacePanel } from './PeopleFacePanel'
import { ProductPhotosPanel } from './ProductPhotosPanel'
import { buildSimilarityGroups } from './similarity'
import type { LiteMediaRecord, LitePeopleProgress, LitePersonRecord, LiteReviewState } from './types'

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

type SmartCategoryView = 'people' | 'product-photos'

export function PeoplePanel(props: PeoplePanelProps): JSX.Element {
  const [view, setView] = useState<SmartCategoryView>('people')
  const similarityGroups = useMemo(() => buildSimilarityGroups(props.items), [props.items])

  return (
    <section className="smart-categories-workspace">
      <nav className="smart-category-tabs" aria-label="Smart categories">
        <button type="button" className={view === 'people' ? 'smart-category-tab active' : 'smart-category-tab'} onClick={() => setView('people')}>
          <span aria-hidden="true">◎</span>
          <strong>People</strong>
          <small>Private face groups</small>
        </button>
        <button type="button" className={view === 'product-photos' ? 'smart-category-tab active' : 'smart-category-tab'} onClick={() => setView('product-photos')}>
          <span aria-hidden="true">◇</span>
          <strong>Product photos</strong>
          <small>Things photographed for sale</small>
        </button>
      </nav>

      {view === 'people' ? (
        <PeopleFacePanel {...props} />
      ) : (
        <ProductPhotosPanel
          items={props.items}
          groups={similarityGroups}
          sessionFiles={props.sessionFiles}
          onReview={props.onReview}
        />
      )}
    </section>
  )
}
