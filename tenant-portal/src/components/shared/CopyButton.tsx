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

export function CopyButton({ value, label = 'Value' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    toast.success(`${label} copied.`)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} aria-label={`Copy ${label}`}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}
