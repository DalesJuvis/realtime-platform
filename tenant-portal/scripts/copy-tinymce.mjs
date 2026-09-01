// Self-hosted TinyMCE (no cloud API key) needs its skins/icons/plugins/langs
// served as static files — they're loaded by the browser at runtime via
// relative URLs, not bundled through Vite's module graph. Stages the
// package's own dist output into public/ so both `vite dev` and `vite
// build` serve it at /tinymce/*. Runs on `npm install` (see package.json's
// `postinstall`) rather than being committed — it's a reproducible copy of
// node_modules, not source.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(root, '..', 'node_modules', 'tinymce')
const dest = path.join(root, '..', 'public', 'tinymce')

if (!existsSync(src)) {
  console.warn('[copy-tinymce] node_modules/tinymce not found, skipping.')
  process.exit(0)
}

rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })
console.log('[copy-tinymce] Copied tinymce assets to public/tinymce.')
