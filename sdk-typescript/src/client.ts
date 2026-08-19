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
import { TypedEmitter } from "./event-emitter.js";
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

export interface RealtimeClientConfig {
  /** URL du endpoint WebSocket, ex: `wss://realtime.example.com/ws`. */
  url: string;
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
  /**
   * Implémentation `WebSocket` à utiliser. Défaut : `globalThis.WebSocket`
   * (disponible nativement dans les navigateurs et React Native). En
   * Node.js (hors v22+ expérimental), fournissez la classe du paquet
   * `ws` : `new RealtimeClient({ ..., webSocketImpl: WebSocket })` après
   * `import WebSocket from "ws"`.
   */
  webSocketImpl?: new (url: string) => WebSocketLike;
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

export class RealtimeClient extends TypedEmitter<RealtimeEvents> implements RealtimeAdapter {
  private readonly config: Required<Omit<RealtimeClientConfig, "webSocketImpl">> &
    Pick<RealtimeClientConfig, "webSocketImpl">;

  private ws: WebSocketLike | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private closedByUser = true;

  /** Clé = channelId exact ou motif (`orders:*`) → handlers enregistrés. */
  private readonly subscriptions = new Map<string, Set<MessageHandler>>();

  constructor(config: RealtimeClientConfig) {
    super();
    this.config = {
      heartbeatIntervalMs: 15_000,
      reconnect: true,
      reconnectBaseDelayMs: 500,
      reconnectMaxDelayMs: 15_000,
      ...config,
    };
  }

  connect(): void {
    this.closedByUser = false;
    this.openSocket();
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  publish(channelId: string, payload: string): void {
    this.send(Opcode.Publish, channelId, payload);
  }

  unicast(userId: string, payload: string): void {
    this.send(Opcode.Unicast, userId, payload);
  }

  /**
   * Demande le rattrapage de l'historique d'un canal depuis
   * `sinceUnixSeconds` (0 = tout l'historique disponible côté serveur).
   * Les frames de rattrapage arrivent comme des messages normaux, routés
   * vers les handlers de `channelId` déjà enregistrés — pas de callback
   * séparé. Non supporté sur un motif (`orders:*`) : le serveur les
   * rejette silencieusement (cf. `main.rs`, bras `Opcode::Replay`).
   */
  replay(channelId: string, sinceUnixSeconds = 0): void {
    this.send(Opcode.Replay, channelId, String(sinceUnixSeconds));
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

  private openSocket(): void {
    const Impl = this.config.webSocketImpl ?? (globalThis as { WebSocket?: unknown }).WebSocket;
    if (!Impl) {
      throw new Error(
        "Aucune implémentation WebSocket disponible. En environnement navigateur/React Native, " +
          "elle devrait être globale ; en Node.js, fournissez `webSocketImpl` (ex: le paquet `ws`).",
      );
    }

    const ws = new (Impl as new (url: string) => WebSocketLike)(this.config.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      // AUTH envoyé en premier, systématiquement, avant tout SUB/PUB.
      this.send(Opcode.Auth, "", this.config.token);
      this.resubscribeAll();
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
      if (!this.closedByUser) this.openSocket();
    }, jitter);
  }

  private resubscribeAll(): void {
    for (const channelId of this.subscriptions.keys()) {
      this.send(Opcode.Subscribe, channelId, "");
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
    const message: RealtimeMessage = {
      channelId: frame.channelId,
      payload: frame.payload,
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
