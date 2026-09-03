/**
 * # ConfirmDialog
 *
 * Generic confirm/cancel dialog body for destructive or state-changing
 * actions — dialog content only, no title (pass one via `useDialog().openDialog`'s
 * options). Disables the confirm button while the action is in flight.
 */

import { useState } from 'react'
import { Button, type ButtonProps } from '@components/ui/button'
import { useDialog } from '@providers/DialogProvider'
import { useTranslation } from '@lib/i18n'

export function ConfirmDialog({
  message,
  confirmLabel,
  confirmVariant = 'destructive',
  onConfirm,
}: {
  message: string
  confirmLabel: string
  confirmVariant?: ButtonProps['variant']
  onConfirm: () => Promise<void>
}) {
  const dialog = useDialog()
  const { t } = useTranslation()
  const [isSubmitting, setSubmitting] = useState(false)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{message}</p>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => dialog.closeAll()}>
          {t.common.cancel}
        </Button>
        <Button
          variant={confirmVariant}
          disabled={isSubmitting}
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
