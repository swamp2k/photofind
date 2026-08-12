import { PhotoFindContextMenuProvider } from './lite/ContextMenu'
import { LiteApp } from './lite/LiteApp'
import { ReviewSettingsProvider } from './lite/ReviewSettings'

export default function App(): JSX.Element {
  return (
    <PhotoFindContextMenuProvider>
      <ReviewSettingsProvider><LiteApp /></ReviewSettingsProvider>
    </PhotoFindContextMenuProvider>
  )
}
