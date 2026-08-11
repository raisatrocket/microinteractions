import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import EmbedPage from './embed/EmbedPage'
import './styles/global.css'

const host = document.getElementById('root')
if (!host) throw new Error('#root not found')

// `/embed/<slug>` renders a single experiment with none of the timeline around
// it. Everything else is the log.
const isEmbed = window.location.pathname.startsWith('/embed/')

createRoot(host).render(
  <StrictMode>{isEmbed ? <EmbedPage /> : <App />}</StrictMode>,
)
