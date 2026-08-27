import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = import.meta.dirname

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(root, './src'),
      '@entities': path.resolve(root, './src/entities'),
      '@modules': path.resolve(root, './src/modules'),
      '@store': path.resolve(root, './src/store'),
      '@hooks': path.resolve(root, './src/hooks'),
      '@actions': path.resolve(root, './src/actions'),
      '@lib': path.resolve(root, './src/lib'),
      '@components': path.resolve(root, './src/components'),
      '@router': path.resolve(root, './src/router'),
    },
  },
  server: {
    host: true,
    port: 5174,
  },
})
