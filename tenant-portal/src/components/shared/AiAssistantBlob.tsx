/**
 * # AiAssistantBlob
 *
 * Tenant-portal wiring around `@mio/realtime-sdk-react`'s exported
 * `AiAssistantBlob` — mounted once in `AppLayout` (every authenticated
 * page gets one, position shared app-wide). This file owns everything
 * portal-specific (fetching this tenant's own workspace data, the
 * rule-based `computeRecommendation` below, and turning a recommendation
 * into a router navigation); the SDK component owns everything generic
 * (the blob's float/blink/eye-tracking animation, the panel shell, the
 * "keep aside" docked state, the task input UI) — see its own doc comment
 * for why that split makes it exportable to any React app, not just this
 * one.
 *
 * Deliberately rule-based, not an LLM call: every recommendation here is a
 * template filled from data this portal already fetches elsewhere
 * (`getOverviewAction`, `getChannelsAction`, `getTemplatesAction`,
 * `getVapidKeyAction`, `getPushSubscriptionsAction`, the minted-token
 * store's own expiry math) — no backend/API-key work, no per-call cost,
 * and an answer that's always consistent with what the tenant would see
 * by clicking around the app themselves. The "Describe your task…" input
 * is intentionally inert for now — a task-execution engine is a separate,
 * much larger feature.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { KeyRound, Radio, Rss, Sparkles } from 'lucide-react'
import { AiAssistantBlob as AssistantWidget, type AiAssistantRecommendation } from '@mio/realtime-sdk-react'
import { getOverviewAction } from '@actions/overview/getOverview.action'
import { getChannelsAction } from '@actions/channels/getChannels.action'
import { getTemplatesAction } from '@actions/templates/getTemplates.action'
import { getVapidKeyAction } from '@actions/vapid/getVapidKey.action'
import { getPushSubscriptionsAction } from '@actions/push/getPushSubscriptions.action'
import { isCredentialsExpired } from '@lib/credentialsFile'
import { workspaceNameFromEmail } from '@lib/utils'
import { useTranslation } from '@lib/i18n'
import { usePortalAuthStore } from '@store/portalAuth.store'
import { useMintedTokenStore } from '@store/mintedToken.store'
import { useUiStore } from '@store/ui.store'
import type { MintedCredentials } from '@entities/MintedCredentials.entity'

type Translations = ReturnType<typeof useTranslation>['t']

interface WorkspaceSnapshot {
  messagesTotal: number
  rateLimitedTotal: number
  channelCount: number
  templateCount: number
  vapidConfigured: boolean
  deviceCount: number
}

function daysUntil(issuedAt: string, expiresInSeconds: number): number {
  const expiresAt = new Date(issuedAt).getTime() + expiresInSeconds * 1000
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
}

/** Returns the `to` route for the recommendation's CTA alongside the rest
 * of it — kept separate from `AiAssistantRecommendation.cta.onClick` so
 * the caller can turn `to` into a real `navigate()` call itself (this
 * function has no router access; the SDK component it feeds shouldn't
 * need one either). */
