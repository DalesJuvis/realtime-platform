/**
 * # CodeBlock
 *
 * Code block with real Prism.js syntax highlighting (see `lib/prism.ts`
 * for the language setup), always rendered in the Dracula palette —
 * fixed, not adaptive to the app's own light/dark toggle (there's no
 * canonical "light Dracula"; code blocks staying dark regardless of
 * surrounding theme is a deliberate, common docs-site choice, e.g.
 * GitHub/most blogs). `language` is optional — omit it for a plain-text
 * snippet (a single shell command, a bare URL) where highlighting would
 * add nothing.
 *
 * Wrapped in a local `dark` class (Tailwind's `darkMode: 'class'` scopes
 * to *any* ancestor, not just `<html>`) purely so `CopyButton`'s
 * shadcn/theme-token-based styling (ghost variant hover/text colors)
 * resolves against a dark surface even when the rest of the app is in
 * light mode — the block's own background/text/token colors are all
 * literal Dracula hex values, untouched by that wrapper.
 */

import { useMemo } from 'react'
import { CopyButton } from '@components/shared/CopyButton'
import { Prism, type CodeLanguage } from '@lib/prism'
import { cn } from '@lib/utils'

const DRACULA_BG = '#282a36'
const DRACULA_CHROME_BG = '#21222c'
const DRACULA_BORDER = '#44475a'
const DRACULA_FOREGROUND = '#f8f8f2'
const DRACULA_COMMENT = '#6272a4'

export function CodeBlock({
  code,
  label,
  language,
}: {
  code: string
  label?: string
  language?: CodeLanguage | undefined
}) {
  const highlighted = useMemo(() => {
    const grammar = language ? Prism.languages[language] : undefined
    if (!grammar) return null
    try {
      return Prism.highlight(code, grammar, language as string)
    } catch (err) {
      // A grammar can choke on content that isn't actually valid for it
      // (e.g. text that only loosely resembles a language) — falling back
      // to plain text beats taking down the whole page over a decoration.
      console.warn(`CodeBlock: Prism highlighting failed for language "${language}"`, err)
      return null
    }
  }, [code, language])

  return (
    <div className="dark overflow-hidden rounded-md border" style={{ backgroundColor: DRACULA_BG, borderColor: DRACULA_BORDER }}>
      {label && (
        <div
          className="flex items-center justify-between border-b px-3 py-1.5"
          style={{ backgroundColor: DRACULA_CHROME_BG, borderColor: DRACULA_BORDER }}
        >
          <span className="font-mono text-xs" style={{ color: DRACULA_COMMENT }}>
            {label}
          </span>
          <CopyButton value={code} label={label} />
        </div>
      )}
      <div className="relative">
        {!label && <div className="absolute right-2 top-2"><CopyButton value={code} label="Snippet" /></div>}
        <pre className="overflow-x-auto p-3 text-xs leading-relaxed" style={{ color: DRACULA_FOREGROUND }}>
          {highlighted ? (
            <code className={cn('font-mono', `language-${language}`)} dangerouslySetInnerHTML={{ __html: highlighted }} />
          ) : (
            <code className="font-mono">{code}</code>
          )}
        </pre>
      </div>
    </div>
  )
}
