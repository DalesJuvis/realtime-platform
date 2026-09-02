/**
 * # SettingsPage
 *
 * Workspace profile (name/website/logo), security (password, sign out),
 * API key pair (this system's honest equivalent of a Stripe-style
 * publishable/secret pair — see `getKeysAction`'s doc comment), the live
 * "connected sessions" view, and preferences (rows per page) — grouped
 * into tabs, cloned from saas-admin's `TenantSettingsPage` structure.
 * Left out from that source: default currency and sandbox payment
 * confirmation mode, both payments-domain concepts with no equivalent here.
 */

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Eye, EyeOff, KeyRound, LogOut, RefreshCw, Radio, Upload } from 'lucide-react'
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
import { getKeysAction } from '@actions/keys/getKeys.action'
import { rotateSecretAction } from '@actions/keys/rotateSecret.action'
import { getDevicesAction } from '@actions/devices/getDevices.action'
import { getProfileAction } from '@actions/profile/getProfile.action'
import { updateProfileAction } from '@actions/profile/updateProfile.action'
import { uploadLogoAction } from '@actions/profile/uploadLogo.action'
import { changePasswordAction } from '@actions/account/changePassword.action'
import { errorMessage } from '@lib/errors'
import { copyToClipboard, formatDateTime, maskKey, workspaceNameFromEmail } from '@lib/utils'
import { usePortalAuthStore } from '@store/portalAuth.store'
import { useUiStore } from '@store/ui.store'
import type { KeyPair } from '@entities/KeyPair.entity'
import type { Device } from '@entities/Device.entity'
import type { WorkspaceProfile } from '@entities/WorkspaceProfile.entity'

const POLL_INTERVAL_MS = 5_000
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100]

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  async function copy() {
    try {
      await copyToClipboard(value)
      toast.success(`${label} copied.`)
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}.`)
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
      .catch((err) => toast.error(errorMessage(err, 'Failed to load profile.')))
  }

  useEffect(load, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const updated = await uploadLogoAction(file)
      setProfile(updated)
      toast.success('Logo updated.')
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to upload logo.'))
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
      toast.success('Workspace name updated.')
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update name.'))
    } finally {
      setSavingName(false)
    }
  }

  async function handleSaveWebsite() {
    setSavingWebsite(true)
    try {
      const updated = await updateProfileAction({ website_url: websiteUrl.trim() })
      setProfile(updated)
      toast.success('Website updated.')
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update website.'))
    } finally {
      setSavingWebsite(false)
    }
  }

  const displayName = profile?.name || workspaceNameFromEmail(email)

  return (
    <div className="max-w-xl space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Workspace logo</CardTitle>
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
              {uploading ? 'Uploading…' : 'Upload logo'}
            </Button>
            <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP — max 2 MB.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Workspace name</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={workspaceNameFromEmail(email)}
            />
          </div>
          <Button onClick={handleSaveName} disabled={savingName || name === (profile?.name ?? '')}>
            {savingName ? 'Saving…' : 'Save changes'}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Website</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="website-url">URL</Label>
            <Input
              id="website-url"
              type="url"
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
            />
          </div>
          <Button onClick={handleSaveWebsite} disabled={savingWebsite || websiteUrl === (profile?.website_url ?? '')}>
            {savingWebsite ? 'Saving…' : 'Save changes'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function SecurityTab() {
  const email = usePortalAuthStore((s) => s.email)
  const tenantId = usePortalAuthStore((s) => s.tenantId)
  const logout = usePortalAuthStore((s) => s.logout)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match.')
      return
    }
    setSaving(true)
    try {
      await changePasswordAction(currentPassword, newPassword)
      toast.success('Password changed.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to change password.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <p className="text-sm">{email}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Tenant ID</Label>
            <p className="truncate font-mono text-xs text-muted-foreground">{tenantId}</p>
          </div>
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={saving || !currentPassword || !newPassword}>
            {saving ? 'Changing…' : 'Change password'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function KeysTab() {
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
        else toast.error(errorMessage(err, 'Failed to load keys.'))
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
      toast.success('Secret key rotated.')
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to rotate key.'))
    } finally {
      setRotating(false)
    }
  }

  function confirmRotate() {
    dialog.openDialog(
      <ConfirmDialog
        message="Rotate your secret key? Anything still using the old one will stop being able to mint new tokens."
        confirmLabel="Rotate"
        onConfirm={doRotate}
      />,
      { title: 'Rotate secret key' },
    )
  }

  return (
    <Card className="max-w-xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          API keys
        </CardTitle>
        <CardDescription>
          Use these in the SDK — the public key identifies your tenant, the secret key mints client tokens
          server-side (see <code className="font-mono text-xs">POST /api/v1/auth/tokens</code>). Never ship the
          secret key to a browser or mobile app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notFound ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No durable key pair on record for this tenant yet — rotate to generate one.
            </p>
            <Button onClick={doRotate} disabled={isRotating}>
              <RefreshCw className="h-4 w-4" />
              {isRotating ? 'Generating…' : 'Generate key pair'}
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Public key (tenant ID)</Label>
              <CopyField label="Public key" value={keys?.tenantId ?? '…'} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Secret key</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)}>
                  {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {revealed ? 'Hide' : 'Reveal'}
                </Button>
              </div>
              <CopyField label="Secret key" value={keys ? (revealed ? keys.secretKey : maskKey(keys.secretKey)) : '…'} />
            </div>
            <Button variant="outline" onClick={confirmRotate} disabled={isRotating}>
              <RefreshCw className="h-4 w-4" />
              {isRotating ? 'Rotating…' : 'Rotate secret key'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SessionsTab() {
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
          <CardTitle className="text-base">Connected sessions</CardTitle>
          <CardDescription>Live WebSocket/TCP connections for your tenant.</CardDescription>
        </div>
        <Badge variant="success">
          <Radio className="mr-1 h-3 w-3" />
          {devices?.length ?? 0} connected
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {devices && devices.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No devices connected right now.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Connected since</TableHead>
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
  const pageSize = useUiStore((s) => s.pageSize)
  const setPageSize = useUiStore((s) => s.setPageSize)

  return (
    <Card className="max-w-xl shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label>Rows per page</Label>
        <p className="text-sm text-muted-foreground">Applied to every table in this workspace (channels, templates, billing, reports, …).</p>
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your workspace profile, security, keys, and preferences.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="keys">API keys</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="keys" className="space-y-6">
          <KeysTab />
          <div className="max-w-xl">
            <VapidKeyCard />
          </div>
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
