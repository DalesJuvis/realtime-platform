/**
 * `client.ts` — Client du moteur temps réel maison (protocole binaire
 * 256 octets). Implémente `RealtimeAdapter` : le code applicatif qui
 * programme contre cette interface peut être basculé vers un autre
 * backend (`src/adapters/`) sans changement, hormis la ligne de
 * construction (`createRealtimeClient`).
 *
 * Responsabilités : reconnexion automatique (backoff exponentiel +
 * jitter), heartbeat PING périodique, ré-abonnement transparent après
 * reconnexion, multiplexage des messages entrants vers les handlers
 * enregistrés par canal (exact ou motif `orders:*`).
 */

import { Opcode, decodeFrame, encodeFrame, globMatch, type DecodedFrame } from "./protocol.js";
import { ChunkReassembler, DEFAULT_MAX_MESSAGE_BYTES, encodeChunks, parseChunk } from "./chunking.js";
import { TypedEmitter } from "./event-emitter.js";
import { ChannelHandle } from "./channel.js";
import type {
  MessageHandler,
  RealtimeAdapter,
  RealtimeEvents,
  RealtimeMessage,
  Unsubscribe,
} from "./types.js";

/** Valeur numérique de `WebSocket.OPEN` — évite de dépendre du global `WebSocket`
 * pour cette seule constante quand une implémentation custom est injectée. */
const WS_OPEN = 1;

export type RealtimeClientConfig = {
  /**
   * L'URL `ws://`/`wss://.../ws` exacte à joindre — **jamais construite à
   * la main côté appelant** (pas de `host`/`port`/`secure`/`path` ici,
   * volontairement supprimés : un défaut `port: 8080` a longtemps traîné
   * dans ce SDK et était systématiquement faux en production derrière un
   * reverse proxy, où `/ws` est servi sur le même domaine que l'API, sans
   * port du tout). Utilisez `ws_url` tel que renvoyé par
   * `POST /api/v1/auth/tokens` ou `POST /api/v1/portal/tokens` — le
   * serveur le dérive lui-même de la requête de mint, donc rien à deviner
   * ni à garder synchronisé ici (voir `WsUrlService::derive_ws_url` côté
   * backend). Un besoin exotique (proxy custom, tunnel de test) reste
   * un simple `wsUrl` construit à la main — le champ accepte n'importe
   * quelle chaîne `ws://`/`wss://` valide, ce n'est pas un format imposé
   * par le serveur.
   */
  wsUrl: string;
  /** Tenant ID (UUID) — doit correspondre au tenant du jeton `token`. */
  tenantId: string;
  /**
   * Jeton d'authentification émis côté serveur
   * (`auth.rs::AuthManager::issue_token`). Ce SDK ne le génère jamais
   * lui-même : un jeton signé HMAC ne doit être émis que côté serveur,
   * qui seul détient le secret du tenant.
   */
  token: string;
  /** Intervalle entre deux PING, en ms. Doit rester bien en-deçà du
   * timeout de présence serveur (30s par défaut) pour laisser de la
   * marge aux aléas réseau. Défaut : 15000. */
  heartbeatIntervalMs?: number;
  /** Reconnexion automatique sur perte de connexion. Défaut : true. */
  reconnect?: boolean;
  /** Délai de base du backoff exponentiel, en ms. Défaut : 500. */
  reconnectBaseDelayMs?: number;
  /** Plafond du backoff, en ms. Défaut : 15000. */
  reconnectMaxDelayMs?: number;
  /** Garde-fou de taille pour `publish()`/`unicast()` (voir `chunking.ts`)
   * — pas une limite protocolaire, juste un plafond raisonnable contre un
   * appel malencontreux avec un payload énorme. Défaut : 65536 (64 Kio). */
  maxMessageBytes?: number;
  /**
   * Implémentation `WebSocket` à utiliser. Défaut : détection automatique
   * — `globalThis.WebSocket` (navigateurs, React Native, Node 22+), sinon
   * le paquet optionnel `ws` est chargé par le SDK lui-même à la volée
   * (`npm install ws` suffit ; aucun `import "ws"` à écrire côté
   * application). Ce champ ne sert qu'à imposer une implémentation
   * précise (tests, environnement exotique) — le cas courant n'en a pas besoin.
   */
  webSocketImpl?: new (url: string) => WebSocketLike;
};

