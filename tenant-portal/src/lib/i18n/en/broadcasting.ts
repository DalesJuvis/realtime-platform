/** Broadcasting page — the composer (channel search-select, textarea,
 * variable/emoji/attachment tools), the Sent history / Reach / Templates
 * cards, and the template-variable-fill dialog. Channel IDs, template
 * names/bodies, and variable names are user-entered data and stay
 * untranslated — only the surrounding chrome and copy live here. */
export const broadcasting = {
  pageTitle: 'Broadcasting',
  pageDescription: 'Publish a message to any channel right now.',

  // "Last broadcast to <code>channelId</code> reached <b>count</b> device(s)."
  // split around the two inline elements the page renders inline.
  lastBroadcastPrefix: 'Last broadcast to',
  lastBroadcastMiddle: 'reached',
  lastBroadcastSuffix: (count: number) => `device${count === 1 ? '' : 's'}.`,

  sentHistoryTitle: 'Sent history',
  sentHistoryDescriptionPrefix: 'Messages sent to',
  sentHistoryDescriptionSuffix: 'this session — clears when you change the channel.',
  sentHistoryDescriptionEmpty: 'Type a channel in the composer below to start a history for it.',
  sentHistoryEmpty: 'Nothing sent to this channel yet.',

  reachTitle: 'Reach',
  reachDescription:
    'Devices currently subscribed to this channel — a live snapshot, not a delivery receipt (the protocol has no per-message ACK).',
  reachUnit: (count: number) => `device${count === 1 ? '' : 's'}`,
  reachNoChannel: "Enter a channel to see who's listening.",
  reachNoDevices: 'No devices currently subscribed to this channel.',

  templatesTitle: 'Templates',
  templatesDescription: 'Click one to load it into the composer.',
  templatesEmpty: 'No saved templates yet.',

  fillTemplateDialogTitle: (name: string) => `Fill in "${name}"`,
  fillTemplateDialogDescription: 'These placeholders were found in the template.',
  insert: 'Insert',

  channelInputPlaceholder: 'Search or type a channel…',
  channelInputAriaLabel: 'Channel',
  listeningCount: (count: number) => `${count} listening`,

  removeAttachmentAriaLabel: 'Remove attachment',

  messagePlaceholder: 'Message this channel…',
  messageAriaLabel: 'Message',

  insertVariableAriaLabel: 'Insert a template variable',
  insertVariableHeading: 'Insert variable',
  variableValuePlaceholder: 'value',
  applyValues: 'Apply values',
  noVariableYet: 'No variable in this message yet.',
  newVariableNameAriaLabel: 'New variable name',

  attachFileAriaLabel: 'Attach a file',
  insertEmojiAriaLabel: 'Insert emoji',
  emojiSearchPlaceholder: 'Search emoji…',
  noEmojiFound: 'No emoji found.',

  sendingAriaLabel: 'Sending…',
  sendBroadcastAriaLabel: 'Send broadcast',
  byteCounter: (bytes: number, max: number) => `${bytes} / ${max} bytes`,

  loadDevicesError: 'Failed to load connected devices.',
  loadChannelsError: 'Failed to load channels.',
  overLimitWarning: (max: number) => `Over the ${max}-byte payload limit — keep writing, but trim it before you can send.`,
  attachmentNote: (max: number) =>
    `Heads up: the wire protocol carries text only (${max} UTF-8 bytes, no binary frames) — the filename below is a visual note, the file itself is never sent.`,
  publishSuccess: (channelId: string, count: number) =>
    `Published to "${channelId}" — ${count} device${count === 1 ? '' : 's'} currently subscribed.`,
  sendError: 'Failed to send broadcast.',
}
