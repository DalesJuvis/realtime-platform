/**
 * # prism
 *
 * Prism.js setup for `CodeBlock` — imported once here rather than per
 * `CodeBlock` instance so every language grammar loads exactly once.
 * Deliberately not `react-syntax-highlighter` (which bundles every
 * grammar by default): explicit per-language imports keep this to only
 * what `DocsPage` actually needs, matching every language shown across
 * the SDK family (see `DocsPage.tsx`).
 *
 * Most `prismjs/components/prism-X` files pull in their own Prism
 * dependencies at import time (e.g. `typescript` auto-loads
 * `javascript`, which auto-loads `clike`) — but not all of them do:
 * `prism-php` needs `prism-markup-templating` loaded first and does
 * *not* require it itself. Skipping that isn't a "PHP just doesn't
 * highlight" failure either — `prism-php.js` partially mutates Prism's
 * shared internals before hitting the missing piece, which corrupts
 * `Prism.highlight()` for every language loaded after it (json included,
 * confirmed by hand while chasing the "REST API tab crashes" bug this
 * caused — see git history). `markup-templating` is imported first here,
 * ahead of everything else, so this can't recur if the import order
 * above it ever changes.
 */

import Prism from 'prismjs'
import 'prismjs/components/prism-markup-templating'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-kotlin'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-http'

export type CodeLanguage =
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'python'
  | 'rust'
  | 'kotlin'
  | 'java'
  | 'php'
  | 'json'
  | 'toml'
  | 'bash'
  | 'http'

export { Prism }
