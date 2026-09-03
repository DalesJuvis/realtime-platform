/**
 * # ApiKeysPage
 *
 * Real API key pair management — multiple, independently-generated,
 * independently-revocable pairs at once (`POST`/`GET`/`DELETE
 * /api/v1/portal/api-keys`), additive to (never a replacement for) the
 * tenant's own primary secret at Settings → API keys. Used to be a mock
 * Stripe-style table over sample data with a "not available yet" revoke
 * action — this is the real thing.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Ban, KeyRound, Plus } from 'lucide-react'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { DataTable } from '@components/DataTable/DataTable'
import { CopyButton } from '@components/shared/CopyButton'
import { ConfirmDialog } from '@components/shared/ConfirmDialog'
import { MintTokenCard } from '@components/shared/MintTokenCard'
import { useDialog } from '@providers/DialogProvider'
import { getApiKeysAction } from '@actions/keys/getApiKeys.action'
import { generateApiKeyAction } from '@actions/keys/generateApiKey.action'
import { revokeApiKeyAction } from '@actions/keys/revokeApiKey.action'
import { errorMessage } from '@lib/errors'
import { formatDateTime } from '@lib/utils'
import { useTranslation } from '@lib/i18n'
import type { ColumnDef } from '@entities/DataTable.entity'
import type { ApiKey, ApiKeyStatus, GeneratedApiKey } from '@entities/ApiKey.entity'

const STATUS_VARIANT: Record<ApiKeyStatus, 'success' | 'neutral'> = {
  active: 'success',
  revoked: 'neutral',
}

type Translation = ReturnType<typeof useTranslation>['t']

function buildColumns(t: Translation): ColumnDef<ApiKey>[] {
  return [
    { key: 'name', header: t.common.name, sortable: true },
    {
      key: 'publicKey',
      header: t.keys.publicKeyColumn,
      renderCell: (_v, row) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs">{row.publicKey}</span>
          <CopyButton value={row.publicKey} label={t.keys.publicKeyLabel} />
        </div>
      ),
    },
    {
      key: 'status',
      header: t.common.status,
      renderCell: (_v, row) => (
        <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
          {row.status === 'active' ? t.common.active : t.keys.revokedStatus}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: t.keys.createdColumn,
      sortable: true,
      renderCell: (_v, row) => formatDateTime(row.createdAt),
    },
  ]
}

function GeneratedKeyReveal({ generated, onDone }: { generated: GeneratedApiKey; onDone: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t.keys.secretWarning}</span>
      </p>
      <div className="space-y-1.5">
        <Label>{t.keys.publicKeyLabel}</Label>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
          <span className="flex-1 truncate">{generated.publicKey}</span>
          <CopyButton value={generated.publicKey} label={t.keys.publicKeyLabel} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t.keys.secretKeyLabel}</Label>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
          <span className="flex-1 truncate">{generated.secret}</span>
          <CopyButton value={generated.secret} label={t.keys.secretKeyLabel} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={onDone}>{t.keys.done}</Button>
      </div>
    </div>
  )
}

function GenerateKeyForm({ onGenerated }: { onGenerated: (key: GeneratedApiKey) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const generated = await generateApiKeyAction(trimmed)
      onGenerated(generated)
    } catch (err) {
      toast.error(errorMessage(err, t.keys.generateFailed))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="key-name">{t.common.name}</Label>
        <Input
          id="key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.keys.namePlaceholder}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">{t.keys.nameHint}</p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !name.trim()}>
          {isSubmitting ? t.keys.generating : t.keys.generate}
        </Button>
      </div>
    </form>
  )
}

function GenerateKeyDialog({ onGenerated }: { onGenerated: () => void }) {
  const dialog = useDialog()
  const [generated, setGenerated] = useState<GeneratedApiKey | null>(null)

  if (generated) {
    return (
      <GeneratedKeyReveal
        generated={generated}
        onDone={() => {
          dialog.closeAll()
          onGenerated()
        }}
      />
    )
  }
  return <GenerateKeyForm onGenerated={setGenerated} />
}

export default function ApiKeysPage() {
  const { t } = useTranslation()
  const dialog = useDialog()
  const [refreshKey, setRefreshKey] = useState(0)
  const source = useMemo(() => ({ type: 'request' as const, fn: getApiKeysAction }), [])
  const columns = useMemo(() => buildColumns(t), [t])

  function openGenerateDialog() {
    dialog.openDialog(<GenerateKeyDialog onGenerated={() => setRefreshKey((k) => k + 1)} />, {
      title: t.keys.generateDialogTitle,
    })
  }

  function confirmRevoke(row: ApiKey) {
    dialog.openDialog(
      <ConfirmDialog
        message={t.keys.revokeConfirmMessage(row.name)}
        confirmLabel={t.keys.revokeConfirmLabel}
        onConfirm={async () => {
          try {
            await revokeApiKeyAction(row.id)
            toast.success(t.keys.revoked)
            setRefreshKey((k) => k + 1)
          } catch (err) {
            toast.error(errorMessage(err, t.keys.revokeFailed))
          }
        }}
      />,
      { title: t.keys.revokeDialogTitle },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.keys.pageTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {t.keys.pageSubtitlePrefix} <span className="font-medium">{t.keys.primarySecretLabel}</span>{' '}
            {t.keys.pageSubtitleSuffix}
          </p>
        </div>
        <Button onClick={openGenerateDialog}>
          <Plus className="h-4 w-4" />
          {t.keys.generateKeyPair}
        </Button>
      </div>

      <MintTokenCard />

      <DataTable
        source={source}
        refreshKey={refreshKey}
        columns={columns}
        selectable
        getRowId={(row) => row.id}
        exportFilename="api-keys"
        filters={[
          {
            key: 'status',
            label: t.common.status,
            options: [
              { value: 'active', label: t.common.active },
              { value: 'revoked', label: t.keys.revokedStatus },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: t.keys.revokeAction,
            icon: Ban,
            variant: 'destructive',
            hidden: row.status === 'revoked',
            onClick: () => confirmRevoke(row),
          },
        ]}
        renderEmpty={() => (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <KeyRound className="h-6 w-6" />
            {t.keys.emptyState}
          </div>
        )}
      />
    </div>
  )
}
