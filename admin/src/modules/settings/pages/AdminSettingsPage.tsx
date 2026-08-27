/**
 * # AdminSettingsPage
 *
 * Two things this app actually has settings for: which engine instance
 * it's connected to (with its own bearer token), and UI preferences
 * (theme/accent — `PreferencesStore`). No account/team/audit-log settings
 * exist — this backend has no admin-account concept, just one shared token.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { cn } from '@lib/utils'
import { useAdminAuthStore } from '@store/adminAuth.store'
import { usePreferencesStore } from '@store/preferences.store'
import type { ThemeMode } from '@entities/Preferences.entity'

const ACCENT_COLORS = [
  { label: 'Indigo', hex: '#6366f1' },
  { label: 'Violet', hex: '#8b5cf6' },
  { label: 'Rose', hex: '#f43f5e' },
  { label: 'Amber', hex: '#f59e0b' },
  { label: 'Emerald', hex: '#10b981' },
  { label: 'Sky', hex: '#0ea5e9' },
  { label: 'Zinc', hex: '#71717a' },
]

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export default function AdminSettingsPage() {
  const apiUrl = useAdminAuthStore((s) => s.apiUrl)
  const token = useAdminAuthStore((s) => s.token)
  const connect = useAdminAuthStore((s) => s.connect)
  const logout = useAdminAuthStore((s) => s.logout)

  const theme = usePreferencesStore((s) => s.theme)
  const setTheme = usePreferencesStore((s) => s.setTheme)
  const accentColor = usePreferencesStore((s) => s.accentColor)
  const setAccentColor = usePreferencesStore((s) => s.setAccentColor)

  const [urlDraft, setUrlDraft] = useState(apiUrl ?? '')
  const [tokenDraft, setTokenDraft] = useState(token ?? '')

  function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!urlDraft.trim() || !tokenDraft.trim()) return
    connect({ apiUrl: urlDraft.trim().replace(/\/$/, ''), token: tokenDraft.trim() })
    toast.success('Connection updated.')
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Connection</CardTitle>
          <CardDescription>The engine instance this app manages, and its admin token.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="settings-url">Admin API URL</Label>
              <Input id="settings-url" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-token">Admin token</Label>
              <Input
                id="settings-token"
                type="password"
                value={tokenDraft}
                onChange={(e) => setTokenDraft(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" onClick={logout}>
                Disconnect
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Theme</Label>
            <div className="flex gap-2">
              {THEME_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={theme === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Accent color</Label>
            <div className="flex gap-2">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  aria-label={color.label}
                  onClick={() => setAccentColor(color.hex)}
                  className={cn(
                    'h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-shadow',
                    accentColor === color.hex && 'ring-2 ring-foreground',
                  )}
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
