import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './lib/store'
import { AuthProvider } from './lib/auth'
import { CompareProvider } from './lib/compareStore'
import { LocaleProvider } from './lib/i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LocaleProvider>
      <AuthProvider>
        <AppProvider>
          <CompareProvider>
            <App />
          </CompareProvider>
        </AppProvider>
      </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  </StrictMode>,
)
