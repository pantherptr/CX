import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react-vendor'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('/motion') || id.includes('framer-motion')) return 'motion'
          return undefined
        },
      },
    },
  },
  // MapLibre starts its own module worker; pre-bundling it in dev serves that worker file as a 504.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // The preview harness assigns a free port via PORT; plain `npm run dev` stays on 5173.
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
})
