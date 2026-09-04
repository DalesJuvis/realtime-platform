import type { assistant as en } from '../en/assistant'

export const assistant = {
  greeting: (name: string) => `Salut, ${name} !`,
  subtitle: 'J\'ai une recommandation pour vous.',
  close: 'Fermer',
  keepAside: 'Mettre de côté',
  taskInputPlaceholder: 'Décrivez votre tâche…',
  taskNotWiredUp: "Ce n'est pas encore branché — pour l'instant je peux seulement vous signaler des choses sur votre espace de travail.",

  categoryApiToken: 'Jeton API',
  categoryWebPush: 'Web Push',
  categoryPushNotifications: 'Notifications push',
  categoryChannels: 'Canaux',
  categoryTemplates: 'Modèles',
  categoryBroadcasting: 'Diffusion',
  categoryPlatform: 'Plateforme',

  daysUnit: 'jours',
  devicesUnit: 'appareils',
  channelsUnit: 'canaux',
  templatesUnit: 'modèles',
  messagesUnit: 'messages',
  requestsUnit: 'requêtes',

  tokenExpired: "Votre jeton généré a expiré — générez-en un nouveau pour ne pas casser vos intégrations.",
  tokenExpiringSoon: (days: number) =>
    days <= 1
      ? "Votre jeton expire aujourd'hui — régénérez-en un avant que vos intégrations soient bloquées."
      : `Votre jeton expire dans ${days} jours — régénérez-le avant que ça pose problème.`,
  mintNewToken: 'Aller aux clés API',

  webPushNotConfigured: "Web Push n'est pas encore configuré sur ce backend — demandez à qui le gère de configurer une paire de clés VAPID.",
  learnAboutWebPush: 'Lire la documentation',

  noDevicesSubscribed: "Personne n'est encore abonné aux notifications push — intégrez le widget push sur votre site pour commencer à récolter des abonnés.",
  openPushWidget: 'Ouvrir le widget push',

  noChannelsYet: "Vous n'avez pas encore créé de canal — envoyez votre première diffusion pour en créer un.",
  goToBroadcasting: 'Aller à la diffusion',

  noTemplatesYet: 'Aucun modèle enregistré — enregistrez-en un pour accélérer votre prochaine diffusion.',
  goToTemplates: 'Aller aux modèles',

  rateLimited: (count: number) => `${count} requêtes ont été limitées récemment — vérifiez votre cadence de publication.`,

  allGood: [
    'Tout va bien par ici. Allez construire quelque chose de génial.',
    "Rien en feu, rien en attente — calme plat aujourd'hui.",
    'Votre espace de travail a fière allure. Je vous préviens si ça change.',
  ],
  messagesSentSoFar: (count: number) =>
    count > 0 ? `${count} messages livrés jusqu'ici — pas mal !` : "Aucun message envoyé pour l'instant — je serai là quand vous serez prêt.",
  goToOverview: "Voir l'aperçu",

  loading: "Laissez-moi une seconde, je jette un œil à votre espace de travail…",

  positionLabel: "Position de l'assistant",
  positionHint: "Où l'assistant flottant se place à l'écran — choisissez un coin, ou masquez-le.",
  positionBottomRight: 'Bas droite',
  positionBottomLeft: 'Bas gauche',
  positionTopRight: 'Haut droite',
  positionTopLeft: 'Haut gauche',
  positionHidden: 'Masqué',
} satisfies typeof en
