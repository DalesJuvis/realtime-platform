/**
 * # PushNotificationToggle
 *
 * Header button that requests `Notification` permission — the same
 * permission both `attachBackgroundNotifications` (tab open, backgrounded;
 * wired in `connection.store.ts`, works immediately once granted, nothing
 * else to do here for that half) and Web Push (tab/browser closed) need.
 * When granted and `VITE_VAPID_PUBLIC_KEY` is configured, also registers
 * this browser's Web Push subscription so notifications keep arriving
 * with no tab open at all — see `registerPushSubscriptionAction`'s doc
 * comment for exactly what that does and doesn't guarantee.
 *
 * Hidden entirely when the browser doesn't support `Notification` at all
 * (`isNotificationSupported`) — no point offering a button that can only fail.
 */

import { useEffect, useState } from 'react'
import { BellRing, BellOff } from 'lucide-react'
import { toast } from 'sonner'
import { isNotificationSupported, requestNotificationPermission } from '@mio/realtime-sdk'
import { Button } from '@components/ui/button'
import { useConnectionStore } from '@store/connection.store'
import { env } from '@lib/env'
import { registerPushSubscriptionAction, unregisterPushSubscriptionAction } from '@actions/realtime/registerPushSubscription.action'

export function PushNotificationToggle() {
  const credentials = useConnectionStore((s) => s.credentials)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isBusy, setBusy] = useState(false)

  useEffect(() => {
    if (isNotificationSupported()) setPermission(Notification.permission)
  }, [])

  if (!isNotificationSupported()) return null

  const enabled = permission === 'granted'

  async function handleClick() {
    if (!credentials) {
      toast.info('Connect to a workspace first.')
      return
    }
    if (enabled) {
      setBusy(true)
      try {
        if (env.vapidPublicKey) await unregisterPushSubscriptionAction(credentials)
        toast.success('Push notifications disabled for this browser.')
        setPermission(Notification.permission)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to disable push notifications.')
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    try {
      const result = await requestNotificationPermission()
      setPermission(result)
      if (result !== 'granted') {
        toast.warning(`Notification permission was "${result}".`)
        return
      }
      if (env.vapidPublicKey) {
        await registerPushSubscriptionAction(credentials, env.vapidPublicKey)
        toast.success('Notifications enabled — you\'ll be notified even with this tab closed.')
      } else {
        toast.success('Notifications enabled for this tab (background/unfocused only — no VAPID key configured for closed-tab push).')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enable notifications.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isBusy}
      onClick={() => void handleClick()}
      title={enabled ? 'Disable notifications' : 'Enable notifications'}
      aria-label={enabled ? 'Disable notifications' : 'Enable notifications'}
    >
      {enabled ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
    </Button>
  )
}
