/**
 * # useIdleLogout
 *
 * Signs the admin out after a period of no user activity — mounted once in
 * `AdminLayout`. The stored bearer token is the only credential this app
 * holds; there's nothing else to clear on idle.
 */

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAdminAuthStore } from '@store/adminAuth.store'

const IDLE_TIMEOUT_MS = 15 * 60 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

export function useIdleLogout(timeoutMs: number = IDLE_TIMEOUT_MS): void {
  const navigate = useNavigate()
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    function handleIdle() {
      useAdminAuthStore.getState().logout()
      navigate('/login', { replace: true })
      toast.info('You were signed out after a period of inactivity.')
    }

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(handleIdle, timeoutMs)
    }

    resetTimer()
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer))
    }
  }, [navigate, timeoutMs])
}
