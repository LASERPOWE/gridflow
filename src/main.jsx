import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'

document.title = 'smartsheet by Laser Power'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)

// Hand off from the static HTML splash to React's own splash once React has
// painted — no fixed timer, so there's never a bare "Loading…" gap on slow loads.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const s = document.getElementById('splash')
  if (s) { s.classList.add('hide'); setTimeout(() => s.remove(), 500) }
}))
