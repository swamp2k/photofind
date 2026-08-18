import { PhotoFindContextMenuProvider } from './lite/ContextMenu'
import { GlobalProcessStatus } from './lite/GlobalProcessStatus'
import { LiteApp } from './lite/LiteApp'
import { ReviewSettingsProvider } from './lite/ReviewSettings'
import { ViewColumnResizer } from './lite/ViewColumnResizer'

export default function App(): JSX.Element {
  return (
    <PhotoFindContextMenuProvider>
      <ReviewSettingsProvider><LiteApp /><GlobalProcessStatus /><ViewColumnResizer /></ReviewSettingsProvider>
    </PhotoFindContextMenuProvider>
  )
}
