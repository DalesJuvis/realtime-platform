import type { embed as en } from '../en/embed'

export const embed = {
  pageTitle: 'Widget push',
  pageSubtitle:
    'Personnalisez le bouton de notification pour votre propre site, puis copiez le code prêt à coller — pré-rempli avec les identifiants réels de ce tenant.',

  customizeTitle: 'Personnaliser',
  buttonTextLabel: 'Texte du bouton',
  backgroundColorLabel: 'Couleur de fond',
  textColorLabel: 'Couleur du texte',
  cornerRadiusLabel: 'Arrondi des coins',
  channelsLabel: 'Canaux',
  channelsHint: 'Séparés par des virgules — ex. orders:*, ou * pour tous les canaux.',

  previewTitle: 'Aperçu',
  previewNote: "Visuel uniquement — cliquer ici n'abonne rien.",
  previewClickToast: "Ceci est un aperçu — le vrai bouton abonnera une fois sur votre site.",

  codeTitle: 'Code à intégrer',
  formatVanilla: 'HTML vanilla',
  formatReact: 'React',
  vanillaCodeLabel: 'À coller n\'importe où sur votre site',
  reactCodeLabel: 'Nécessite @mio/realtime-sdk-react',

  noVapidKey:
    "Web Push n'est pas encore configuré sur cette instance — aucune clé à intégrer. Demandez à qui gère ce backend de définir VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY.",
  noToken: "Générez d'abord un jeton ci-dessous — le code généré en a besoin pour authentifier l'inscription.",
  tokenExpiresNote:
    'Ce jeton est intégré en texte brut partout où vous le collez — traitez-le comme une clé API publique, et régénérez-le (puis recopiez) une fois expiré.',
} satisfies typeof en