/**
 * Résout l'implémentation `WebSocket` à utiliser, sans jamais exiger que
 * l'application appelante importe `ws` elle-même : en Node.js (pas de
 * `WebSocket` global avant la v22), ce module est chargé dynamiquement ici.
 * `/* @vite-ignore *\/` empêche les bundlers navigateur (Vite/esbuild) de
 * tenter de résoudre ce chemin au build — il n'est de toute façon jamais
 * atteint côté navigateur, `globalThis.WebSocket` y existe toujours.
 */
async function resolveWebSocketImpl(
  explicit: (new (url: string) => WebSocketLike) | undefined,
): Promise<new (url: string) => WebSocketLike> {
  if (explicit) return explicit;

  const globalImpl = (globalThis as { WebSocket?: unknown }).WebSocket;
  if (globalImpl) return globalImpl as new (url: string) => WebSocketLike;

  try {
    const mod = (await import(/* @vite-ignore */ "ws")) as { default: new (url: string) => WebSocketLike };
    return mod.default;
  } catch {
    throw new Error(
      'Aucune implémentation WebSocket disponible. En Node.js (hors v22+), installez le paquet ' +
        'optionnel `ws` (`npm install ws`) — aucun import à ajouter dans votre code, le SDK le charge lui-même.',
    );
  }
}

/** Sous-ensemble de l'API `WebSocket` réellement utilisé par ce client —
 * permet d'accepter aussi bien le `WebSocket` natif que celui du paquet `ws`. */
export interface WebSocketLike {
  binaryType: string;
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  send(data: Uint8Array): void;
  close(): void;
}

interface ResolvedConfig {
  url: string;
  tenantId: string;
  token: string;
  heartbeatIntervalMs: number;
  reconnect: boolean;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  maxMessageBytes: number;
  webSocketImpl: (new (url: string) => WebSocketLike) | undefined;
}

export class RealtimeClient extends TypedEmitter<RealtimeEvents> implements RealtimeAdapter {
  private readonly config: ResolvedConfig;

  private ws: WebSocketLike | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private closedByUser = true;
  /** Résolu une seule fois (le dynamic `import("ws")` ne doit pas se
   * répéter à chaque reconnexion) puis réutilisé pour toute la durée de vie du client. */
  private wsImplPromise: Promise<new (url: string) => WebSocketLike> | null = null;

  /** Clé = channelId exact ou motif (`orders:*`) → handlers enregistrés. */
  private readonly subscriptions = new Map<string, Set<MessageHandler>>();
  private readonly reassembler = new ChunkReassembler();
  /** `replay()` appelé avant que le socket ne soit ouvert (ex: juste après
   * `connect()`) — mis en attente ici plutôt que de lever, et rejoué une
   * seule fois à l'ouverture (voir `onopen`). Contrairement aux
   * souscriptions, pas rejoué à chaque reconnexion : un replay est une
   * demande ponctuelle, pas un état à maintenir. */
  private readonly pendingReplays: Array<[channelId: string, sinceUnixSeconds: string]> = [];

  constructor(config: RealtimeClientConfig) {
    super();
    this.config = {
      url: config.wsUrl,
      tenantId: config.tenantId,
      token: config.token,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 15_000,
      reconnect: config.reconnect ?? true,
      reconnectBaseDelayMs: config.reconnectBaseDelayMs ?? 500,
      reconnectMaxDelayMs: config.reconnectMaxDelayMs ?? 15_000,
      maxMessageBytes: config.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
      webSocketImpl: config.webSocketImpl,
    };
  }

