/**
 * `notifications.ts` — Hooks React autour des deux niveaux de
 * `@mio/realtime-sdk`'s `notifications.ts` : notifications d'onglet
 * (arrière-plan, navigateur ouvert) et abonnement Web Push (navigateur
 * fermé — voir la doc de tête de ce module côté SDK core pour le détail
 * de ce que chacun garantit ou pas).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  attachBackgroundNotifications,
  isNotificationSupported,
  registerPushServiceWorker,
  registerWebPushSubscription,
  requestNotificationPermission,
  subscribeToPush,
  unregisterWebPushSubscription,
  unsubscribeFromPush,
  type BackgroundNotificationOptions,
  type PushSubscriptionInfo,
  type WebPushRegistrationOptions,
} from "@mio/realtime-sdk";
import { useRealtimeContext } from "./RealtimeContext.js";

/**
 * Affiche une notification navigateur pour chaque message reçu tant que
 * la page est cachée/sans focus — voir `attachBackgroundNotifications`
 * côté SDK core. `options` n'a pas besoin d'être mémoïsé : seule son
 * identité de référence importe pour la ré-souscription, donc un objet
 * littéral recréé à chaque render fonctionne (juste une désinscription +
 * réinscription de plus par render, sans effet observable).
 */
export function useBackgroundNotifications(options: BackgroundNotificationOptions = {}): void {
  const { client } = useRealtimeContext();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    return attachBackgroundNotifications(client, {
      filter: (m) => optionsRef.current.filter?.(m) ?? true,
      ...(optionsRef.current.title && { title: (m) => optionsRef.current.title!(m) }),
      ...(optionsRef.current.body && { body: (m) => optionsRef.current.body!(m) }),
      ...(optionsRef.current.icon !== undefined && { icon: optionsRef.current.icon }),
      onClick: (m) => optionsRef.current.onClick?.(m),
    });
  }, [client]);
}

export type PushSubscriptionStatus = "idle" | "subscribing" | "subscribed" | "unsubscribing" | "error";

export interface UsePushSubscriptionResult {
  status: PushSubscriptionStatus;
  subscription: PushSubscriptionInfo | null;
  error: Error | null;
  /** Demande la permission (si besoin), enregistre le service worker à
   * `serviceWorkerUrl`, puis s'abonne au Push avec `vapidPublicKey`. */
  subscribe: () => Promise<PushSubscriptionInfo | null>;
  unsubscribe: () => Promise<void>;
  isSupported: boolean;
}

/**
 * Gère le cycle de vie complet d'un abonnement Web Push d'un composant :
 * état de chargement, résultat, erreurs. Ne poste rien vers un backend —
 * `subscribe()` résout avec le `PushSubscriptionInfo` (`{ endpoint, keys
 * }`) à envoyer vous-même à votre route d'inscription (voir `POST
 * /api/v1/push/subscriptions` de ce repo pour un exemple de serveur).
 *
 * Bas niveau, délibérément : pour poster vers *ce* backend (mio) en un
 * seul appel, `useWebPushRegistration` ci-dessous fait exactement ça.
 * Restez sur celui-ci si vous postez vers votre propre backend, avec sa
 * propre forme de requête.
 */
export function usePushSubscription(serviceWorkerUrl: string, vapidPublicKey: string): UsePushSubscriptionResult {
  const [status, setStatus] = useState<PushSubscriptionStatus>("idle");
  const [subscription, setSubscription] = useState<PushSubscriptionInfo | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const subscribe = useCallback(async (): Promise<PushSubscriptionInfo | null> => {
    setStatus("subscribing");
    setError(null);
    try {
      const permission = await requestNotificationPermission();
      if (permission !== "granted") {
        throw new Error(`Notification permission was ${permission}, not "granted".`);
      }
      const registration = await registerPushServiceWorker(serviceWorkerUrl);
      const info = await subscribeToPush(registration, vapidPublicKey);
      setSubscription(info);
      setStatus("subscribed");
      return info;
    } catch (err) {
      const asError = err instanceof Error ? err : new Error(String(err));
      setError(asError);
      setStatus("error");
      return null;
    }
  }, [serviceWorkerUrl, vapidPublicKey]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    setStatus("unsubscribing");
    try {
      const registration = await registerPushServiceWorker(serviceWorkerUrl);
      await unsubscribeFromPush(registration);
      setSubscription(null);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus("error");
    }
  }, [serviceWorkerUrl]);

  return { status, subscription, error, subscribe, unsubscribe, isSupported: isNotificationSupported() };
}

export type WebPushRegistrationStatus = "idle" | "subscribing" | "subscribed" | "unsubscribing" | "error";

export interface UseWebPushRegistrationResult {
  status: WebPushRegistrationStatus;
  subscription: PushSubscriptionInfo | null;
  error: Error | null;
  /** Demande la permission, enregistre le service worker, s'abonne, PUIS
   * inscrit l'abonnement auprès de ce backend mio — un seul appel, voir
   * `registerWebPushSubscription` côté SDK core pour le détail. */
  subscribe: () => Promise<PushSubscriptionInfo | null>;
  unsubscribe: () => Promise<void>;
  isSupported: boolean;
}

/**
 * Version "backend inclus" de `usePushSubscription` — `subscribe()`
 * inscrit directement l'abonnement auprès de *ce* backend mio
 * (`apiBaseUrl`/`token`/`tenantId`/`vapidPublicKey` en `options`, mêmes
 * champs que `registerWebPushSubscription` côté SDK core), pas
 * seulement côté navigateur. `options` n'a pas besoin d'être mémoïsé
 * (même raison que `useBackgroundNotifications` ci-dessus : une
 * référence à jour dans un `ref`, jamais dans les dépendances de
 * `useCallback`, pour ne pas recréer `subscribe`/`unsubscribe` à
 * chaque rendu juste parce qu'un objet littéral a une nouvelle identité).
 */
export function useWebPushRegistration(options: WebPushRegistrationOptions): UseWebPushRegistrationResult {
  const [status, setStatus] = useState<WebPushRegistrationStatus>("idle");
  const [subscription, setSubscription] = useState<PushSubscriptionInfo | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const subscribe = useCallback(async (): Promise<PushSubscriptionInfo | null> => {
    setStatus("subscribing");
    setError(null);
    try {
      const result = await registerWebPushSubscription(optionsRef.current);
      setSubscription(result.subscription);
      setStatus("subscribed");
      return result.subscription;
    } catch (err) {
      const asError = err instanceof Error ? err : new Error(String(err));
      setError(asError);
      setStatus("error");
      return null;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    setStatus("unsubscribing");
    setError(null);
    try {
      await unregisterWebPushSubscription(optionsRef.current);
      setSubscription(null);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus("error");
    }
  }, []);

  return { status, subscription, error, subscribe, unsubscribe, isSupported: isNotificationSupported() };
}
