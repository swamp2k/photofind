import { ImportView } from './components/ImportView'
import type { FolderPicker, PhotoFindClient } from './client'

export default function App({ client, picker }: { client: PhotoFindClient; picker: FolderPicker }): JSX.Element {
  return (
    <div className="app-shell">
      <ImportView client={client} picker={picker} />
    </div>
  )
}
