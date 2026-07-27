import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { browserFolderPicker, electronClient, electronFolderPicker, httpClient } from './client'

const electronMode = typeof window !== 'undefined' && Boolean(window.api)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App client={electronMode ? electronClient : httpClient} picker={electronMode ? electronFolderPicker : browserFolderPicker} />
  </React.StrictMode>
)
