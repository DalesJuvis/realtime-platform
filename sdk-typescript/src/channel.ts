/**
 * `channel.ts` — Poignée scoped-à-un-canal, façon socket.io
 * (`socket.on(event, handler)` / `.emit(event, data)`) plutôt que de
 * surcharger `RealtimeClient.on()`/`.emit()` eux-mêmes : ces deux noms
 * sont déjà pris par `TypedEmitter`, pour les évènements de cycle de vie
 * de la connexion (open/close/error/authenticated/message) — un unique
 * `.on()` avec deux significations selon le nombre d'arguments serait un
 * piège classique (`client.on('orders:42', handler)` type-check déjà
 * aujourd'hui à cause de l'index signature de `RealtimeEvents`, sans
 * jamais rien faire), pas une commodité.
 *
 * Aucun changement de protocole ni de frame : un évènement nommé est un
 * `publish()` classique dont le payload est la chaîne JSON
 * `{"event": "...", "data": ...}` — hérite donc gratuitement du
 * découpage en chunks transparent de `publish()`/`subscribe()` pour tout
 * payload JSON qui dépasse un seul frame de 211 octets. Un canal qui
 * reçoit un `publish()` "brut" (une chaîne quelconque, ou d'un autre SDK
 * qui n'utilise pas cette convention) n'en souffre pas : `on()` ignore
 * silencieusement tout payload qui ne correspond pas à cette forme —
 * `subscribe()` reste la voie à utiliser pour voir tout message brut,
 * quelle que soit sa forme.
 */

import type { MessageHandler, RealtimeMessage, Unsubscribe } from "./types.js";

export interface EventEnvelope<T = unknown> {
  event: string;
  data?: T;
}

/** Le sous-ensemble de `RealtimeAdapter` dont `ChannelHandle` a besoin —
 * n'importe quel adaptateur qui a `subscribe`/`publish` peut donc en
 * fournir un, pas seulement `RealtimeClient`. */
export interface ChannelTransport {
  subscribe(channelId: string, handler: MessageHandler): Unsubscribe;
  publish(channelId: string, payload: string): void | Promise<void>;
}

function encodeEnvelope(event: string, data: unknown): string {
  const envelope: EventEnvelope = data === undefined ? { event } : { event, data };
  return JSON.stringify(envelope);
}

/** `null` si `payload` n'est pas cette enveloppe JSON — un `publish()`
 * brut, ou une chaîne quelconque publiée par un autre SDK/canal. */
function tryDecodeEnvelope(payload: string): EventEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "event" in parsed &&
    typeof (parsed as { event: unknown }).event === "string"
  ) {
    return parsed as EventEnvelope;
  }
  return null;
}

/** Poignée renvoyée par `RealtimeClient.channel(channelId)` — voir la
 * doc de ce module pour pourquoi ce n'est pas juste `client.on()`/`.emit()`. */
export class ChannelHandle {
  constructor(
    private readonly transport: ChannelTransport,
    readonly channelId: string,
  ) {}

  /**
   * S'abonne à un évènement nommé sur ce canal — plusieurs `on()` sur des
   * évènements différents du même canal partagent un seul SUB sous-jacent
   * (`RealtimeClient.subscribe()` dédoublonne déjà par canal, un seul
   * frame SUB envoyé quel que soit le nombre de handlers), donc en
   * enregistrer dix ne coûte qu'un seul abonnement réseau. `T` est de
   * confiance de l'appelant, pas vérifié à l'exécution — `data` est
   * exactement ce que l'émetteur a sérialisé en JSON.
   */
  on<T = unknown>(event: string, handler: (data: T, message: RealtimeMessage) => void): Unsubscribe {
    return this.transport.subscribe(this.channelId, (message) => {
      const envelope = tryDecodeEnvelope(message.payload);
      if (envelope && envelope.event === event) {
        handler(envelope.data as T, message);
      }
    });
  }

  /**
   * Publie un évènement nommé avec des données JSON-sérialisables — un
   * `publish()` classique dont le payload encode `{event, data}`.
   * `data` omis (`undefined`) n'apparaît pas du tout dans le JSON —
   * symétrique avec le `T` optionnel côté `on()`.
   */
  emit(event: string, data?: unknown): void {
    void this.transport.publish(this.channelId, encodeEnvelope(event, data));
  }
}
