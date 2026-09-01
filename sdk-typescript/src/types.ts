/**
 * `types.ts` — Contrat public du SDK, indépendant du transport.
 *
 * Le code applicatif ne doit jamais dépendre directement de `protocol.ts`
 * (détails du frame binaire 256 octets) : il programme contre
 * `RealtimeAdapter` et `RealtimeMessage`, qui n'exposent que des concepts
 * métier (canal, payload texte, tenant). C'est ce découplage qui permet
 * de permuter d'implémentation (moteur maison, Firebase, PubNub) en
 * changeant une seule ligne — l'usine `createRealtimeClient()` — sans
 * toucher au reste de l'application.
 */

/** Un message reçu, indépendant du transport sous-jacent. */
export interface RealtimeMessage {
  /** Canal concret sur lequel le message a été effectivement publié. */
  channelId: string;
  /** Contenu texte du message. */
  payload: string;
  /** Identifiant du tenant, si l'adaptateur sous-jacent en a la notion. */
  tenantId?: string;
  /**
   * Timestamp de réception côté client (ms epoch). Fourni par le SDK,
   * pas par le serveur — le protocole actuel n'embarque pas d'horodatage
   * dans le frame lui-même (cf. `state.rs::HistoryBuffer`, qui horodate
   * côté serveur au moment de la publication, pas dans le frame).
   */
  receivedAt: number;
}

/** Un handler de message, retourne une fonction de désinscription. */
export type MessageHandler = (message: RealtimeMessage) => void;
export type Unsubscribe = () => void;

/** Import différé uniquement pour le type — `channel.ts` n'a besoin
 * d'aucun autre export de ce module, et l'inverse (`channel.ts` important
 * de `types.ts`) est déjà le sens réel de la dépendance. */
import type { ChannelHandle } from "./channel.js";

/**
 * Contrat commun à toute implémentation de transport temps réel.
 *
 * `RealtimeClient` (moteur maison, protocole 256 octets) l'implémente
 * intégralement. Les adaptateurs Firebase/PubNub (`src/adapters/`)
 * l'implémentent aussi, avec des degrés de fidélité différents selon les
 * primitives natives de chaque plateforme (cf. leurs limitations
 * documentées individuellement).
 */
export interface RealtimeAdapter {
  connect(): void | Promise<void>;
  disconnect(): void | Promise<void>;

  /** Publie `payload` sur `channelId`. */
  publish(channelId: string, payload: string): void | Promise<void>;

  /**
   * Publie un template sauvegardé (tenant-portal → Templates) par son id,
   * `{{variable}}` remplies côté serveur — voir `RealtimeClient.publishTemplate`.
   * Optionnel dans l'interface comme `unicast`/`channel` ci-dessous : c'est
   * une notion propre au moteur maison (templates stockés côté Portal),
   * sans équivalent chez PubNub/Firebase — leurs adaptateurs ne
   * l'implémentent donc pas.
   */
  publishTemplate?(channelId: string, templateId: string, variables?: Record<string, string>): Promise<void>;

  /**
   * S'abonne à `channelId` (canal exact, ou motif `orders:*` si
   * l'adaptateur le supporte — cf. sa documentation individuelle).
   * Retourne une fonction à appeler pour se désinscrire.
   */
  subscribe(channelId: string, handler: MessageHandler): Unsubscribe;

  /**
   * Envoi direct à un utilisateur, sans passer par un nom de canal
   * explicite. Optionnel dans l'interface : tous les backends n'ont pas
   * une primitive native d'adressage utilisateur (PubNub s'en approche
   * via ses canaux privés `user_id`, Firebase Cloud Messaging via son
   * `token` d'appareil — les deux sont donc émulables, mais pas
   * strictement équivalents à l'UNICAST serveur natif).
   */
  unicast?(userId: string, payload: string): void | Promise<void>;

  /**
   * Poignée scoped-à-un-canal façon socket.io (`.on(event, handler)` /
   * `.emit(event, data)`) — voir `channel.ts`. Optionnel dans l'interface
   * comme `unicast` ci-dessus : `ChannelHandle` n'a besoin que de
   * `subscribe`/`publish`, donc rien n'empêche un futur adaptateur de
   * l'implémenter, mais les adaptateurs Firebase/PubNub actuels (gabarits
   * non validés, voir leurs propres en-têtes) ne le font pas encore.
   */
  channel?(channelId: string): ChannelHandle;
}

/** Évènements émis par `RealtimeClient` (spécifique au moteur maison). */
export interface RealtimeEvents {
  // Signature d'index requise pour satisfaire la contrainte générique
  // `Record<string, unknown>` de `TypedEmitter` — n'affaiblit pas le
  // typage des évènements connus ci-dessous, qui restent vérifiés
  // individuellement à chaque appel de `on`/`emit`.
  [event: string]: unknown;

  open: undefined;
  close: { code: number; reason: string };
  error: Error;
  /**
   * Émis juste après l'envoi du frame AUTH. Optimiste : le protocole
   * actuel n'a pas d'opcode d'accusé de réception explicite — un échec
   * d'authentification se traduit par un `close` (immédiatement suivi de
   * `authFailed`, voir ci-dessous), pas par un rejet directement associé à
   * ce AUTH.
   */
  authenticated: undefined;
  /**
   * Émis juste après `close` quand la fermeture vient précisément d'un
   * AUTH rejeté (jeton invalide ou expiré — `WsController.rs` envoie un
   * code de fermeture WS dédié, `4001`, pour ce cas précis, distinct de
   * toute autre raison de déconnexion).
   *
   * Sans `config.getToken` : le client **n'essaie jamais de se reconnecter
   * automatiquement** dans ce cas précis, même avec `reconnect: true` —
   * retenter avec le même jeton que le serveur vient de rejeter échouerait
   * à nouveau, indéfiniment et silencieusement. Réagissez ici (ex :
   * afficher "session expirée", miner un jeton côté serveur puis
   * reconstruire un `RealtimeClient` avec) plutôt que de compter sur un
   * `close`/reconnexion générique pour détecter ce cas.
   *
   * Avec `config.getToken` configuré : ce n'est plus nécessaire — le
   * client rappelle `getToken()` automatiquement avant la prochaine
   * tentative et se reconnecte avec le jeton frais tout seul. `authFailed`
   * reste émis (utile pour un indicateur "renouvellement…" par exemple),
   * mais rien à faire pour que la connexion reprenne.
   */
  authFailed: { code: number; reason: string };
  /** Tout frame reçu, avant dispatch vers les handlers de souscription. */
  message: RealtimeMessage;
}
