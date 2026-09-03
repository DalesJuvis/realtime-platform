import type { broadcasting as en } from '../en/broadcasting'

export const broadcasting = {
  pageTitle: 'Diffusion',
  pageDescription: "Publiez un message vers n'importe quel canal, dès maintenant.",

  lastBroadcastPrefix: 'Dernière diffusion vers',
  lastBroadcastMiddle: 'a touché',
  lastBroadcastSuffix: (count: number) => `appareil${count === 1 ? '' : 's'}.`,

  sentHistoryTitle: 'Historique des envois',
  sentHistoryDescriptionPrefix: 'Messages envoyés vers',
  sentHistoryDescriptionSuffix: 'au cours de cette session — remis à zéro dès que vous changez de canal.',
  sentHistoryDescriptionEmpty: 'Saisissez un canal dans le compositeur ci-dessous pour démarrer son historique.',
  sentHistoryEmpty: 'Aucun message envoyé vers ce canal pour le moment.',

  reachTitle: 'Portée',
  reachDescription:
    "Appareils actuellement abonnés à ce canal — un instantané en direct, pas un accusé de réception (le protocole ne fournit aucun accusé par message).",
  reachUnit: (count: number) => `appareil${count === 1 ? '' : 's'}`,
  reachNoChannel: "Saisissez un canal pour voir qui est à l'écoute.",
  reachNoDevices: 'Aucun appareil actuellement abonné à ce canal.',

  templatesTitle: 'Modèles',
  templatesDescription: 'Cliquez sur un modèle pour le charger dans le compositeur.',
  templatesEmpty: 'Aucun modèle enregistré pour le moment.',

  fillTemplateDialogTitle: (name: string) => `Compléter « ${name} »`,
  fillTemplateDialogDescription: 'Ces variables ont été détectées dans le modèle.',
  insert: 'Insérer',

  channelInputPlaceholder: 'Rechercher ou saisir un canal…',
  channelInputAriaLabel: 'Canal',
  listeningCount: (count: number) => `${count} à l'écoute`,

  removeAttachmentAriaLabel: 'Supprimer la pièce jointe',

  messagePlaceholder: 'Écrivez un message pour ce canal…',
  messageAriaLabel: 'Message',

  insertVariableAriaLabel: 'Insérer une variable de modèle',
  insertVariableHeading: 'Insérer une variable',
  variableValuePlaceholder: 'valeur',
  applyValues: 'Appliquer les valeurs',
  noVariableYet: 'Aucune variable dans ce message pour le moment.',
  newVariableNameAriaLabel: 'Nom de la nouvelle variable',

  attachFileAriaLabel: 'Joindre un fichier',
  insertEmojiAriaLabel: 'Insérer un émoji',
  emojiSearchPlaceholder: 'Rechercher un émoji…',
  noEmojiFound: 'Aucun émoji trouvé.',

  sendingAriaLabel: 'Envoi en cours…',
  sendBroadcastAriaLabel: 'Envoyer la diffusion',
  byteCounter: (bytes: number, max: number) => `${bytes} / ${max} octets`,

  loadDevicesError: 'Échec du chargement des appareils connectés.',
  loadChannelsError: 'Échec du chargement des canaux.',
  overLimitWarning: (max: number) =>
    `Limite de ${max} octets dépassée — continuez à écrire, mais réduisez le message avant de pouvoir l'envoyer.`,
  attachmentNote: (max: number) =>
    `À noter : le protocole ne transporte que du texte (${max} octets UTF-8, aucune trame binaire) — le nom de fichier ci-dessous n'est qu'une note visuelle, le fichier lui-même n'est jamais envoyé.`,
  publishSuccess: (channelId: string, count: number) =>
    `Diffusé vers « ${channelId} » — ${count} appareil${count === 1 ? '' : 's'} actuellement abonné${count === 1 ? '' : 's'}.`,
  sendError: "Échec de l'envoi de la diffusion.",
} satisfies typeof en
