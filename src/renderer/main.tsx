import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

window.addEventListener('error', (e) => {
  console.error('[Renderer Global Error]', e.error)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Renderer Unhandled Rejection]', e.reason)
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
