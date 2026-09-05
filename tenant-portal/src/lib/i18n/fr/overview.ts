import type { overview as en } from '../en/overview'

export const overview = {
  pageTitle: "Vue d'ensemble",
  pageSubtitle: (email: string) => `${email} — espace de travail.`,
  liveBadge: (seconds: number) => `En direct · mise à jour toutes les ${seconds} s`,
  focusOnMetrics: 'Focus sur les indicateurs',
  focusOnMetricsHint: 'Focus sur les indicateurs — masque la barre latérale et le reste',
  exitFocusMode: 'Quitter le mode focus',

  activeSessionsLabel: 'Sessions actives',
  messagesProcessedLabel: 'Messages traités',
  realtimeMessagesLabel: 'Messages temps réel',
  realtimeMessagesHint: 'Livrés en direct via une connexion WebSocket ouverte.',
  pushMessagesLabel: 'Messages push',
  pushMessagesHint: 'Livrés via le repli push — aucune connexion en direct pour les atteindre à la publication.',
  rateLimitedLabel: 'Limités par débit',

  activityTitle: 'Activité',
  activityDescription: (sampleCount: number) =>
    `Sessions actives, messages temps réel vs push, et envois limités par débit — en direct, ${sampleCount} derniers échantillons.`,
  collectingSamples: "Collecte des échantillons en direct — le graphique se remplit au fur et à mesure.",

  channelsLabel: 'Canaux',
  templatesLabel: 'Modèles',
  viewLink: 'Voir',
  viewAll: 'Tout voir',

  topChannelsTitle: 'Canaux principaux',
  noChannelsYet: 'Aucun canal pour le moment.',
  subscriberCount: (count: number) => `${count} abonnés`,

  recentTemplatesTitle: 'Modèles récents',
  noTemplatesYet: 'Aucun modèle pour le moment.',

  publicKeyTitle: 'Clé publique',
  publicKeyDescription: 'Votre ID de tenant pour cet environnement — peut être intégré sans risque dans une config SDK, ce n’est pas un secret.',
  goToApiKeys: 'Aller aux clés API →',

  recommendationsTitle: 'Recommandations',
  noChannelsRecommendation: 'Aucun canal pour le moment — publiez ou abonnez-vous pour en créer un.',
  sendABroadcast: 'Envoyer une diffusion',
  noTemplatesRecommendation: 'Aucun modèle pour le moment — enregistrez-en un pour accélérer vos diffusions.',
  createATemplate: 'Créer un modèle',
  rateLimitedRecommendation: (count: number) =>
    `${count} message${count === 1 ? '' : 's'} limité${count === 1 ? '' : 's'} par débit jusqu'à présent — vérifiez votre débit d'envoi si cela continue d'augmenter.`,
  goToBroadcasting: 'Aller à la diffusion',
} satisfies typeof en
