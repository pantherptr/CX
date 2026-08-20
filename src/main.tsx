import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './lib/store'
import { AuthProvider } from './lib/auth'
import { ShopProvider } from './lib/shopStore'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <ShopProvider>
            <App />
          </ShopProvider>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
