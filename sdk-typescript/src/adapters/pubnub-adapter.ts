/**
 * `pubnub-adapter.ts` — Gabarit d'adaptateur PubNub.
 *
 * ⚠️ Même réserve honnête que `firebase-adapter.ts` : non compilé, non
 * testé contre le SDK PubNub réel dans cet environnement (pas d'accès
 * réseau pour installer `pubnub` et vérifier l'API exacte de sa version
 * courante). Gabarit de pattern, pas une intégration prête à l'emploi —
 * les méthodes lèvent une erreur explicite tant qu'elles ne sont pas
 * complétées et validées contre un vrai compte PubNub.
 *
 * Dépendance non incluse dans `package.json` du SDK : `npm install pubnub`.
 *
 * ## Choix de mapping
 * PubNub a une notion native de canal pub/sub très proche du moteur
 * maison : `publish()`/`subscribe()` s'y mappent presque un-pour-un.
 * L'UNICAST se modélise naturellement comme une publication sur un canal
 * privé nommé par convention `user-{userId}` (PubNub n'a pas de concept
 * "adresse utilisateur" de premier niveau, mais permet cette convention
 * nativement) — chaque client s'abonnerait alors à son propre canal
 * `user-{sonPropreUserId}` au démarrage, de façon symétrique à
 * l'auto-abonnement fait côté serveur maison à l'AUTH.
 */

import type { MessageHandler, RealtimeAdapter, RealtimeMessage, Unsubscribe } from "../types.js";

export interface PubNubAdapterConfig {
  publishKey: string;
  subscribeKey: string;
  /** Identifiant unique de ce client dans PubNub (`userId` du SDK PubNub v7+). */
  userId: string;
}

export class PubNubAdapter implements RealtimeAdapter {
  constructor(private readonly config: PubNubAdapterConfig) {
    void this.config;
  }

  connect(): void {
    throw new Error(
      "PubNubAdapter.connect() n'est pas implémenté — gabarit non validé, voir l'en-tête de ce fichier.",
    );

    /* import PubNub from "pubnub";

    this.pubnub = new PubNub({
      publishKey: this.config.publishKey,
      subscribeKey: this.config.subscribeKey,
      userId: this.config.userId,
    });
    // S'abonne d'emblée à sa propre boîte privée, symétrique à
    // l'auto-abonnement `user:{sub}` fait côté serveur maison à l'AUTH.
    this.pubnub.subscribe({ channels: [`user-${this.config.userId}`] });
    */
  }

  disconnect(): void {
    throw new Error(
      "PubNubAdapter.disconnect() n'est pas implémenté — gabarit non validé, voir l'en-tête de ce fichier.",
    );

    /* this.pubnub?.unsubscribeAll(); */
  }

  publish(_channelId: string, _payload: string): void {
    throw new Error(
      "PubNubAdapter.publish() n'est pas implémenté — gabarit non validé, voir l'en-tête de ce fichier.",
    );

    /* void this.pubnub?.publish({ channel: _channelId, message: { payload: _payload } }); */
  }

  subscribe(_channelId: string, _handler: MessageHandler): Unsubscribe {
    throw new Error(
      "PubNubAdapter.subscribe() n'est pas implémenté — gabarit non validé, voir l'en-tête de ce fichier.",
    );

    /* const listener = {
      message: (event: { channel: string; message: { payload: string } }) => {
        if (event.channel !== _channelId) return;
        const message: RealtimeMessage = {
          channelId: event.channel,
          payload: event.message.payload,
          receivedAt: Date.now(),
        };
        _handler(message);
      },
    };
    this.pubnub?.addListener(listener);
    this.pubnub?.subscribe({ channels: [_channelId] });
    return () => this.pubnub?.removeListener(listener);
    */
  }

  unicast(userId: string, payload: string): void {
    // Convention documentée en tête de fichier : canal privé `user-{userId}`.
    this.publish(`user-${userId}`, payload);
  }
}
