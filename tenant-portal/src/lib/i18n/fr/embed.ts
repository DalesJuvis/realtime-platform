import type { embed as en } from '../en/embed'

export const embed = {
  pageTitle: 'Widget push',
  pageSubtitle:
    'Personnalisez le bouton de notification pour votre propre site, puis copiez le code prêt à coller — pré-rempli avec les identifiants réels de ce tenant.',

  customizeTitle: 'Personnaliser',
  modeLabel: 'Mode de sollicitation',
  modeButton: "Bouton — le visiteur clique pour s'inscrire",
  modePopup: 'Popup — apparaît seule, comme une carte "Se connecter avec Google"',
  modeButtonHint: 'Un simple bouton que vous placez où vous voulez sur votre page.',
  modePopupHint:
    "S'affiche dès qu'elle est éligible (permission pas encore décidée) et, si rejetée, attend l'intervalle ci-dessous avant de réapparaître à une visite ultérieure — aucun backend requis, l'intervalle vit dans le code généré.",
  buttonTextLabel: 'Texte du bouton',
  backgroundColorLabel: 'Couleur de fond',
  accentColorLabel: "Couleur d'accent",
  textColorLabel: 'Couleur du texte',
  cornerRadiusLabel: 'Arrondi des coins',
  channelsLabel: 'Canaux',
  channelsHint: 'Séparés par des virgules — ex. orders:*, ou * pour tous les canaux.',

  popupTitleLabel: 'Titre du popup',
  popupDescriptionLabel: 'Description du popup',
  popupConfirmLabelLabel: 'Libellé du bouton de confirmation',
  popupThemeLabel: 'Thème',
  popupThemeLight: 'Clair',
  popupThemeDark: 'Sombre',
  popupPositionLabel: "Position à l'écran",
  popupRepromptLabel: 'Reproposer après (jours)',
  popupRepromptHint:
    "Délai avant de réafficher le popup après qu'un visiteur l'ait rejeté. 0 = ne plus jamais le réafficher une fois rejeté.",

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

  swTitle: 'Service worker',
  swNote:
    "Web Push a besoin d'un service worker déployé sur votre site pour le recevoir — en voici un prêt à l'emploi, câblé pour le format JSON envoyé par ce backend.",
  swDownloadButton: 'Télécharger sw.js',
  swDownloaded: 'sw.js téléchargé — déployez-le à la racine de votre site.',

  iconTitle: 'Icône de notification',
  iconNote:
    "C'est le logo de votre espace de travail, affiché à côté de la notification sur ordinateur et Android — déjà intégré dans le sw.js ci-dessous.",
  iconMissingHint: "Pas encore de logo — importez-en un pour l'inclure comme icône de notification ci-dessous.",
  iconUploadButton: 'Importer un logo',
  iconChangeButton: 'Changer le logo',
  iconUploading: 'Import en cours…',
  iconUpdated: 'Logo mis à jour — inclus dans le service worker généré ci-dessous.',
  iconUploadFailed: "Échec de l'import du logo.",

  sampleTitleLabel: 'Titre exemple',
  sampleBodyLabel: 'Description exemple',
  sampleHint: 'Aperçu uniquement — le vrai titre/description viennent de ce que vous publiez sur le canal.',
  notificationNow: 'maintenant',
} satisfies typeof en
