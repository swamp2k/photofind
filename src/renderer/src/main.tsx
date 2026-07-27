import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { electronClient, electronFolderPicker } from './client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App client={electronClient} picker={electronFolderPicker} />
  </React.StrictMode>
)
