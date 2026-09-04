/** EmbedPage — the Push Widget customizer/generator. Pre-fills the
 * tenant's real VAPID key/tenant ID and the most recently minted token
 * (`store/mintedToken.store`, same one `MintTokenCard` writes to) into
 * copy-pasteable embed code, styled from the customization form. */
export const embed = {
  pageTitle: 'Push Widget',
  pageSubtitle: "Customize the notification button for your own site, then copy the ready-to-paste code — pre-filled with this tenant's real credentials.",

  customizeTitle: 'Customize',
  modeLabel: 'Prompt mode',
  modeButton: 'Button — visitor clicks to opt in',
  modePopup: 'Popup — appears on its own, like a "Sign in with Google" card',
  modeButtonHint: 'A plain button you place anywhere on your page.',
  modePopupHint:
    'Shows itself once eligible (permission not yet decided) and, if dismissed, waits the interval below before reappearing on a later visit — no backend involved, the interval lives in the generated code.',
  buttonTextLabel: 'Button text',
  backgroundColorLabel: 'Background color',
  accentColorLabel: 'Accent color',
  textColorLabel: 'Text color',
  cornerRadiusLabel: 'Corner radius',
  channelsLabel: 'Channels',
  channelsHint: 'Comma-separated — e.g. orders:*, or * for every channel.',

  popupTitleLabel: 'Popup title',
  popupDescriptionLabel: 'Popup description',
  popupConfirmLabelLabel: 'Confirm button label',
  popupThemeLabel: 'Theme',
  popupThemeLight: 'Light',
  popupThemeDark: 'Dark',
  popupPositionLabel: 'Screen position',
  popupRepromptLabel: 'Re-prompt after (days)',
  popupRepromptHint: "How long to wait before showing the popup again after a visitor dismisses it. 0 = never show it again once dismissed.",

  previewTitle: 'Preview',
  previewNote: "Visual only — clicking it here doesn't subscribe anything.",
  previewClickToast: "This is a preview — the real button subscribes once it's on your site.",

  codeTitle: 'Embed code',
  formatVanilla: 'Vanilla HTML',
  formatReact: 'React',
  vanillaCodeLabel: 'Paste anywhere on your site',
  reactCodeLabel: 'Requires @mio/realtime-sdk-react',

  noVapidKey: "Web Push isn't configured on this instance yet — there's no key to embed. Ask whoever runs this backend to set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY.",
  noToken: 'Mint a token below first — the generated code needs one to authenticate the registration call.',
  tokenExpiresNote: 'This token is embedded as plain text in whatever you paste it into — treat it like a public API key, and re-mint (and re-copy) once it expires.',

  swTitle: 'Service worker',
  swNote: 'Web Push needs a service worker deployed on your site to receive it — this is a ready-to-use one, wired for the JSON payload shape this backend sends.',
  swDownloadButton: 'Download sw.js',
  swDownloaded: 'sw.js downloaded — deploy it at your site\'s root.',
}
