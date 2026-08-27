/**
 * # StatusBadge
 *
 * Displays a colored badge for any status string across the app (tenant,
 * payment intent, transaction, refund, payout, customer, checkout session).
 * One shared mapping keeps status colors consistent everywhere.
 * Input:  status (string)
 * Output: Rendered Badge with the correct semantic variant
 */

import { Badge, type BadgeProps } from '@components/ui/badge'

type Variant = NonNullable<BadgeProps['variant']>

const SUCCESS = new Set(['active', 'succeeded', 'completed', 'complete'])
const WARNING = new Set([
  'pending',
  'processing',
  'requires_action',
  'requires_payment_method',
  'requires_confirmation',
  'incomplete',
  'past_due',
])
const DESTRUCTIVE = new Set(['cancelled', 'canceled', 'failed', 'expired', 'blocked', 'suspended', 'revoked'])
const INFO = new Set(['open'])
const NEUTRAL = new Set(['refunded', 'partially_refunded', 'draft'])

function variantFor(status: string): Variant {
  if (SUCCESS.has(status)) return 'success'
  if (WARNING.has(status)) return 'warning'
  if (DESTRUCTIVE.has(status)) return 'destructive'
  if (INFO.has(status)) return 'info'
  if (NEUTRAL.has(status)) return 'neutral'
  return 'neutral'
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant={variantFor(status)} className={className}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}
