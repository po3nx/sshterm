import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/features': resolve(__dirname, './src/features'),
      '@/shared': resolve(__dirname, './src/shared'),
      '@/infrastructure': resolve(__dirname, './src/infrastructure'),
    },
  },
  server: {
    port: 3001,
    host: '0.0.0.0',
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
        // Ensure websockets stay open through HMR reloads
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[vite] ws proxy error:', err);
          });
        },
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
    sourcemap: true,
  },
})
