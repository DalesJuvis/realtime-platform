/**
 * # DevicesPage
 *
 * Tenant-wide Web Push device management — every device (a phone, a
 * desktop browser, another phone) currently subscribed for this tenant,
 * in a sortable/filterable/searchable table, same shape as `ApiKeysPage`.
 * Settings → Preferences still owns the on/off toggle for *this* browser
 * (that's a different operation — subscribing yourself — from managing
 * every device the tenant has); this page is purely read/revoke/test
 * across all of them, backed by the same
 * `GET`/`DELETE /api/v1/portal/push-subscriptions` and
 * `POST /api/v1/portal/push-subscriptions/test` endpoints.
 *
 * `deviceKind` (mobile/desktop/other) isn't sent by the backend — it's
 * parsed client-side from the stored `device_label` (see
 * `classifyDeviceKind`), so the filter/icon work retroactively for rows
 * registered before this page existed too.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Laptop, Radio, Send, Smartphone, Trash2 } from 'lucide-react'
import { Badge } from '@components/ui/badge'
import { DataTable } from '@components/DataTable/DataTable'
import { ConfirmDialog } from '@components/shared/ConfirmDialog'
import { useDialog } from '@providers/DialogProvider'
import { getPushSubscriptionsAction } from '@actions/push/getPushSubscriptions.action'
import { revokePushSubscriptionAction } from '@actions/push/revokePushSubscription.action'
import { sendTestPushAction } from '@actions/push/sendTestPush.action'
import { errorMessage } from '@lib/errors'
import { classifyDeviceKind, formatDateTime, type DeviceKind } from '@lib/utils'
import { useTranslation } from '@lib/i18n'
import type { ColumnDef } from '@entities/DataTable.entity'
import type { PushSubscriptionSummary } from '@entities/PushSubscriptionSummary.entity'

interface DeviceRow extends PushSubscriptionSummary {
  readonly deviceKind: DeviceKind
}

const KIND_ICON: Record<DeviceKind, typeof Smartphone> = {
  mobile: Smartphone,
  desktop: Laptop,
  other: Radio,
}

const KIND_BADGE_VARIANT: Record<DeviceKind, 'info' | 'secondary' | 'outline'> = {
  mobile: 'info',
  desktop: 'secondary',
  other: 'outline',
}

type Translation = ReturnType<typeof useTranslation>['t']

function buildColumns(t: Translation): ColumnDef<DeviceRow>[] {
  return [
    {
      key: 'device_label',
      header: t.devices.columnDevice,
      sortable: true,
      renderCell: (_v, row) => (
        <span className="font-medium">{row.device_label ?? t.devices.unknownDevice}</span>
      ),
    },
    {
      key: 'deviceKind',
      header: t.devices.columnKind,
      renderCell: (_v, row) => {
        const Icon = KIND_ICON[row.deviceKind]
        const label = { mobile: t.devices.kindMobile, desktop: t.devices.kindDesktop, other: t.devices.kindOther }[
          row.deviceKind
        ]
        return (
          <Badge variant={KIND_BADGE_VARIANT[row.deviceKind]} className="gap-1">
            <Icon className="h-3 w-3" />
            {label}
          </Badge>
        )
      },
      csvValue: (row) => row.deviceKind,
    },
    {
      key: 'channels',
      header: t.devices.columnChannels,
      renderCell: (_v, row) => (
        <div className="flex flex-wrap gap-1">
          {row.channels.map((c) => (
            <Badge key={c} variant="neutral" className="font-mono text-[10px]">
              {c}
            </Badge>
          ))}
        </div>
      ),
      csvValue: (row) => row.channels.join(' '),
    },
    {
      key: 'created_at',
      header: t.devices.columnRegistered,
      sortable: true,
      renderCell: (_v, row) => formatDateTime(row.created_at),
    },
  ]
}

export default function DevicesPage() {
  const { t } = useTranslation()
  const dialog = useDialog()
  const [refreshKey, setRefreshKey] = useState(0)
  const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null)

  const source = useMemo(
    () => ({
      type: 'request' as const,
      fn: async (): Promise<DeviceRow[]> => {
        const devices = await getPushSubscriptionsAction()
        return devices.map((d) => ({ ...d, deviceKind: classifyDeviceKind(d.device_label) }))
      },
    }),
    [],
  )
  const columns = useMemo(() => buildColumns(t), [t])

  async function handleSendTest(row: DeviceRow) {
    setTestingEndpoint(row.endpoint)
    try {
      await sendTestPushAction(row.endpoint)
      toast.success(t.devices.testSent)
    } catch (err) {
      toast.error(errorMessage(err, t.devices.testSendFailed))
    } finally {
      setTestingEndpoint(null)
    }
  }

  function confirmRevoke(row: DeviceRow) {
    dialog.openDialog(
      <ConfirmDialog
        message={t.devices.revokeConfirmMessage(row.device_label ?? t.devices.unknownDevice)}
        confirmLabel={t.devices.revokeAction}
        onConfirm={async () => {
          try {
            await revokePushSubscriptionAction(row.endpoint)
            toast.success(t.devices.revoked)
            setRefreshKey((k) => k + 1)
          } catch (err) {
            toast.error(errorMessage(err, t.devices.revokeFailed))
          }
        }}
      />,
      { title: t.devices.revokeDialogTitle },
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.devices.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.devices.pageSubtitle}</p>
      </div>

      <DataTable
        source={source}
        refreshKey={refreshKey}
        columns={columns}
        selectable
        getRowId={(row) => row.endpoint}
        exportFilename="devices"
        filters={[
          {
            key: 'deviceKind',
            label: t.devices.columnKind,
            options: [
              { value: 'mobile', label: t.devices.kindMobile },
              { value: 'desktop', label: t.devices.kindDesktop },
              { value: 'other', label: t.devices.kindOther },
            ],
          },
        ]}
        rowActions={(row) => [
          {
            label: t.devices.sendTestAction,
            icon: Send,
            disabled: testingEndpoint === row.endpoint,
            onClick: () => handleSendTest(row),
          },
          {
            label: t.devices.revokeAction,
            icon: Trash2,
            variant: 'destructive',
            onClick: () => confirmRevoke(row),
          },
        ]}
        renderEmpty={() => (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Smartphone className="h-6 w-6" />
            {t.devices.emptyState}
          </div>
        )}
      />
    </div>
  )
}
