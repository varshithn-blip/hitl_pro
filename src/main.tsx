import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Self-hosted (bundled by Vite, served from this app's own origin)
// instead of the external fonts.googleapis.com stylesheet this used to
// pull in — that was a render-blocking round trip (DNS + TLS + request)
// on every fresh load before any text could render correctly, on top of
// this app's own asset load. Only the weights actually used
// (styles.css's --font-sans/--font-mono, and OcrEditor/QueueList/etc's
// inline fontWeight values) are imported, not the whole family.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
