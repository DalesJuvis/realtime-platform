import type { dialogs as en } from '../en/dialogs'

export const dialogs = {
  closeAriaLabel: 'Fermer la boîte de dialogue',
  defaultConfirmLabel: 'Confirmer',
  defaultCancelLabel: 'Annuler',
} as const satisfies typeof en
