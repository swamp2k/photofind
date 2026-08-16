import { PeoplePanel } from './PeoplePanel'
import { ProductPhotosPanel } from './ProductPhotosPanel'
import type {
  LiteMediaRecord,
  LitePeopleProgress,
  LitePersonRecord,
  LiteProductPhotoSettings,
  LiteReviewState,
  LiteSimilarityGroup
} from './types'

export type LiteSmartCategoryView = 'people' | 'product-photos'

interface SmartCategoriesPanelProps {
  active: LiteSmartCategoryView
  items: LiteMediaRecord[]
  people: LitePersonRecord[]
  groups: LiteSimilarityGroup[]
  productSettings: LiteProductPhotoSettings
  sessionFiles: Map<string, File>
  peopleProgress: LitePeopleProgress | null
  peopleBusy: boolean
  reconnectRequired: boolean
  batchSize: number
  flowLoading: boolean
  onActive(view: LiteSmartCategoryView): void
  onProductSettings(settings: LiteProductPhotoSettings): void
  onRename(personId: string, name: string): void
  onIgnore(personId: string, ignored: boolean): void
  onMerge(sourceId: string, targetId: string): void
  onSplit(faceRef: string): void
  onExclude(faceRef: string, personId: string): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

export function SmartCategoriesPanel(props: SmartCategoriesPanelProps): JSX.Element {
  return (
    <section className="smart-categories-workspace">
      <nav className="smart-category-tabs" aria-label="Smart categories">
        <button type="button" className={props.active === 'people' ? 'smart-category-tab active' : 'smart-category-tab'} onClick={() => props.onActive('people')}>
          <span aria-hidden="true">◎</span>
          <strong>People</strong>
          <small>Private face groups</small>
        </button>
        <button type="button" className={props.active === 'product-photos' ? 'smart-category-tab active' : 'smart-category-tab'} onClick={() => props.onActive('product-photos')}>
          <span aria-hidden="true">◇</span>
          <strong>Product photos</strong>
          <small>Things photographed for sale</small>
        </button>
      </nav>

      {props.active === 'people' ? (
        <PeoplePanel
          items={props.items}
          people={props.people}
          sessionFiles={props.sessionFiles}
          progress={props.peopleProgress}
          busy={props.peopleBusy}
          reconnectRequired={props.reconnectRequired}
          onRename={props.onRename}
          onIgnore={props.onIgnore}
          onMerge={props.onMerge}
          onSplit={props.onSplit}
          onExclude={props.onExclude}
          onReview={props.onReview}
        />
      ) : (
        <ProductPhotosPanel
          items={props.items}
          groups={props.groups}
          settings={props.productSettings}
          sessionFiles={props.sessionFiles}
          batchSize={props.batchSize}
          flowLoading={props.flowLoading}
          onSettings={props.onProductSettings}
          onReview={props.onReview}
        />
      )}
    </section>
  )
}
