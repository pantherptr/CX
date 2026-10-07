import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './lib/store'
import { AuthProvider } from './lib/auth'
import { CompareProvider } from './lib/compareStore'
import { LocaleProvider } from './lib/i18n'
import { Capacitor } from '@capacitor/core'

// Lets the stylesheet apply app-only behaviour (no long-press menus on
// images/controls) without affecting the website.
if (Capacitor.isNativePlatform()) document.documentElement.classList.add('native-app')

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
