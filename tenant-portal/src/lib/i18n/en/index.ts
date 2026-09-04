import { common } from './common'
import { dataTable } from './dataTable'
import { dialogs } from './dialogs'
import { nav } from './nav'
import { cards } from './cards'
import { auth } from './auth'
import { overview } from './overview'
import { broadcasting } from './broadcasting'
import { templates } from './templates'
import { channels } from './channels'
import { keys } from './keys'
import { billing } from './billing'
import { subscriptions } from './subscriptions'
import { checkout } from './checkout'
import { reports } from './reports'
import { settings } from './settings'
import { docs } from './docs'
import { notificationBell } from './notificationBell'
import { devices } from './devices'
import { embed } from './embed'
import { assistant } from './assistant'

/** The canonical translation shape — `fr` is typechecked against this
 * (`satisfies typeof en` in each of its module files), so an English
 * string added here without a French counterpart is a compile error, not
 * a silent fallback. */
export const en = {
  common,
  dataTable,
  dialogs,
  nav,
  cards,
  auth,
  overview,
  broadcasting,
  templates,
  channels,
  keys,
  billing,
  subscriptions,
  checkout,
  reports,
  settings,
  docs,
  notificationBell,
  devices,
  embed,
  assistant,
} as const
