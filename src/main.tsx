import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

const rootEl = document.getElementById('root')!
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Remove loading screen without inline script (CSP-friendly)
try {
  const loadingScreen = document.getElementById('loading-screen')
  if (loadingScreen) {
    // Optional fade-out without inline styles
    loadingScreen.classList.add('fade-out')
    setTimeout(() => loadingScreen.remove(), 300)
  }
} catch {}
