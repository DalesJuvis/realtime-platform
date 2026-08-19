/**
 * `firebase-adapter.ts` — Gabarit d'adaptateur Firebase Realtime Database.
 *
 * ⚠️ Honnêteté avant tout : ce fichier n'a **pas** pu être compilé ni
 * testé contre un vrai projet Firebase dans cet environnement (pas
 * d'accès réseau ici pour installer `firebase` et vérifier l'API exacte
 * de sa version courante). Il documente le *pattern* d'implémentation
 * d'un `RealtimeAdapter` alternatif — pas une intégration prête pour la
 * production. Les méthodes lèvent délibérément une erreur explicite tant
 * qu'elles n'ont pas été complétées et validées, plutôt que de laisser
 * croire à une implémentation fonctionnelle.
 *
 * Dépendance non incluse dans `package.json` du SDK (n'impose pas son
 * installation à qui n'en a pas besoin) : `npm install firebase`.
 *
 * ## Choix de mapping
 * Firebase Realtime Database n'a pas de primitive "pub/sub éphémère"
 * comme un canal WebSocket : on modélise un canal comme un nœud RTDB
 * sous lequel chaque publication est un nouvel enfant (`push()`), et un
 * abonnement comme un listener `onChildAdded`. Contrairement au moteur
 * maison, les messages restent donc persistés indéfiniment dans RTDB
 * sauf purge applicative explicite — comportement différent du ring
 * buffer borné de `HistoryBuffer` côté serveur, à garder en tête si vous
 * basculez un tenant existant vers cet adaptateur.
 *
 * `unicast()` n'est pas implémenté ici : Firebase n'a pas d'équivalent
 * direct à l'UNICAST du protocole maison en dehors de FCM (notifications
 * push, pas un canal temps réel bidirectionnel) — à traiter séparément
 * si nécessaire plutôt que de forcer une fausse équivalence.
 */

import type { MessageHandler, RealtimeAdapter, RealtimeMessage, Unsubscribe } from "../types.js";

export interface FirebaseAdapterConfig {
  /** Config standard du SDK modulaire `firebase/app` (`apiKey`, `databaseURL`, ...). */
  firebaseConfig: Record<string, unknown>;
  /** Préfixe de chemin RTDB sous lequel les canaux sont créés, ex: `tenants/{tenantId}/channels`. */
  basePath: string;
}

export class FirebaseAdapter implements RealtimeAdapter {
  constructor(private readonly config: FirebaseAdapterConfig) {
    void this.config; // évite l'avertissement "unused" tant que le corps ci-dessous reste en commentaire
  }

  connect(): void {
    throw new Error(
      "FirebaseAdapter.connect() n'est pas implémenté — gabarit non validé, voir l'en-tête de ce fichier.",
    );

    /* Implémentation indicative, à décommenter et ajuster après
       `npm install firebase` :

    import { initializeApp } from "firebase/app";
    import { getDatabase } from "firebase/database";

    this.app = initializeApp(this.config.firebaseConfig);
    this.db = getDatabase(this.app);
    */
  }

  disconnect(): void {
    throw new Error(
      "FirebaseAdapter.disconnect() n'est pas implémenté — gabarit non validé, voir l'en-tête de ce fichier.",
    );

    /* import { goOffline } from "firebase/database";
       if (this.db) goOffline(this.db); */
  }

  publish(_channelId: string, _payload: string): void {
    throw new Error(
      "FirebaseAdapter.publish() n'est pas implémenté — gabarit non validé, voir l'en-tête de ce fichier.",
    );

    /* import { ref, push, serverTimestamp } from "firebase/database";

    const channelRef = ref(this.db, `${this.config.basePath}/${_channelId}`);
    push(channelRef, { payload: _payload, publishedAt: serverTimestamp() });
    */
  }

  subscribe(_channelId: string, _handler: MessageHandler): Unsubscribe {
    throw new Error(
      "FirebaseAdapter.subscribe() n'est pas implémenté — gabarit non validé, voir l'en-tête de ce fichier.",
    );

    /* import { ref, onChildAdded, off, type DataSnapshot } from "firebase/database";

    const channelRef = ref(this.db, `${this.config.basePath}/${_channelId}`);
    const listener = (snapshot: DataSnapshot) => {
      const data = snapshot.val() as { payload: string };
      const message: RealtimeMessage = {
        channelId: _channelId,
        payload: data.payload,
        receivedAt: Date.now(),
      };
      _handler(message);
    };
    onChildAdded(channelRef, listener);
    return () => off(channelRef, "child_added", listener);
    */
  }

  // unicast() volontairement absent : cf. note "Choix de mapping" en tête de fichier.
}
