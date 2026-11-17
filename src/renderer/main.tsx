import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// Janela minimizada/oculta → congela animações CSS (ver html[data-atlas-hidden] no CSS).
function syncVisibility() {
  document.documentElement.toggleAttribute('data-atlas-hidden', document.visibilityState === 'hidden')
}
document.addEventListener('visibilitychange', syncVisibility)
syncVisibility()

class RootErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.stack || error.message : String(error)
    return { message }
  }

  componentDidCatch(error: unknown) {
    console.error('[atlas] interface', error)
  }

  render() {
    if (!this.state.message) return this.props.children
    return (
      <div
        style={{
          minHeight: '100vh',
          padding: 24,
          background: '#14181e',
          color: '#f4f4f5',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>A interface parou de carregar</h1>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#fca5a5' }}>{this.state.message}</pre>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
