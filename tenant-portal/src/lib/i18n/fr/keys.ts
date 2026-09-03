import type { keys as en } from '../en/keys'

export const keys = {
  pageTitle: 'Clés API',
  pageSubtitlePrefix:
    'Des paires de clés nommées pour vos propres serveurs/applications — chacune valide et révocable indépendamment, en plus de votre',
  primarySecretLabel: 'clé secrète principale',
  pageSubtitleSuffix: 'dans Paramètres → Clés API.',
  generateKeyPair: 'Générer une paire de clés',

  publicKeyColumn: 'Clé publique',
  createdColumn: 'Créée le',
  revokedStatus: 'Révoquée',

  secretWarning:
    "Ce secret ne s'affiche qu'une seule fois. Copiez-le maintenant — vous ne pourrez plus le revoir, seulement le révoquer et en générer un nouveau.",
  publicKeyLabel: 'Clé publique',
  secretKeyLabel: 'Clé secrète',
  done: 'Terminé',

  namePlaceholder: 'Serveur de production',
  nameHint: 'Un libellé pour distinguer cette paire des autres — par exemple, le serveur ou l’environnement concerné.',
  generating: 'Génération…',
  generate: 'Générer',
  generateDialogTitle: 'Générer une paire de clés API',
  generateFailed: 'Échec de la génération de la clé API.',

  revokeAction: 'Révoquer la paire',
  revokeDialogTitle: 'Révoquer une paire de clés API',
  revokeConfirmLabel: 'Révoquer',
  revokeConfirmMessage: (name: string) =>
    `Révoquer « ${name} » ? Tout serveur utilisant encore cette paire perdra immédiatement la possibilité de générer ou de valider des jetons avec elle — vos autres paires de clés et votre clé secrète principale ne sont pas affectées.`,
  revoked: 'Clé API révoquée.',
  revokeFailed: 'Échec de la révocation de la clé API.',

  emptyState: 'Aucune paire de clés API pour le moment — générez-en une pour un serveur ou une application donnée.',
} as const satisfies typeof en
