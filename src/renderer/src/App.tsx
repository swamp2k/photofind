import { LiteApp } from './lite/LiteApp'
import { ReviewSettingsProvider } from './lite/ReviewSettings'

export default function App(): JSX.Element {
  return <ReviewSettingsProvider><LiteApp /></ReviewSettingsProvider>
}