  connect(): void {
    this.closedByUser = false;
    void this.openSocket();
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  /**
   * `payload` au-delà des 211 octets d'un seul frame est automatiquement
   * découpé en plusieurs frames PUB successifs (voir `chunking.ts`) et
   * réassemblé côté récepteur avant d'atteindre les handlers `subscribe` —
   * transparent des deux côtés, rien à changer dans le code applicatif.
   */
  publish(channelId: string, payload: string): void {
    for (const chunk of encodeChunks(payload, this.config.maxMessageBytes)) {
      this.send(Opcode.Publish, channelId, chunk);
    }
  }

  /** Même découpage transparent que `publish()` — voir sa doc. */
  unicast(userId: string, payload: string): void {
    for (const chunk of encodeChunks(payload, this.config.maxMessageBytes)) {
      this.send(Opcode.Unicast, userId, chunk);
    }
  }

  /**
   * Demande le rattrapage de l'historique d'un canal depuis
   * `sinceUnixSeconds` (0 = tout l'historique disponible côté serveur).
   * Les frames de rattrapage arrivent comme des messages normaux, routés
   * vers les handlers de `channelId` déjà enregistrés — pas de callback
   * séparé. Non supporté sur un motif (`orders:*`) : le serveur les
   * rejette silencieusement (cf. `main.rs`, bras `Opcode::Replay`).
   * Appelé avant que la connexion ne soit ouverte (ex: juste après
   * `connect()`) — mis en attente et rejoué une seule fois à l'ouverture,
   * plutôt que de lever une exception.
   */
  replay(channelId: string, sinceUnixSeconds = 0): void {
    if (this.ws?.readyState === WS_OPEN) {
      this.send(Opcode.Replay, channelId, String(sinceUnixSeconds));
    } else {
      this.pendingReplays.push([channelId, String(sinceUnixSeconds)]);
    }
  }

  /**
   * S'abonne à un canal exact ou à un motif (`orders:*`). Si la connexion
   * est ouverte, le SUB est envoyé immédiatement ; sinon il est différé
   * et rejoué automatiquement à la prochaine connexion réussie
   * (`resubscribeAll`), y compris après une reconnexion.
   */
  subscribe(channelId: string, handler: MessageHandler): Unsubscribe {
    let handlers = this.subscriptions.get(channelId);
    const isNewChannel = !handlers;
    if (!handlers) {
      handlers = new Set();
      this.subscriptions.set(channelId, handlers);
    }
    handlers.add(handler);

    if (isNewChannel && this.ws?.readyState === WS_OPEN) {
      this.send(Opcode.Subscribe, channelId, "");
    }

    return () => this.unsubscribeHandler(channelId, handler);
  }

  /**
   * Se désabonne de `channelId` pour ce `handler` uniquement. Une fois le
   * dernier handler retiré pour ce canal, envoie un vrai frame UNSUB au
   * serveur (Opcode `0x09`) — contrairement aux versions précédentes de ce
   * SDK, ce n'est plus un simple silence côté client : la tâche de relais
   * correspondante côté serveur est réellement arrêtée
   * (`main.rs::process_frame_inner`, bras `Opcode::Unsub`).
   */
  /**
   * Poignée scoped-à-un-canal, façon socket.io (`.on(event, handler)` /
   * `.emit(event, data)`) — voir `channel.ts` pour pourquoi ce n'est pas
   * juste `this.on()`/`.emit()` (déjà pris par `TypedEmitter`, pour un
   * axe complètement différent : le cycle de vie de la connexion, pas les
   * messages applicatifs d'un canal). Chaque appel construit une nouvelle
   * poignée légère — rien à mettre en cache, `ChannelHandle` ne porte
   * aucun état propre au-delà de `channelId`.
   */
  channel(channelId: string): ChannelHandle {
    return new ChannelHandle(this, channelId);
  }

  private unsubscribeHandler(channelId: string, handler: MessageHandler): void {
    const handlers = this.subscriptions.get(channelId);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) {
      this.subscriptions.delete(channelId);
      if (this.ws?.readyState === WS_OPEN) {
        this.send(Opcode.Unsub, channelId, "");
      }
    }
  }

