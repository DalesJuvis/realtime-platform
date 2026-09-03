/** ApiKeysPage — the per-server API key pair table plus its generate/reveal
 * and revoke-confirmation dialogs. `MintTokenCard` (rendered on this page)
 * has its own `cards` namespace — not covered here. */
export const keys = {
  pageTitle: 'API Keys',
  pageSubtitlePrefix: 'Named key pairs for your own servers/apps — each independently valid and revocable, on top of your',
  primarySecretLabel: 'primary secret',
  pageSubtitleSuffix: 'at Settings → API keys.',
  generateKeyPair: 'Generate key pair',

  publicKeyColumn: 'Public key',
  createdColumn: 'Created',
  revokedStatus: 'Revoked',

  secretWarning:
    "This secret is shown once. Copy it now — you won't be able to see it again, only revoke and generate a new one.",
  publicKeyLabel: 'Public key',
  secretKeyLabel: 'Secret key',
  done: 'Done',

  namePlaceholder: 'Production server',
  nameHint: "A label to tell this pair apart from others — e.g. which server or environment it's for.",
  generating: 'Generating…',
  generate: 'Generate',
  generateDialogTitle: 'Generate API key pair',
  generateFailed: 'Failed to generate API key.',

  revokeAction: 'Revoke pair',
  revokeDialogTitle: 'Revoke API key pair',
  revokeConfirmLabel: 'Revoke',
  revokeConfirmMessage: (name: string) =>
    `Revoke "${name}"? Any server still using this pair will immediately stop being able to mint or validate tokens with it — your other key pairs and primary secret are unaffected.`,
  revoked: 'API key revoked.',
  revokeFailed: 'Failed to revoke API key.',

  emptyState: 'No API key pairs yet — generate one for a specific server or app.',
}
