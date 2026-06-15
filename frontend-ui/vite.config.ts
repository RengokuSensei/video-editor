import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tauri-apps/api/dialog': path.resolve(__dirname, 'src/tauri-dialog-shim.ts'),
      '@tauri-apps/api/tauri': path.resolve(__dirname, 'src/tauri-shim.ts'),
    },
  },
})
