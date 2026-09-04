/**
 * # SettingsPage
 *
 * Workspace profile (name/website/logo), security (password, sign out),
 * API key pair (this system's honest equivalent of a Stripe-style
 * publishable/secret pair — see `getKeysAction`'s doc comment), the live
 * "connected sessions" view, and preferences (rows per page, language) —
 * grouped into tabs, cloned from saas-admin's `TenantSettingsPage` structure.
 * Left out from that source: default currency and sandbox payment
 * confirmation mode, both payments-domain concepts with no equivalent here.
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  BellOff,
  BellRing,
  Copy,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LogOut,
  RefreshCw,
  Radio,
  Send,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { isNotificationSupported } from '@mio/realtime-sdk'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@components/ui/table'
import { Badge } from '@components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { Avatar, AvatarImage, AvatarFallback } from '@components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { ConfirmDialog } from '@components/shared/ConfirmDialog'
import { VapidKeyCard } from '@components/shared/VapidKeyCard'
import { useDialog } from '@providers/DialogProvider'
import { useTranslation } from '@lib/i18n'
import { getKeysAction } from '@actions/keys/getKeys.action'
import { getVapidKeyAction } from '@actions/vapid/getVapidKey.action'
import { registerPortalPushAction, unregisterPortalPushAction } from '@actions/push/registerPortalPush.action'
import { getPushSubscriptionsAction } from '@actions/push/getPushSubscriptions.action'
import { revokePushSubscriptionAction } from '@actions/push/revokePushSubscription.action'
import { sendTestPushAction } from '@actions/push/sendTestPush.action'
import { rotateSecretAction } from '@actions/keys/rotateSecret.action'
import { getDevicesAction } from '@actions/devices/getDevices.action'
import { getProfileAction } from '@actions/profile/getProfile.action'
import { updateProfileAction } from '@actions/profile/updateProfile.action'
import { uploadLogoAction } from '@actions/profile/uploadLogo.action'
import { changePasswordAction } from '@actions/account/changePassword.action'
import { errorMessage } from '@lib/errors'
import { copyToClipboard, formatDateTime, maskKey, workspaceNameFromEmail } from '@lib/utils'
import { usePortalAuthStore } from '@store/portalAuth.store'
import { useUiStore, type AiAssistantPosition } from '@store/ui.store'
import { usePreferencesStore } from '@store/preferences.store'
import type { Language } from '@lib/i18n'
import type { KeyPair } from '@entities/KeyPair.entity'
import type { Device } from '@entities/Device.entity'
import type { PushSubscriptionSummary } from '@entities/PushSubscriptionSummary.entity'
import type { WorkspaceProfile } from '@entities/WorkspaceProfile.entity'

const POLL_INTERVAL_MS = 5_000
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100]
const METRICS_REFRESH_INTERVAL_OPTIONS_MS = [3_000, 5_000, 10_000, 30_000, 60_000]

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const { t } = useTranslation()
  async function copy() {
    try {
      await copyToClipboard(value)
      toast.success(t.common.copied(label))
    } catch {
      toast.error(t.common.copyFailed(label))
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className={`flex-1 truncate text-xs ${mono ? 'font-mono' : ''}`}>{value}</span>
      <Button type="button" variant="ghost" size="sm" onClick={copy}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function ProfileTab() {
  const { t } = useTranslation()
  const email = usePortalAuthStore((s) => s.email)
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null)
  const [name, setName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savingWebsite, setSavingWebsite] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function load() {
    getProfileAction()
      .then((data) => {
        setProfile(data)
        setName(data.name ?? '')
        setWebsiteUrl(data.website_url ?? '')
      })
      .catch((err) => toast.error(errorMessage(err, t.settings.loadProfileFailed)))
  }

  useEffect(load, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const updated = await uploadLogoAction(file)
      setProfile(updated)
      toast.success(t.settings.logoUpdated)
    } catch (err) {
      toast.error(errorMessage(err, t.settings.logoUploadFailed))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSaveName() {
    setSavingName(true)
    try {
      const updated = await updateProfileAction({ name })
      setProfile(updated)
      toast.success(t.settings.workspaceNameUpdated)
    } catch (err) {
      toast.error(errorMessage(err, t.settings.workspaceNameUpdateFailed))
    } finally {
      setSavingName(false)
    }
  }

  async function handleSaveWebsite() {
    setSavingWebsite(true)
    try {
      const updated = await updateProfileAction({ website_url: websiteUrl.trim() })
      setProfile(updated)
      toast.success(t.settings.websiteUpdated)
    } catch (err) {
      toast.error(errorMessage(err, t.settings.websiteUpdateFailed))
    } finally {
      setSavingWebsite(false)
    }
  }

  const displayName = profile?.name || workspaceNameFromEmail(email)

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{t.settings.workspaceLogoTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-16 w-16 rounded-lg">
            <AvatarImage src={profile?.logo_data_uri ?? undefined} alt={displayName} />
            <AvatarFallback className="rounded-lg text-lg">{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              {uploading ? t.settings.uploading : t.settings.uploadLogo}
            </Button>
            <p className="text-xs text-muted-foreground">{t.settings.logoHint}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{t.settings.workspaceNameTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">{t.settings.name}</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={workspaceNameFromEmail(email)}
            />
          </div>
          <Button onClick={handleSaveName} disabled={savingName || name === (profile?.name ?? '')}>
            {savingName ? t.common.saving : t.settings.saveChanges}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{t.settings.websiteTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="website-url">{t.settings.url}</Label>
            <Input
              id="website-url"
              type="url"
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
            />
          </div>
          <Button onClick={handleSaveWebsite} disabled={savingWebsite || websiteUrl === (profile?.website_url ?? '')}>
            {savingWebsite ? t.common.saving : t.settings.saveChanges}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function SecurityTab() {
  const { t } = useTranslation()
  const email = usePortalAuthStore((s) => s.email)
  const tenantId = usePortalAuthStore((s) => s.tenantId)
  const logout = usePortalAuthStore((s) => s.logout)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      toast.error(t.settings.passwordTooShort)
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t.settings.passwordMismatch)
      return
    }
    setSaving(true)
    try {
      await changePasswordAction(currentPassword, newPassword)
      toast.success(t.settings.passwordChanged)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(errorMessage(err, t.settings.passwordChangeFailed))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{t.settings.accountTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t.settings.email}</Label>
            <p className="text-sm">{email}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.tenantId}</Label>
            <p className="truncate font-mono text-xs text-muted-foreground">{tenantId}</p>
          </div>
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4" />
            {t.nav.signOut}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{t.settings.changePasswordTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">{t.settings.currentPassword}</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t.settings.newPassword}</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">{t.settings.confirmNewPassword}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={saving || !currentPassword || !newPassword}>
            {saving ? t.settings.changing : t.settings.changePassword}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function KeysTab() {
  const { t } = useTranslation()
  const dialog = useDialog()
  const [keys, setKeys] = useState<KeyPair | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [isRotating, setRotating] = useState(false)
  const [notFound, setNotFound] = useState(false)

  function load() {
    getKeysAction()
      .then((data) => {
        setKeys(data)
        setNotFound(false)
      })
      .catch((err) => {
        if (errorMessage(err).includes('rotate')) setNotFound(true)
        else toast.error(errorMessage(err, t.settings.loadKeysFailed))
      })
  }

  useEffect(load, [])

  async function doRotate() {
    setRotating(true)
    try {
      const next = await rotateSecretAction()
      setKeys(next)
      setNotFound(false)
      setRevealed(true)
      toast.success(t.settings.secretKeyRotated)
    } catch (err) {
      toast.error(errorMessage(err, t.settings.rotateKeyFailed))
    } finally {
      setRotating(false)
    }
  }

  function confirmRotate() {
    dialog.openDialog(
      <ConfirmDialog message={t.settings.rotateConfirmMessage} confirmLabel={t.settings.rotate} onConfirm={doRotate} />,
      { title: t.settings.rotateSecretKey },
    )
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          {t.settings.apiKeysTitle}
        </CardTitle>
        <CardDescription>
          {t.settings.apiKeysDescriptionPrefix} <code className="font-mono text-xs">POST /api/v1/auth/tokens</code>
          {t.settings.apiKeysDescriptionSuffix}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notFound ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.settings.noKeyPair}</p>
            <Button onClick={doRotate} disabled={isRotating}>
              <RefreshCw className="h-4 w-4" />
              {isRotating ? t.settings.generating : t.settings.generateKeyPair}
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>{t.settings.publicKeyLabel}</Label>
              <CopyField label={t.settings.publicKey} value={keys?.tenantId ?? '…'} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t.settings.secretKeyLabel}</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)}>
                  {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {revealed ? t.settings.hide : t.settings.reveal}
                </Button>
              </div>
              <CopyField
                label={t.settings.secretKey}
                value={keys ? (revealed ? keys.secretKey : maskKey(keys.secretKey)) : '…'}
              />
            </div>
            <Button variant="outline" onClick={confirmRotate} disabled={isRotating}>
              <RefreshCw className="h-4 w-4" />
              {isRotating ? t.settings.rotating : t.settings.rotateSecretKey}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SessionsTab() {
  const { t } = useTranslation()
  const [devices, setDevices] = useState<Device[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const data = await getDevicesAction()
        if (!cancelled) setDevices(data)
      } catch {
        // transient network hiccup — next poll tick retries
      }
    }
    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{t.settings.connectedSessionsTitle}</CardTitle>
          <CardDescription>{t.settings.connectedSessionsDescription}</CardDescription>
        </div>
        <Badge variant="success">
          <Radio className="mr-1 h-3 w-3" />
          {t.settings.connectedCount(devices?.length ?? 0)}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {devices && devices.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{t.settings.noDevicesConnected}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.settings.subject}</TableHead>
                <TableHead>{t.settings.channels}</TableHead>
                <TableHead>{t.settings.connectedSince}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(devices ?? []).map((device) => (
                <TableRow key={device.session_id}>
                  <TableCell className="font-medium">{device.sub}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {device.channels.length > 0 ? device.channels.join(', ') : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(device.connected_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function PreferencesTab() {
  const { t } = useTranslation()
  const dialog = useDialog()
  const pageSize = useUiStore((s) => s.pageSize)
  const setPageSize = useUiStore((s) => s.setPageSize)
  const metricsRefreshIntervalMs = useUiStore((s) => s.metricsRefreshIntervalMs)
  const setMetricsRefreshIntervalMs = useUiStore((s) => s.setMetricsRefreshIntervalMs)
  const aiAssistantPosition = useUiStore((s) => s.aiAssistantPosition)
  const setAiAssistantPosition = useUiStore((s) => s.setAiAssistantPosition)
  const language = usePreferencesStore((s) => s.language)
  const setLanguage = usePreferencesStore((s) => s.setLanguage)

  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isBusy, setBusy] = useState(false)
  const supported = isNotificationSupported()

  const [devices, setDevices] = useState<PushSubscriptionSummary[] | null>(null)
  const [revokingEndpoint, setRevokingEndpoint] = useState<string | null>(null)
  const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null)

  function loadDevices() {
    getPushSubscriptionsAction()
      .then(setDevices)
      .catch((err) => toast.error(errorMessage(err, t.settings.loadDevicesFailed)))
  }

  useEffect(() => {
    getVapidKeyAction()
      .then(setVapidPublicKey)
      .catch(() => setVapidPublicKey(null))
    if (supported) setPermission(Notification.permission)
    loadDevices()
  }, [supported])

  async function handleEnable() {
    if (!vapidPublicKey) return
    setBusy(true)
    try {
      await registerPortalPushAction(vapidPublicKey)
      setPermission(Notification.permission)
      toast.success(t.settings.notificationsEnabledToast)
      loadDevices()
    } catch (err) {
      toast.error(errorMessage(err, t.settings.notificationsEnableFailed))
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setBusy(true)
    try {
      await unregisterPortalPushAction()
      toast.success(t.settings.notificationsDisabledToast)
      loadDevices()
    } catch (err) {
      toast.error(errorMessage(err, t.settings.notificationsDisableFailed))
    } finally {
      setBusy(false)
    }
  }

  async function doRevokeDevice(device: PushSubscriptionSummary) {
    setRevokingEndpoint(device.endpoint)
    try {
      await revokePushSubscriptionAction(device.endpoint)
      toast.success(t.settings.deviceRevoked)
      setDevices((prev) => prev?.filter((d) => d.endpoint !== device.endpoint) ?? null)
    } catch (err) {
      toast.error(errorMessage(err, t.settings.deviceRevokeFailed))
    } finally {
      setRevokingEndpoint(null)
    }
  }

  async function handleSendTest(device: PushSubscriptionSummary) {
    setTestingEndpoint(device.endpoint)
    try {
      await sendTestPushAction(device.endpoint)
      toast.success(t.settings.deviceTestSentToast)
    } catch (err) {
      toast.error(errorMessage(err, t.settings.deviceTestSendFailed))
    } finally {
      setTestingEndpoint(null)
    }
  }

  function confirmRevokeDevice(device: PushSubscriptionSummary) {
    const label = device.device_label ?? t.settings.unknownDevice
    dialog.openDialog(
      <ConfirmDialog
        message={t.settings.deviceRevokeConfirmMessage(label)}
        confirmLabel={t.settings.deviceRevoke}
        onConfirm={() => doRevokeDevice(device)}
      />,
      { title: t.settings.deviceRevokeConfirmTitle },
    )
  }

  return (
    <Card className="max-w-4xl shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{t.settings.preferencesTitle}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
        <div className="space-y-2">
          <Label>{t.settings.rowsPerPage}</Label>
          <p className="text-sm text-muted-foreground">{t.settings.rowsPerPageHint}</p>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t.settings.rowsOption(n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {t.settings.metricsRefreshInterval}
          </Label>
          <p className="text-sm text-muted-foreground">{t.settings.metricsRefreshIntervalHint}</p>
          <Select
            value={String(metricsRefreshIntervalMs)}
            onValueChange={(v) => setMetricsRefreshIntervalMs(Number(v))}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS_REFRESH_INTERVAL_OPTIONS_MS.map((ms) => (
                <SelectItem key={ms} value={String(ms)}>
                  {t.settings.metricsRefreshIntervalOption(ms / 1000)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            {t.settings.language}
          </Label>
          <p className="text-sm text-muted-foreground">{t.settings.languageHint}</p>
          <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t.settings.languageEnglish}</SelectItem>
              <SelectItem value="fr">{t.settings.languageFrench}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {t.assistant.positionLabel}
          </Label>
          <p className="text-sm text-muted-foreground">{t.assistant.positionHint}</p>
          <Select value={aiAssistantPosition} onValueChange={(v) => setAiAssistantPosition(v as AiAssistantPosition)}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom-right">{t.assistant.positionBottomRight}</SelectItem>
              <SelectItem value="bottom-left">{t.assistant.positionBottomLeft}</SelectItem>
              <SelectItem value="top-right">{t.assistant.positionTopRight}</SelectItem>
              <SelectItem value="top-left">{t.assistant.positionTopLeft}</SelectItem>
              <SelectItem value="hidden">{t.assistant.positionHidden}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {supported && vapidPublicKey && (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <BellRing className="h-3.5 w-3.5" />
              {t.settings.notificationsTitle}
            </Label>
            <p className="text-sm text-muted-foreground">{t.settings.notificationsDescription}</p>
            {permission === 'granted' ? (
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="gap-1">
                  <BellRing className="h-3 w-3" />
                  {t.settings.notificationsEnabled}
                </Badge>
                <Button variant="outline" size="sm" onClick={handleDisable} disabled={isBusy}>
                  <BellOff className="h-4 w-4" />
                  {isBusy ? t.settings.disabling : t.settings.disableNotifications}
                </Button>
              </div>
            ) : permission === 'denied' ? (
              <p className="text-sm text-destructive">{t.settings.notificationsBlocked}</p>
            ) : (
              <Button variant="outline" size="sm" onClick={handleEnable} disabled={isBusy}>
                <BellRing className="h-4 w-4" />
                {isBusy ? t.settings.enabling : t.settings.enableNotifications}
              </Button>
            )}
          </div>
        )}

        {devices && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5" />
                {t.settings.devicesTitle}
              </Label>
              <Link to="/devices" className="text-xs font-medium text-primary hover:underline">
                {t.settings.manageDevicesLink}
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">{t.settings.devicesHint}</p>
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.settings.noDevices}</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {devices.map((device) => (
                  <li key={device.endpoint} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{device.device_label ?? t.settings.unknownDevice}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.settings.deviceRegisteredOn(formatDateTime(device.created_at))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSendTest(device)}
                        disabled={testingEndpoint === device.endpoint}
                      >
                        <Send className="h-4 w-4" />
                        {testingEndpoint === device.endpoint ? t.settings.deviceSendingTest : t.settings.deviceSendTest}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => confirmRevokeDevice(device)}
                        disabled={revokingEndpoint === device.endpoint}
                      >
                        <Trash2 className="h-4 w-4" />
                        {revokingEndpoint === device.endpoint ? t.settings.deviceRevoking : t.settings.deviceRevoke}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.settings.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.settings.pageSubtitle}</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t.settings.tabProfile}</TabsTrigger>
          <TabsTrigger value="security">{t.settings.tabSecurity}</TabsTrigger>
          <TabsTrigger value="keys">{t.settings.tabKeys}</TabsTrigger>
          <TabsTrigger value="sessions">{t.settings.tabSessions}</TabsTrigger>
          <TabsTrigger value="preferences">{t.settings.tabPreferences}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="keys" className="grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
          <KeysTab />
          <VapidKeyCard />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
