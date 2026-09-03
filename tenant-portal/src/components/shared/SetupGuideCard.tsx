/**
 * # SetupGuideCard
 *
 * Dismissible "getting started" checklist, cloned from saas-admin's
 * `TenantSetupGuideCard` — steps use real workspace data (keys, channels,
 * templates) rather than local UI state, so it completes itself as the
 * tenant actually sets up, and self-hides once every step is done.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { cn } from '@lib/utils'
import { useTranslation } from '@lib/i18n'
import { useOnboardingStore } from '@store/onboarding.store'
import { getKeysAction } from '@actions/keys/getKeys.action'
import { getChannelsAction } from '@actions/channels/getChannels.action'
import { getTemplatesAction } from '@actions/templates/getTemplates.action'

interface SetupStep {
  readonly label: string
  readonly done: boolean
  readonly to: string
}

export function SetupGuideCard() {
  const { t } = useTranslation()
  const dismissed = useOnboardingStore((s) => s.setupGuideDismissed)
  const dismiss = useOnboardingStore((s) => s.dismissSetupGuide)
  const [steps, setSteps] = useState<SetupStep[] | null>(null)

  useEffect(() => {
    Promise.all([
      getKeysAction().then(
        () => true,
        () => false,
      ),
      getChannelsAction().catch(() => []),
      getTemplatesAction().catch(() => []),
    ]).then(([hasKeys, channels, templates]) => {
      setSteps([
        { label: t.cards.stepGenerateApiKeys, done: hasKeys, to: '/settings' },
        { label: t.cards.stepPublishToChannel, done: channels.length > 0, to: '/channels' },
        { label: t.cards.stepSaveTemplate, done: templates.length > 0, to: '/templates' },
      ])
    })
  }, [])

  const percent = steps && steps.length > 0 ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100) : 0

  if (dismissed || steps === null || percent === 100) return null

  return (
    <Card className="rounded-sm border-none bg-primary/5 shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t.cards.setupGuideTitle}</CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={dismiss} aria-label={t.cards.dismissSetupGuide}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">{t.cards.ofComplete(steps.filter((s) => s.done).length, steps.length)}</p>
        </div>

        <ul className="space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-2.5">
              {step.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-primary" />
              )}
              {step.done ? (
                <span className="text-sm text-muted-foreground line-through">{step.label}</span>
              ) : (
                <Link to={step.to} className={cn('text-sm font-medium text-foreground hover:text-primary hover:underline')}>
                  {step.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
