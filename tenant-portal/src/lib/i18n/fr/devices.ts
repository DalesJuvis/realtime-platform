import type { devices as en } from '../en/devices'

export const devices = {
  pageTitle: 'Appareils',
  pageSubtitle: 'Chaque appareil actuellement abonné aux notifications push sur les canaux de votre tenant.',

  columnDevice: 'Appareil',
  columnKind: 'Type',
  columnChannels: 'Canaux',
  columnRegistered: 'Enregistré',

  kindMobile: 'Mobile',
  kindDesktop: 'Bureau',
  kindOther: 'Autre',
  unknownDevice: 'Appareil inconnu',

  sendTestAction: 'Envoyer un test',
  testSent: 'Notification de test envoyée.',
  testSendFailed: "Échec de l'envoi de la notification de test.",

  revokeAction: 'Révoquer',
  revokeDialogTitle: "Révoquer l'appareil",
  revokeConfirmMessage: (deviceLabel: string) =>
    `Révoquer « ${deviceLabel} » ? Il ne recevra plus de notifications push pour ce tenant.`,
  revoked: 'Appareil révoqué.',
  revokeFailed: "Échec de la révocation de l'appareil.",

  loadFailed: 'Échec du chargement des appareils.',
  emptyState:
    "Aucun appareil abonné pour le moment — activez les notifications depuis Paramètres → Préférences, ou faites abonner une application via le SDK.",
} satisfies typeof en
