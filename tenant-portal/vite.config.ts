import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = import.meta.dirname

export default defineConfig({
  plugins: [react()],
  resolve: {
    // `@mio/realtime-sdk-react` is a `file:` link to a sibling package
    // (a real symlink, not a packed tarball — see its own node_modules,
    // fully reachable through the link despite package.json's `files`
    // field). If it ever ends up with its own nested `react` (npm 7+
    // auto-installs a package's peer deps when nothing else in *its own*
    // node_modules tree satisfies them), Vite would otherwise bundle two
    // separate React instances — the app's ReactDOM sets its hook
    // dispatcher on one copy, this SDK's components call hooks on the
    // other, and every hook call throws "Cannot read properties of null
    // (reading 'useState')" (an invalid-hook-call symptom, not a real
    // bug in the SDK component itself). `dedupe` forces every resolution
    // of these two specifiers to this project's own copy regardless of
    // where the import originates.
    dedupe: ['react', 'react-dom'],
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
      '@providers': path.resolve(root, './src/providers'),
    },
  },
  server: {
    host: true,
    port: 5174,
  },
})
