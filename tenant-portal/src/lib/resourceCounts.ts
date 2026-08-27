/**
 * # fetchWorkspaceResourceCounts
 *
 * Real resource counts for `WorkbenchPanel`'s Overview tab — active
 * sessions, channels, and templates, each backed by an endpoint this app
 * already calls elsewhere. Failed calls degrade to `null` per-tile rather
 * than failing the whole panel.
 */

import { getOverviewAction } from '@actions/overview/getOverview.action'
import { getChannelsAction } from '@actions/channels/getChannels.action'
import { getTemplatesAction } from '@actions/templates/getTemplates.action'

export interface ResourceCount {
  readonly label: string
  readonly value: number | null
  readonly to: string
}

export async function fetchWorkspaceResourceCounts(): Promise<ResourceCount[]> {
  const [overview, channels, templates] = await Promise.all([
    getOverviewAction().catch(() => null),
    getChannelsAction().catch(() => null),
    getTemplatesAction().catch(() => null),
  ])

  return [
    { label: 'Active sessions', value: overview?.active_sessions ?? null, to: '/overview' },
    { label: 'Channels', value: channels?.length ?? null, to: '/channels' },
    { label: 'Templates', value: templates?.length ?? null, to: '/templates' },
  ]
}
