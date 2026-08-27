/**
 * # ConfirmDialog
 *
 * Generic confirm/cancel dialog body for destructive or state-changing
 * actions — dialog content only, no title (pass one via `useDialog().openDialog`'s
 * options). Disables the confirm button while the action is in flight.
 *
 * When `confirmationText` is set, the confirm button stays disabled until the
 * user types that exact text into an input — the "type to confirm" pattern
 * for the highest-stakes destructive actions (e.g. type the tenant's name to
 * delete it).
 *
 * Input:  message, confirmLabel, onConfirm, confirmationText?
 * Output: renders inline; closes the dialog itself on confirm
 */

import { useState } from 'react'
import { Button, type ButtonProps } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { useDialog } from '@providers/DialogProvider'

export function ConfirmDialog({
  message,
  confirmLabel,
  confirmVariant = 'destructive',
  confirmationText,
  onConfirm,
}: {
  message: string
  confirmLabel: string
  confirmVariant?: ButtonProps['variant']
  /** If set, requires typing this exact text before the confirm button enables. */
  confirmationText?: string
  onConfirm: () => Promise<void>
}) {
  const dialog = useDialog()
  const [isSubmitting, setSubmitting] = useState(false)
  const [typedText, setTypedText] = useState('')

  const isBlocked = confirmationText !== undefined && typedText !== confirmationText

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{message}</p>

      {confirmationText !== undefined && (
        <div className="space-y-1.5">
          <Label htmlFor="confirm-text">
            Type <span className="font-semibold text-foreground">{confirmationText}</span> to confirm
          </Label>
          <Input
            id="confirm-text"
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => dialog.closeAll()}>
          Cancel
        </Button>
        <Button
          variant={confirmVariant}
          disabled={isSubmitting || isBlocked}
          onClick={async () => {
            setSubmitting(true)
            try {
              await onConfirm()
              dialog.closeAll()
            } finally {
              setSubmitting(false)
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}
