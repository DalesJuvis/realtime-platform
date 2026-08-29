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
import type { ColumnDef } from '@entities/DataTable.entity'
import type { ApiKey, ApiKeyStatus, GeneratedApiKey } from '@entities/ApiKey.entity'

const STATUS_VARIANT: Record<ApiKeyStatus, 'success' | 'neutral'> = {
  active: 'success',
  revoked: 'neutral',
}

const columns: ColumnDef<ApiKey>[] = [
  { key: 'name', header: 'Name', sortable: true },
  {
    key: 'publicKey',
    header: 'Public key',
    renderCell: (_v, row) => (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs">{row.publicKey}</span>
        <CopyButton value={row.publicKey} label="Public key" />
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    renderCell: (_v, row) => (
      <Badge variant={STATUS_VARIANT[row.status]} className="capitalize">
        {row.status}
      </Badge>
    ),
  },
  { key: 'createdAt', header: 'Created', sortable: true, renderCell: (_v, row) => formatDateTime(row.createdAt) },
]

function GeneratedKeyReveal({ generated, onDone }: { generated: GeneratedApiKey; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>This secret is shown once. Copy it now — you won't be able to see it again, only revoke and generate a new one.</span>
      </p>
      <div className="space-y-1.5">
        <Label>Public key</Label>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
          <span className="flex-1 truncate">{generated.publicKey}</span>
          <CopyButton value={generated.publicKey} label="Public key" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Secret key</Label>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
          <span className="flex-1 truncate">{generated.secret}</span>
          <CopyButton value={generated.secret} label="Secret key" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  )
}

function GenerateKeyForm({ onGenerated }: { onGenerated: (key: GeneratedApiKey) => void }) {
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
      toast.error(errorMessage(err, 'Failed to generate API key.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="key-name">Name</Label>
        <Input
          id="key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production server"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          A label to tell this pair apart from others — e.g. which server or environment it's for.
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !name.trim()}>
          {isSubmitting ? 'Generating…' : 'Generate'}
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
  const dialog = useDialog()
  const [refreshKey, setRefreshKey] = useState(0)
  const source = useMemo(() => ({ type: 'request' as const, fn: getApiKeysAction }), [])

  function openGenerateDialog() {
    dialog.openDialog(<GenerateKeyDialog onGenerated={() => setRefreshKey((k) => k + 1)} />, {
      title: 'Generate API key pair',
    })
  }

  function confirmRevoke(row: ApiKey) {
    dialog.openDialog(
      <ConfirmDialog
        message={`Revoke "${row.name}"? Any server still using this pair will immediately stop being able to mint or validate tokens with it — your other key pairs and primary secret are unaffected.`}
        confirmLabel="Revoke"
        onConfirm={async () => {
          try {
            await revokeApiKeyAction(row.id)
            toast.success('API key revoked.')
            setRefreshKey((k) => k + 1)
          } catch (err) {
            toast.error(errorMessage(err, 'Failed to revoke API key.'))
          }
        }}
      />,
      { title: 'Revoke API key pair' },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Named key pairs for your own servers/apps — each independently valid and revocable, on top of your{' '}
            <span className="font-medium">primary secret</span> at Settings → API keys.
          </p>
        </div>
        <Button onClick={openGenerateDialog}>
          <Plus className="h-4 w-4" />
          Generate key pair
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
            label: 'Status',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'revoked', label: 'Revoked' },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: 'Revoke pair',
            icon: Ban,
            variant: 'destructive',
            hidden: row.status === 'revoked',
            onClick: () => confirmRevoke(row),
          },
        ]}
        renderEmpty={() => (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <KeyRound className="h-6 w-6" />
            No API key pairs yet — generate one for a specific server or app.
          </div>
        )}
      />
    </div>
  )
}
