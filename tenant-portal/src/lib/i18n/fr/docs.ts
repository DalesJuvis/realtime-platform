import type { docs as en } from '../en/docs'

/** Docs page — SDK/API reference. Only prose is translated here; code
 * fragments embedded mid-sentence (method names, endpoint paths, error
 * codes) are kept as-is, matching the English source. */
export const docs = {
  pageTitle: 'Documentation',
  pageSubtitle:
    "SDKs et référence API pour cet espace de travail — les extraits ci-dessous sont pré-remplis avec votre véritable ID de tenant et votre hôte API.",

  // Tabs
  tabGettingStarted: 'Démarrage',
  tabRestApi: 'API REST',
  tabWebPush: 'Web Push',
  tabAdvanced: 'Fonctionnalités avancées',
  tabTypescript: 'JavaScript / TypeScript',
  tabReact: 'React',
  tabReactNative: 'React Native',
  tabPython: 'Python',
  tabRust: 'Rust',
  tabAndroid: 'Android (Kotlin/Java)',
  tabWordpress: 'WordPress',
  tabLaravel: 'Laravel',
  tabEmbed: "Script à intégrer (tout site)",

  // Shared CodeBlock/Section labels
  labelInstall: 'Installation',
  labelQuickStart: 'Démarrage rapide',
  labelRequest: 'Requête',
  labelResponse: 'Réponse',
  labelWsUrl: 'URL WebSocket (SDKs)',
  labelPortalApiUrl: 'URL de l\'API du portail (REST)',
  labelAddToPage: 'À ajouter à n\'importe quelle page ou article',

  // Getting started
  gsTwoThingsTitle: 'Chaque SDK a besoin de deux choses',
  gsTenantIdLabel: 'Votre ID de tenant',
  gsTenantIdText: '— public, peut être intégré sans risque :',
  gsClientTokenLabel: 'Un jeton client',
  gsClientTokenText1: '— signé côté serveur, propre à un seul utilisateur (le',
  gsClientTokenText2: ').',
  gsMintOneFrom: 'Générez-en un depuis',
  gsOverviewLink: 'Aperçu',
  gsOr: 'ou',
  gsApiKeysLink: 'Clés API',
  gsNeverGenerate: "— ne le générez jamais vous-même, et n'envoyez jamais votre secret de tenant à un navigateur ou une application mobile.",
  gsApiHostTitle: 'Votre hôte API',
  gsApiHostDescription: 'Ce à quoi chaque extrait de SDK ci-dessous se connecte.',
  gsApiHostNotePrefix: "Vous ne le configurez jamais vous-même — chaque appel de génération de jeton ci-dessous le renvoie sous",
  gsApiHostNoteSuffix: ', à transmettre tel quel au SDK.',

  // REST API
  restApiMintTokenTitle: 'Générer un jeton',
  restApiMintTokenDescription:
    "À appeler uniquement depuis votre propre backend — votre secret de tenant ne le quitte jamais. Le jeton obtenu est celui que vous transmettez au SDK/navigateur/app de l'utilisateur final. secret accepte votre secret principal (Paramètres) ou le secret de toute autre paire de clés issue de Clés API — les deux fonctionnent de façon identique ici.",
  restApiMintTokenSequencePrefix: 'Séquence complète requête/dérivation/réponse :',
  restApiMintTokenTtlNote:
    "vaut 3600 par défaut et est plafonné à 2 592 000 (30 jours) — une valeur plus élevée est silencieusement ramenée à ce plafond, jamais rejetée. Il n'y a pas de renouvellement automatique une fois le jeton expiré ; pour un jeton collé en dur dans un site statique sans backend propre, générez-en plutôt un à durée de vie plus longue depuis « Générer un jeton » dans Aperçu, au lieu de vous fier à la valeur par défaut d'une heure.",

  restApiPublishTitle: 'Publier en HTTP',
  restApiPublishDescription:
    "Pour un backend sans connexion persistante ouverte — une tâche cron, un gestionnaire de webhook. Authentifié avec un jeton déjà généré ci-dessus, jamais avec le secret brut.",
  restApiPublishCaveat:
    "Pas de découpage sur ce endpoint — contrairement à un client SDK connecté, le payload doit tenir dans 211 octets UTF-8 (une seule trame du protocole) sous peine de recevoir 400 INVALID_REQUEST. Répartissez les messages plus longs sur plusieurs appels, ou utilisez un client SDK connecté à la place.",

  restApiPublishTemplateTitle: 'Publier un modèle enregistré en HTTP',
  restApiPublishTemplateDescription:
    "Envoie l'un des modèles (Templates) de cet espace de travail par son id plutôt qu'un payload brut — les emplacements {{variable}} sont remplis côté serveur, l'appelant n'a donc jamais besoin du texte du modèle ni de la liste complète des modèles, seulement du template_id et des valeurs à insérer.",
  restApiPublishTemplateCaveat:
    "Même limite de 211 octets que ci-dessus, vérifiée après interpolation — 400 INVALID_REQUEST si le texte généré ne tient pas dedans, raccourcissez le modèle ou les valeurs. Un template_id inconnu ou appartenant à un autre tenant renvoie 404 TEMPLATE_NOT_FOUND. Une variable sans valeur correspondante est rendue comme une chaîne vide plutôt que de laisser le {{placeholder}} dans le texte envoyé.",
  restApiPublishTemplateWrapperPrefix: 'Chaque SDK connecté ci-dessous encapsule cet appel sous la forme',
  restApiPublishTemplateWrapperMiddle: "(ou la convention de nommage propre à ce SDK), aux côtés de sa méthode existante",
  restApiPublishTemplateWrapperSuffix: '— voir l\'onglet propre à chaque SDK.',

  // Web Push
  webPushBackgroundTitle: "Notifications en arrière-plan (onglet ouvert, masqué)",
  webPushBackgroundDescription:
    "Fonctionne dès aujourd'hui, sans configuration serveur — affiche une Notification native chaque fois qu'un message arrive pendant que l'onglet est masqué ou non actif.",
  webPushBackgroundNotePrefix: 'Pour un contrôle par canal à la place, appelez',
  webPushBackgroundNoteMiddle: 'directement depuis un callback',
  webPushBackgroundNoteSuffix: '— mêmes options, même filtrage.',

  webPushPushTitle: 'Notifications push (onglet ou navigateur fermé)',
  webPushPushDescription:
    "Nécessite un Service Worker dans votre application (enregistré automatiquement) et un backend qui envoie de véritables notifications Web Push chiffrées (VAPID) vers l'abonnement enregistré par cet appel — voir le endpoint push_subscriptions de cette plateforme.",
  webPushPushCaveat:
    "La remise à un navigateur totalement fermé (pas seulement un onglet fermé) dépend toujours du réveil par l'OS/le navigateur pour la notification push — hors du contrôle de tout SDK ou serveur.",
  webPushPushNotePrefix:
    'registerWebPushSubscription() demande la permission, enregistre votre Service Worker, s\'abonne, puis enregistre auprès du serveur en un seul appel. Vous préférez assembler ces étapes vous-même ?',
  webPushPushNoteSuffix: 'directement — les mêmes briques utilisées par cette fonction.',
  webPushPushNoDevices: 'Aucun plugin, aucune étape de build ? Voir l\'embed vanilla',
  webPushPushNoDevicesSuffix: "dans l'onglet Intégration.",

  // Advanced
  advancedIntroPrefix:
    'Disponible de façon identique dans chaque SDK à connexion persistante — TypeScript, Python, Rust, Android — une fois que',
  advancedIntroMiddle: "est construit comme montré dans l'onglet propre à chaque SDK. Non disponible dans le client navigateur léger de WordPress (",
  advancedIntroSuffix: '— volontairement allégé) ni dans les endpoints REST sans état.',

  advancedWildcardTitle: 'Abonnement générique (wildcard)',
  advancedWildcardDescription:
    "S'abonner à toute une famille de canaux avec un * final — chaque channelId correspondant est routé vers le même gestionnaire.",

  advancedUnicastTitle: 'Unicast — direct vers un utilisateur',
  advancedUnicastDescription:
    "Envoie à un seul utilisateur connecté plutôt qu'aux abonnés d'un canal. userId réutilise le champ channelId de la trame, et hérite donc de la même limite de 24 octets.",

  advancedSameMethodPrefix: 'Même méthode, autres SDKs : Python —',
  advancedSameMethodSeparator: '; Rust/Android —',

  advancedReplayTitle: "Replay — rattraper l'historique d'un canal",
  advancedReplayDescription:
    "Demande tout ce qui a été publié sur un canal depuis sinceUnixSeconds (0 = tout l'historique disponible). Les messages rejoués arrivent via le même gestionnaire subscribe() déjà enregistré pour ce canal — pas de callback séparé.",
  advancedReplayCaveat:
    "Non pris en charge sur un motif générique (orders:*) — le serveur ignore silencieusement une requête REPLAY portant sur autre chose qu'un ID de canal exact.",
  advancedReplayHistoryPrefix:
    "La quantité d'historique disponible est un détail de déploiement, pas un réglage côté client — par défaut, chaque canal ne conserve que ses 50 derniers messages en mémoire (perdus au redémarrage). Avec",
  advancedReplayHistoryMiddle: "défini côté serveur, l'historique est persisté durablement dans Redis, plafonné à",
  advancedReplayHistorySuffix: '(1000 par défaut) et résistant aux redémarrages —',
  advancedReplayHistoryEnd: 'ne change pas pour autant.',

  advancedChunkingTitle: 'Découpage automatique — TypeScript uniquement',
  advancedChunkingDescription:
    "Seul publish()/unicast() de sdk-typescript découpe de façon transparente un payload de plus de 211 octets en plusieurs trames et le réassemble avant le déclenchement de subscribe(). Python/Rust/Android n'ont aucun module de découpage — leurs publish()/unicast() tronquent silencieusement un payload trop volumineux au moment de l'encodage : pas d'exception, pas d'erreur, la fin du message disparaît simplement.",
  advancedChunkingCaveat:
    "POST /api/v1/messages et les méthodes Client::publish()/emitEvent() de PHP adoptent l'approche inverse, plus sûre : elles rejettent un payload trop volumineux avec une erreur avant tout appel réseau, plutôt que de le tronquer ou de le découper.",

  advancedEventsTitle: 'Événements nommés façon socket.io — client.channel()',
  advancedEventsDescription:
    "TypeScript uniquement pour l'instant (Python/Rust/Android ne l'ont pas encore — leurs subscribe()/publish() restent inchangés). Un handle propre à un canal avec on(event, handler)/emit(event, data), pour un canal qui transporte plus d'un type de message.",
  advancedEventsCaveat:
    "Ce n'est pas un changement de protocole — emit() est un publish() dont le payload encode {event, data} en JSON ; on() filtre subscribe() pour ne garder que les messages correspondant à cette forme et à ce nom d'événement, en ignorant silencieusement le reste sur le canal plutôt que de générer une erreur.",
  advancedEventsEnvelopePrefix: "Même enveloppe que",
  advancedEventsEnvelopeSuffix: "de WordPress/Laravel — un événement émis côté serveur est reçu exactement de la même façon, quel que soit le SDK.",

  // TypeScript
  tsTitle: 'JavaScript / TypeScript',
  tsDescription: 'Navigateur, Node.js, et la base des bindings React/React Native.',
  tsCaveat:
    "Pas d'accusé de réception AUTH dans le protocole — l'événement 'authenticated' se déclenche de façon optimiste juste après l'envoi. Surveillez 'authFailed' pour détecter spécifiquement un échec d'authentification (le serveur envoie un code de fermeture dédié, 4001, exactement pour ce cas) plutôt que de le déduire d'un 'close' générique.",
  tsGetTokenPrefix: 'Pour un renouvellement silencieux plutôt que de gérer',
  tsGetTokenMiddle1: 'vous-même, remplacez',
  tsGetTokenMiddle2: 'par',
  tsGetTokenMiddle3: '— appelé avant chaque tentative de connexion (y compris automatiquement après un',
  tsGetTokenMiddle4: '), en appelant',
  tsGetTokenYourOwnBackend: 'votre propre backend',
  tsGetTokenSuffix: ", jamais l'API de mio directement.",

  tsPublishTemplateTitle: 'Publier un modèle enregistré',
  tsPublishTemplateDescription:
    'Remplit les emplacements {{variable}} côté serveur et publie le résultat — voir l\'onglet API REST pour le endpoint encapsulé ici.',
  tsPublishTemplateCaveat:
    "Passe par HTTP, pas par le flux de trames WS ouvert — fonctionne même avant connect() ou sans connexion ouverte, tant qu'un token (ou getToken) est configuré. Contrairement à publish()/unicast(), l'appel n'est pas mis en file d'attente pour une socket pas encore ouverte ; chaque appel se déclenche immédiatement.",

  // React
  reactTitle: 'React',
  reactDescription: 'Context + hooks au-dessus du SDK TypeScript — sans le code répétitif habituel de useEffect/subscribe/unsubscribe.',
  reactAlsoAvailablePrefix: 'Également disponibles :',
  reactAlsoAvailableParenthetical: '(effet seul, sans re-rendu),',
  reactPublishTemplatePrefix: 'Publier un modèle enregistré :',
  reactPublishTemplateMiddle: ', ou de façon autonome via',
  reactPublishTemplateSuffix: '— même appel HTTP que dans l\'onglet API REST, {{variable}} rempli côté serveur.',

  // React Native
  rnTitle: 'React Native',
  rnDescription:
    "Réexporte tel quel les hooks/composants du SDK React (aucun ne touche au DOM) et ajoute une reconnexion consciente de l'AppState — nécessaire car une application RN mise en arrière-plan peut être totalement suspendue par l'OS, contrairement à un onglet de navigateur.",
  rnCaveat:
    "Les hooks de notification (useBackgroundNotifications/usePushSubscription) ne sont volontairement PAS réexportés ici — ils encapsulent des API Notification/PushManager propres au navigateur, qui n'existent pas en React Native. Le push natif nécessite un autre mécanisme (par ex. @react-native-firebase/messaging).",
  rnReexportSuffix: 'sont réexportés sans changement depuis',
  rnReexportEnd: '— voir l\'onglet React.',

  // Python
  pythonTitle: 'Python',
  pythonDescription: 'Client basé sur asyncio.',
  pythonCaveat:
    "Le client WebSocket (client.py) est documenté par ses auteurs comme n'ayant pas encore été testé en conditions réelles — seul le codec de protocole, en pure bibliothèque standard, dispose d'une réelle couverture de tests. Vérifiez sur une connexion réelle avant toute mise en production.",
  pythonPublishTemplatePrefix: 'Publier un modèle enregistré —',
  pythonPublishTemplateMiddle:
    '. Contrairement au client WS ci-dessus, cet appel est testé avec des mocks (une requête HTTP, pas une socket réelle) — voir',
  pythonPublishTemplateSuffix: '.',

  // Rust
  rustTitle: 'Rust',
  rustDescription: 'Client basé sur Tokio.',
  rustCaveat:
    "Ce SDK est documenté par ses auteurs comme n'ayant pas encore été compilé (aucune chaîne d'outils Rust n'était disponible au moment de sa rédaction) — lancez cargo build vous-même et considérez-le comme une première ébauche, pas un artefact validé.",
  rustPublishTemplatePrefix: 'Publier un modèle enregistré —',
  rustPublishTemplateMiddle: "(un appel HTTP, indépendant de la connexion WS ci-dessus). Contrairement au reste de ce SDK,",
  rustPublishTemplateMiddle2: 'et ses',
  rustPublishTemplateSuffix: 'ont réellement été exécutés et passent.',

  // Android
  androidKotlinTitle: 'Android — Kotlin',
  androidKotlinDescription: 'Module de bibliothèque Gradle, basé sur OkHttp. Aucun artefact Maven publié pour l\'instant — à intégrer comme module local.',
  androidKotlinCaveat:
    "Pas encore compilé par ses auteurs (aucun kotlinc/JDK complet disponible au moment de la rédaction) — lancez ./gradlew build test vous-même. Les callbacks se déclenchent sur le propre thread d'OkHttp, pas sur le thread principal Android — pensez à passer sur le thread UI vous-même.",
  androidWatchPrefix: 'Surveillez',
  androidWatchMiddle: 'pour un token invalide ou expiré — sans',
  androidWatchMiddle2: ', le client ne se reconnecte jamais automatiquement après cela. Remplacez',
  androidWatchMiddle3: 'par',
  androidWatchSuffix:
    "pour un renouvellement silencieux — appelé de façon synchrone sur le propre thread d'arrière-plan du client (peut bloquer sans risque le temps de l'appel à votre backend) avant chaque tentative de connexion.",

  androidPublishTemplatePrefix: 'Publier un modèle enregistré — à base de callback comme le reste de ce client, pas une suspend fun :',
  androidPublishTemplateSuffix: '. Passe par HTTP via le même',
  androidPublishTemplateEnd: 'déjà configuré, indépendamment de la connexion WS.',

  androidJavaTitle: 'Android — Java',
  androidJavaDescription: 'Même client, avec une surface adaptée à Java (interfaces SAM, @JvmOverloads).',
  androidJavaAuthPrefix: 'Même logique de renouvellement silencieux avec',
  androidJavaAuthMiddle: 'et',
  androidJavaAuthMiddle2: "qu'en Kotlin ci-dessus — Java n'a pas d'arguments nommés/optionnels, passez donc",
  androidJavaAuthSuffix: 'pour',
  androidJavaAuthEnd: 'et renseignez chaque paramètre explicitement via le README pour l\'exemple complet.',

  androidJavaPublishTemplatePrefix: 'Publier un modèle enregistré —',
  androidJavaPublishTemplateSuffix: '(une surcharge sans la map',
  androidJavaPublishTemplateEnd: 'existe également).',

  // WordPress
  wpServerTitle: 'WordPress — côté serveur (PHP)',
  wpServerDescription:
    "Générez des jetons et publiez depuis des hooks PHP (save_post, une tâche cron, ...). Configurez d'abord Réglages > mio Realtime dans votre admin WP avec l'ID et le secret de ce tenant.",
  wpServerCaveat:
    "Client::publish()/emitEvent() ne découpent pas — un payload de plus de 211 octets UTF-8 lève une exception avant tout appel réseau. Ne renvoyez jamais $secret au navigateur — seul $minted->token doit quitter PHP.",
  wpServerPublishTemplatePrefix: 'Publier un modèle enregistré —',
  wpServerPublishTemplateSuffix:
    '. Même recherche propre au tenant et même remplissage de {{variable}} côté serveur que dans l\'onglet API REST — pas de vérification de taille locale ici, la limite de 211 octets est appliquée côté serveur après interpolation.',

  wpPageTitle: 'WordPress — sur la page',
  wpPageDescription: "Un shortcode affiche un flux qui se met à jour en direct, adossé à une véritable connexion WebSocket dans le navigateur du visiteur.",
  wpPageNotePrefix: 'Un point de départ fonctionnel, pas un composant habillé — stylisez',
  wpPageNoteSuffix: 'vous-même.',

  // Laravel
  laravelTitle: 'Laravel',
  laravelDescription:
    "La même classe PHP Mio\\Realtime\\Client, indépendante de tout framework, qu'utilise WordPress — elle n'appelle elle-même aucune fonction WordPress — câblée dans le conteneur de services de Laravel : un service provider, une façade, et le client HTTP propre à Laravel à la place de wp_remote_post.",
  laravelCaveat:
    "Même chemin de publication en HTTP seul que WordPress — pas de connexion WebSocket persistante, pas de découpage. publish() lève une exception avant tout appel réseau si $payload dépasse 211 octets UTF-8.",
  laravelResolvePrefix: 'Ou résolvez',
  laravelResolveMiddle: 'directement via le conteneur plutôt que via la façade — les deux atteignent le même singleton lié. Voir',
  laravelResolveMiddle2: 'pour comprendre pourquoi ce package dépend de',
  laravelResolveSuffix: '(reliquat de nommage, pas un couplage fonctionnel).',

  laravelPublishTemplatePrefix: "Publier un modèle enregistré — pas encore disponible sur la façade",
  laravelPublishTemplateMiddle: ', résolvez plutôt',
  laravelPublishTemplateMiddle2: 'depuis le conteneur :',
  laravelPublishTemplateSuffix: '.',

  // Embed
  embedScriptTitle: 'mio-embed.js — sans plugin, sans étape de build',
  embedScriptDescription:
    "Pas spécifique à WordPress malgré son emplacement dans sdk-wordpress/assets/js/ — un fichier unique, sans dépendance, à coller dans n'importe quelle page HTML (un bloc HTML personnalisé, un header/footer de thème, le <head> d'un site statique). Ni PHP, ni framework d'aucune sorte.",
  embedScriptCaveat:
    "Fixez la version : @v0.1.9 ci-dessus est un tag git — jsDelivr met agressivement en cache les références taguées, et un futur commit ne peut jamais modifier silencieusement ce qui est déjà intégré sur le site de quelqu'un. N'utilisez jamais @master dans une URL transmise à un tiers.",
  embedScriptNotePrefix:
    "Aucun hébergement à mettre en place — servi directement depuis GitHub via jsDelivr, mis en cache mondialement. Utilise le build",
  embedScriptNoteMiddle: 'minifié avec terser (',
  embedScriptNoteMiddle2: 'dans',
  embedScriptNoteMiddle3: ') déjà commité — le code source',
  embedScriptNoteMiddle4: "brut reste dans le dépôt pour la lecture. Le dossier",
  embedScriptNoteEnd: 'de ce dépôt est un banc de test local fonctionnel pour ce script.',

  embedCustomTitle: 'mio-protocol.js + mio-client.js — construire sa propre logique de page',
  embedCustomDescription:
    "Pour tout ce qui dépasse le flux auto-rendu ci-dessus — UI personnalisée, plusieurs canaux, votre propre formulaire de publication — chargez les deux fichiers que mio-embed.js regroupe et pilotez MioRealtimeClient vous-même.",
  embedCustomNotePrefix: 'Absent de ce CDN :',
  embedCustomNoteSuffix: "— n'a de sens que câblé par le plugin WordPress lui-même.",

  embedBgTitle: 'Notifications en arrière-plan — onglet masqué ou non actif',
  embedBgDescription:
    "Par canal, directement dans un callback subscribe() — API Notification native du navigateur uniquement, sans configuration serveur, sans Service Worker, sans clés VAPID. Même API window.MioEmbedClient si vous utilisez mio-embed.js à la place.",
  embedBgNote1Prefix: 'Vous préférez un seul appel pour tous les canaux abonnés plutôt qu\'un contrôle par canal ?',
  embedBgNote1Suffix: 'câble la même logique sur',
  embedBgNote1End: "du client lui-même.",
  embedBgNote2Prefix:
    "Pour des notifications qui fonctionnent aussi navigateur ou onglet totalement fermé, il faut du vrai Web Push (Service Worker + clés VAPID) — voir l'onglet Web Push de cette page pour la version complète de",
  embedBgNote2Suffix: '.',

  embedVapidTitle: 'mio-vapid-subscription.js — Web Push, sans plugin, sans étape de build',
  embedVapidDescription:
    "Abonne un visiteur à de vrais Web Push (onglet ou navigateur totalement fermé) sans écrire de JS — câble un bouton de votre choix pour demander la permission, s'abonner et enregistrer auprès de votre backend mio. Même famille sans dépendance, à coller directement, que mio-embed.js ci-dessus.",
  embedVapidCaveat:
    "Notification.requestPermission() ne fonctionne qu'à partir d'un geste utilisateur dans pratiquement tous les navigateurs — contrairement au flux en direct ci-dessus, ce fichier n'abonne donc jamais personne au chargement de la page : il attend un clic sur data-button.",
  embedVapidNotePrefix: 'En cas de succès/échec, ceci déclenche',
  embedVapidNoteMiddle: 'et',
  embedVapidNoteSuffix:
    "sur l'élément bouton — écoutez ces évènements pour afficher votre propre retour plutôt que de subir celui de ce fichier. Un Service Worker doit déjà être déployé à data-sw-url (défaut /sw.js) avec des gestionnaires push et notificationclick — voir public/sw.js de cette plateforme pour une implémentation de référence.",
} satisfies typeof en