function computeRecommendation(
  t: Translations,
  snapshot: WorkspaceSnapshot,
  credentials: MintedCredentials | null,
): { recommendation: Omit<AiAssistantRecommendation, 'cta'>; to: string; ctaLabel: string } {
  const icon = (Icon: typeof Sparkles) => <Icon style={{ height: 14, width: 14 }} />

  if (credentials) {
    if (isCredentialsExpired(credentials)) {
      return {
        recommendation: {
          icon: icon(KeyRound),
          category: t.assistant.categoryApiToken,
          stat: { value: '0', unit: t.assistant.daysUnit },
          description: t.assistant.tokenExpired,
        },
        to: '/keys',
        ctaLabel: t.assistant.mintNewToken,
      }
    }
    const days = daysUntil(credentials.issuedAt, credentials.expiresIn)
    if (days <= 3) {
      return {
        recommendation: {
          icon: icon(KeyRound),
          category: t.assistant.categoryApiToken,
          stat: { value: String(days), unit: t.assistant.daysUnit },
          description: t.assistant.tokenExpiringSoon(days),
        },
        to: '/keys',
        ctaLabel: t.assistant.mintNewToken,
      }
    }
  }

  if (!snapshot.vapidConfigured) {
    return {
      recommendation: {
        icon: icon(Radio),
        category: t.assistant.categoryWebPush,
        description: t.assistant.webPushNotConfigured,
      },
      to: '/docs',
      ctaLabel: t.assistant.learnAboutWebPush,
    }
  }

  if (snapshot.deviceCount === 0) {
    return {
      recommendation: {
        icon: icon(Radio),
        category: t.assistant.categoryPushNotifications,
        stat: { value: '0', unit: t.assistant.devicesUnit },
        description: t.assistant.noDevicesSubscribed,
      },
      to: '/embed',
      ctaLabel: t.assistant.openPushWidget,
    }
  }

  if (snapshot.channelCount === 0) {
    return {
      recommendation: {
        icon: icon(Rss),
        category: t.assistant.categoryChannels,
        stat: { value: '0', unit: t.assistant.channelsUnit },
        description: t.assistant.noChannelsYet,
      },
      to: '/broadcasting',
      ctaLabel: t.assistant.goToBroadcasting,
    }
  }

  if (snapshot.templateCount === 0) {
    return {
      recommendation: {
        icon: icon(Sparkles),
        category: t.assistant.categoryTemplates,
        stat: { value: '0', unit: t.assistant.templatesUnit },
        description: t.assistant.noTemplatesYet,
      },
      to: '/templates',
      ctaLabel: t.assistant.goToTemplates,
    }
  }

  if (snapshot.rateLimitedTotal > 0) {
    return {
      recommendation: {
        icon: icon(Radio),
        category: t.assistant.categoryBroadcasting,
        stat: { value: String(snapshot.rateLimitedTotal), unit: t.assistant.requestsUnit },
        description: t.assistant.rateLimited(snapshot.rateLimitedTotal),
      },
      to: '/broadcasting',
      ctaLabel: t.assistant.goToBroadcasting,
    }
  }

  const fallback = t.assistant.allGood[Math.floor(Math.random() * t.assistant.allGood.length)] ?? t.assistant.allGood[0]!
  return {
    recommendation: {
      icon: icon(Sparkles),
      category: t.assistant.categoryPlatform,
      stat: { value: String(snapshot.messagesTotal), unit: t.assistant.messagesUnit },
      description: `${fallback} ${t.assistant.messagesSentSoFar(snapshot.messagesTotal)}`,
    },
    to: '/overview',
    ctaLabel: t.assistant.goToOverview,
  }
}

export function AiAssistantBlob() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const email = usePortalAuthStore((s) => s.email)
  const credentials = useMintedTokenStore((s) => s.credentials)
  const position = useUiStore((s) => s.aiAssistantPosition)
  const focusMode = useUiStore((s) => s.focusMode)

  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const displayName = workspaceNameFromEmail(email)

  useEffect(() => {
    if (position === 'hidden' || focusMode) return
    Promise.allSettled([
      getOverviewAction(),
      getChannelsAction(),
      getTemplatesAction(),
      getVapidKeyAction(),
      getPushSubscriptionsAction(),
    ]).then(([overview, channels, templates, vapidKey, devices]) => {
      setSnapshot({
        messagesTotal: overview.status === 'fulfilled' ? overview.value.messages_total : 0,
        rateLimitedTotal: overview.status === 'fulfilled' ? overview.value.rate_limited_total : 0,
        channelCount: channels.status === 'fulfilled' ? channels.value.length : 0,
        templateCount: templates.status === 'fulfilled' ? templates.value.length : 0,
        vapidConfigured: vapidKey.status === 'fulfilled' && vapidKey.value !== null,
        deviceCount: devices.status === 'fulfilled' ? devices.value.length : 0,
      })
    })
  }, [position, focusMode])

  if (position === 'hidden' || focusMode) return null

  const built = snapshot ? computeRecommendation(t, snapshot, credentials) : null
  const recommendation: AiAssistantRecommendation | null = built
    ? { ...built.recommendation, cta: { label: built.ctaLabel, onClick: () => navigate(built.to) } }
    : null

  return (
    <AssistantWidget
      name={displayName}
      greeting={t.assistant.greeting}
      subtitle={t.assistant.subtitle}
      loadingText={t.assistant.loading}
      recommendation={recommendation}
      position={position}
      taskPlaceholder={t.assistant.taskInputPlaceholder}
      onTaskSubmit={() => toast.info(t.assistant.taskNotWiredUp)}
      closeAriaLabel={t.assistant.close}
      keepAsideAriaLabel={t.assistant.keepAside}
      storageKey="mio-tenant-portal-assistant"
    />
  )
}
