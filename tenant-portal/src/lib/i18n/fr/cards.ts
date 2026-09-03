import type { cards as en } from '../en/cards'

export const cards = {
  clientTokenTitle: 'Jeton client',
  clientTokenDescription:
    "Générez un jeton WebSocket/TCP signé pour un utilisateur de votre application — votre clé secrète ne quitte jamais le serveur.",
  subjectLabel: 'Sujet (sub)',
  expiresInLabel: 'Expire dans',
  ttl1Hour: '1 heure (par défaut)',
  ttl24Hours: '24 heures',
  ttl7Days: '7 jours',
  ttl30Days: '30 jours (maximum)',
  minting: 'Génération…',
  mintToken: 'Générer le jeton',
  mintTokenHint:
    "Un jeton longue durée reste valide jusqu'à expiration, sans possibilité de le révoquer avant — choisissez la durée la plus courte adaptée à votre usage. Pour une intégration collée sur un site statique sans backend, un préréglage plus long que celui d'1 heure est généralement préférable : il n'y a aucun renouvellement automatique, donc à l'expiration il faudra en générer un nouveau et le recoller.",
  token: 'Jeton',
  expiresInDuration: (duration: string) => `Expire dans ${duration}.`,
  downloadCredentials: 'Télécharger mio-credentials.json',
  mintTokenFailed: 'Échec de la génération du jeton.',

  vapidKeyTitle: 'Clé publique VAPID',
  vapidKeyDescriptionPrefix:
    'Pour un vrai Web Push (notifications même onglet/navigateur fermé) depuis votre propre site ou application — passez cette valeur en tant que',
  vapidKeyDescriptionMiddle: 'à',
  vapidKeyDescriptionSuffix: 'Partagée par tous les tenants de cette instance — ce n’est pas un secret, sans risque à intégrer côté client.',
  vapidPublicKeyLabel: 'Clé publique VAPID',
  loading: 'Chargement…',

  setupGuideTitle: 'Guide de démarrage',
  dismissSetupGuide: 'Masquer le guide de démarrage',
  ofComplete: (done: number, total: number) => `${done} sur ${total} terminées`,
  stepGenerateApiKeys: 'Générez vos clés API',
  stepPublishToChannel: 'Publiez sur un canal',
  stepSaveTemplate: 'Enregistrez un modèle de message',
} as const satisfies typeof en
