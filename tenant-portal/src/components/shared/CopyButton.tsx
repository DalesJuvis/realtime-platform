/**
 * # CopyButton
 *
 * Icon button that copies a string to the clipboard, showing a brief check
 * mark in place of the copy icon as feedback.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Check } from 'lucide-react'
import { Button } from '@components/ui/button'
import { copyToClipboard } from '@lib/utils'
import { useTranslation } from '@lib/i18n'

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useTranslation()
  const resolvedLabel = label ?? t.common.value
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await copyToClipboard(value)
      setCopied(true)
      toast.success(t.common.copied(resolvedLabel))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t.common.copyFailed(resolvedLabel))
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={handleCopy}
      aria-label={`${t.common.copy} ${resolvedLabel}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}
