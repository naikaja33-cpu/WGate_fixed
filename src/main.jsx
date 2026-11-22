import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { applySavedTheme } from '@/lib/themes'

applySavedTheme()
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