  private async openSocket(): Promise<void> {
    if (!this.wsImplPromise) {
      this.wsImplPromise = resolveWebSocketImpl(this.config.webSocketImpl);
    }

    let Impl: new (url: string) => WebSocketLike;
    try {
      Impl = await this.wsImplPromise;
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return;
    }

    // The user may have called `disconnect()` while the (async) impl
    // resolution above was still in flight — don't open a socket they
    // already asked to not have.
    if (this.closedByUser) return;

    const ws = new Impl(this.config.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      // AUTH envoyé en premier, systématiquement, avant tout SUB/PUB.
      this.send(Opcode.Auth, "", this.config.token);
      this.resubscribeAll();
      this.flushPendingReplays();
      this.startHeartbeat();
      this.emit("open", undefined);
      // Optimiste — cf. doc de `RealtimeEvents.authenticated` dans types.ts.
      this.emit("authenticated", undefined);
    };

    ws.onmessage = (event: { data: unknown }) => {
      let raw: Uint8Array;
      if (event.data instanceof ArrayBuffer) {
        raw = new Uint8Array(event.data);
      } else if (event.data instanceof Uint8Array) {
        raw = event.data;
      } else {
        this.emit("error", new Error("Frame reçu dans un format inattendu (ni ArrayBuffer, ni Uint8Array)"));
        return;
      }

      let frame: DecodedFrame;
      try {
        frame = decodeFrame(raw);
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.dispatch(frame);
    };

    ws.onerror = () => {
      this.emit("error", new Error("Erreur de connexion WebSocket"));
    };

    ws.onclose = (event) => {
      this.stopHeartbeat();
      this.ws = null;
      this.emit("close", { code: event.code, reason: event.reason });
      if (!this.closedByUser && this.config.reconnect) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      this.config.reconnectBaseDelayMs * 2 ** this.reconnectAttempt,
      this.config.reconnectMaxDelayMs,
    );
    // Jitter ±20% : évite un effet troupeau si de nombreux clients se
    // reconnectent simultanément (ex: coupure réseau côté infra serveur).
    const jitter = delay * (0.8 + Math.random() * 0.4);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.closedByUser) void this.openSocket();
    }, jitter);
  }

  private resubscribeAll(): void {
    for (const channelId of this.subscriptions.keys()) {
      this.send(Opcode.Subscribe, channelId, "");
    }
  }

  private flushPendingReplays(): void {
    const pending = this.pendingReplays.splice(0, this.pendingReplays.length);
    for (const [channelId, sinceUnixSeconds] of pending) {
      this.send(Opcode.Replay, channelId, sinceUnixSeconds);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WS_OPEN) {
        this.send(Opcode.Ping, "", "");
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private dispatch(frame: DecodedFrame): void {
    let payload = frame.payload;

    const chunkHeader = parseChunk(payload);
    if (chunkHeader) {
      const reassembled = this.reassembler.feed(chunkHeader);
      // Réassemblage encore en cours (d'autres chunks à venir) : rien à
      // émettre pour ce frame-là — pas de handler averti d'un fragment partiel.
      if (reassembled === null) return;
      payload = reassembled;
    }

    const message: RealtimeMessage = {
      channelId: frame.channelId,
      payload,
      tenantId: frame.tenantId,
      receivedAt: Date.now(),
    };

    this.emit("message", message);

    const exactHandlers = this.subscriptions.get(frame.channelId);
    exactHandlers?.forEach((h) => h(message));

    // Correspondance par motif : le serveur ne renvoie que le canal
    // concret réel, jamais le motif d'origine — on refait le matching
    // glob côté client pour chaque motif actif.
    for (const [key, handlers] of this.subscriptions) {
      if (key.includes("*") && globMatch(key, frame.channelId)) {
        handlers.forEach((h) => h(message));
      }
    }
  }

  private send(opcode: Opcode, channelId: string, payload: string): void {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      throw new Error("Impossible d'envoyer : connexion WebSocket non ouverte");
    }
    this.ws.send(encodeFrame({ opcode, tenantId: this.config.tenantId, channelId, payload }));
  }
}
