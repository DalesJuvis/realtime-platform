/**
 * # EmbedPage
 *
 * Push Widget customizer/generator — a tenant styles their own site's
 * "enable notifications" button (text, colors, corner radius) and gets
 * back copy-pasteable code, pre-filled with this tenant's real
 * credentials (VAPID public key, tenant ID, and the most recently minted
 * token — same `store/mintedToken.store` slot `MintTokenCard` writes to,
 * reused here rather than minting a second, separate token).
 *
 * Two output formats: the vanilla `mio-vapid-subscription.js` embed (any
 * site, no build step) and a `<PushPermissionButton>` snippet for a React
 * site using `@mio/realtime-sdk-react`. Both call the same backend
 * endpoint underneath — this page just fills in the styling and the
 * tenant's own values, it doesn't invent a third way to subscribe.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Wand2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { CodeBlock } from '@components/shared/CodeBlock'
import { MintTokenCard } from '@components/shared/MintTokenCard'
import { getVapidKeyAction } from '@actions/vapid/getVapidKey.action'
import { getKeysAction } from '@actions/keys/getKeys.action'
import { isCredentialsExpired } from '@lib/credentialsFile'
import { env } from '@lib/env'
import { useTranslation } from '@lib/i18n'
import { useMintedTokenStore } from '@store/mintedToken.store'

const RADIUS_PRESETS = [
  { value: 0, label: 'Square' },
  { value: 6, label: 'Subtle' },
  { value: 12, label: 'Rounded' },
  { value: 9999, label: 'Pill' },
]

const MIO_VAPID_SUBSCRIPTION_CDN =
  'https://cdn.jsdelivr.net/gh/DalesJuvis/realtime-platform@v0.1.10/sdk-wordpress/assets/js/mio-vapid-subscription.min.js'

export default function EmbedPage() {
  const { t } = useTranslation()
  const credentials = useMintedTokenStore((s) => s.credentials)
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    getVapidKeyAction().then(setVapidPublicKey).catch(() => setVapidPublicKey(null))
    getKeysAction()
      .then((keys) => setTenantId(keys.tenantId))
      .catch(() => setTenantId(null))
  }, [])

  const [buttonText, setButtonText] = useState('Enable notifications')
  const [bgColor, setBgColor] = useState('#FF5E1A')
  const [textColor, setTextColor] = useState('#FFFFFF')
  const [radius, setRadius] = useState(6)
  const [channels, setChannels] = useState('*')

  const token = credentials && !isCredentialsExpired(credentials) ? credentials.token : null
  const apiUrl = env.defaultApiUrl
  const channelList = channels
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)

  const buttonStyle: React.CSSProperties = {
    background: bgColor,
    color: textColor,
    borderRadius: `${radius}px`,
    border: 'none',
    padding: '10px 20px',
    font: 'inherit',
    fontWeight: 500,
    cursor: 'pointer',
  }

  const htmlCode = `<script src="${MIO_VAPID_SUBSCRIPTION_CDN}"
  data-api-base-url="${apiUrl}"
  data-tenant-id="${tenantId ?? '…'}"
  data-token="${token ?? '…'}"
  data-vapid-public-key="${vapidPublicKey ?? '…'}"
  data-channels="${channels || '*'}"
  data-button="#enable-notifications"
></script>
<button
  id="enable-notifications"
  style="background:${bgColor};color:${textColor};border-radius:${radius}px;border:none;padding:10px 20px;font:inherit;font-weight:500;cursor:pointer;"
>${buttonText}</button>`

  const reactCode = `import { PushPermissionButton } from '@mio/realtime-sdk-react'

<PushPermissionButton
  apiBaseUrl="${apiUrl}"
  token={token}
  tenantId="${tenantId ?? '…'}"
  vapidPublicKey="${vapidPublicKey ?? '…'}"
  channels={[${channelList.map((c) => `'${c}'`).join(', ') || "'*'"}]}
  style={{
    background: '${bgColor}',
    color: '${textColor}',
    borderRadius: ${radius},
    border: 'none',
    padding: '10px 20px',
    fontWeight: 500,
    cursor: 'pointer',
  }}
>
  ${buttonText}
</PushPermissionButton>`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.embed.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.embed.pageSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <Card className="rounded-sm shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wand2 className="h-4 w-4" />
                {t.embed.customizeTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="button-text">{t.embed.buttonTextLabel}</Label>
                <Input id="button-text" value={buttonText} onChange={(e) => setButtonText(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bg-color">{t.embed.backgroundColorLabel}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="bg-color"
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
                    />
                    <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="font-mono text-xs" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="text-color">{t.embed.textColorLabel}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="text-color"
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
                    />
                    <Input value={textColor} onChange={(e) => setTextColor(e.target.value)} className="font-mono text-xs" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t.embed.cornerRadiusLabel}</Label>
                <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RADIUS_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={String(p.value)}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="channels">{t.embed.channelsLabel}</Label>
                <Input id="channels" value={channels} onChange={(e) => setChannels(e.target.value)} placeholder="*" />
                <p className="text-xs text-muted-foreground">{t.embed.channelsHint}</p>
              </div>
            </CardContent>
          </Card>

          <MintTokenCard />
        </div>

        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Card className="rounded-sm shadow-none">
            <CardHeader>
              <CardTitle className="text-base">{t.embed.previewTitle}</CardTitle>
              <CardDescription>{t.embed.previewNote}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-10">
                <button type="button" style={buttonStyle} onClick={() => toast.info(t.embed.previewClickToast)}>
                  {buttonText || t.embed.buttonTextLabel}
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-sm shadow-none">
            <CardHeader>
              <CardTitle className="text-base">{t.embed.codeTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!vapidPublicKey && <p className="text-sm text-destructive">{t.embed.noVapidKey}</p>}
              {vapidPublicKey && !token && <p className="text-sm text-amber-600 dark:text-amber-400">{t.embed.noToken}</p>}

              <Tabs defaultValue="html">
                <TabsList>
                  <TabsTrigger value="html">{t.embed.formatVanilla}</TabsTrigger>
                  <TabsTrigger value="react">{t.embed.formatReact}</TabsTrigger>
                </TabsList>
                <TabsContent value="html" className="mt-3">
                  <CodeBlock code={htmlCode} label={t.embed.vanillaCodeLabel} language="markup" />
                </TabsContent>
                <TabsContent value="react" className="mt-3">
                  <CodeBlock code={reactCode} label={t.embed.reactCodeLabel} language="typescript" />
                </TabsContent>
              </Tabs>

              {token && <p className="text-xs text-muted-foreground">{t.embed.tokenExpiresNote}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
