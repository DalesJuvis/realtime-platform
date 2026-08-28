/**
 * `notifications.ts` — Notifications navigateur, à deux niveaux distincts.
 *
 * **Onglet ouvert, en arrière-plan** (`attachBackgroundNotifications`) :
 * le message arrive normalement via la connexion WS déjà ouverte —
 * aucune infrastructure serveur nécessaire, juste l'API `Notification` du
 * navigateur, affichée quand `document.hidden`/pas le focus. Fonctionne
 * dès aujourd'hui, sans rien d'autre.
 *
 * **Onglet fermé, voire navigateur pas lancé** (`subscribeToPush` +
 * `registerPushServiceWorker`) : nécessite un vrai Service Worker (RFC
 * 8291 Web Push) — sans connexion WS vivante, rien côté client ne peut
 * recevoir quoi que ce soit ; c'est le service de push du navigateur
 * (via l'abonnement créé ici) qui réveille le Service Worker, pas ce SDK.
 * Le serveur doit alors envoyer un Web Push chiffré à cet abonnement —
 * voir `backend/src/modules/push/services/WebPushCrypto.rs` côté
 * plateforme de ce repo. Un navigateur réellement fermé (processus quitté,
 * pas juste l'onglet) ne reçoit rien tant que l'OS/le navigateur ne le
 * réveille pas — hors du contrôle de ce SDK ou du serveur.
 *
 * Isomorphe comme le reste du SDK (`event-emitter.ts`) : aucune référence
 * à `window`/`Notification`/`navigator` au niveau module, uniquement à
 * l'intérieur des fonctions — un import de ce module ne casse rien en
 * Node.js/React Native, seul un *appel* à une fonction inutilisable là-bas
 * lève une erreur explicite.
 */

import type { RealtimeClient } from "./client.js";
import type { RealtimeMessage, Unsubscribe } from "./types.js";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

/** Demande la permission d'afficher des notifications — doit être appelé
 * depuis un geste utilisateur (clic) dans la plupart des navigateurs. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  return Notification.requestPermission();
}

export interface BackgroundNotificationOptions {
  /** N'affiche une notification que pour les messages qui passent ce
   * filtre — par défaut, tous les messages reçus. */
  filter?: (message: RealtimeMessage) => boolean;
  /** Défaut : le nom du canal. */
  title?: (message: RealtimeMessage) => string;
  /** Défaut : `message.payload`. */
  body?: (message: RealtimeMessage) => string;
  icon?: string;
  /** Appelé au clic sur la notification (déjà focus la fenêtre par défaut
   * si elle existe encore). */
  onClick?: (message: RealtimeMessage) => void;
}

/**
 * Affiche une notification `Notification` native pour chaque message reçu
 * par `client` tant que la page est cachée ou sans focus — s'abonne à
 * l'évènement `"message"` du client (tous canaux confondus, avant même le
 * dispatch par canal), donc fonctionne quels que soient les canaux
 * souscrits par ailleurs. Ne demande pas la permission elle-même :
 * appelez `requestNotificationPermission()` avant (typiquement sur un
 * clic utilisateur), sinon les notifications sont silencieusement omises.
 *
 * Retourne une fonction de désinscription.
 */
export function attachBackgroundNotifications(
  client: RealtimeClient,
  options: BackgroundNotificationOptions = {},
): Unsubscribe {
  if (!isNotificationSupported()) return () => {};

  return client.on("message", (message) => {
    if (Notification.permission !== "granted") return;
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    if (options.filter && !options.filter(message)) return;

    const title = options.title ? options.title(message) : message.channelId;
    const body = options.body ? options.body(message) : message.payload;
    const notificationOptions: NotificationOptions = { body };
    if (options.icon !== undefined) notificationOptions.icon = options.icon;
    const notification = new Notification(title, notificationOptions);
    notification.onclick = () => {
      window.focus();
      options.onClick?.(message);
    };
  });
}

/** Enregistre le Service Worker à `scriptUrl` (ex. `"/sw.js"`) — requis
 * avant `subscribeToPush()`. Idempotent : ré-enregistrer une URL déjà
 * active renvoie l'enregistrement existant. */
export async function registerPushServiceWorker(scriptUrl: string): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this environment.");
  }
  return navigator.serviceWorker.register(scriptUrl);
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

/** Forme prête à poster vers un endpoint d'inscription côté serveur (voir
 * `POST /api/v1/push/subscriptions` de ce repo, ou l'équivalent de votre
 * propre backend). */
export interface PushSubscriptionInfo {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

/**
 * S'abonne au Push du navigateur via `registration` (voir
 * `registerPushServiceWorker`) avec la clé publique VAPID du serveur
 * (base64url, 65 octets point non compressé — donnée par votre backend,
 * jamais générée côté client). Idempotent : un abonnement déjà actif avec
 * la même clé est simplement retourné.
 */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  vapidPublicKeyB64Url: string,
): Promise<PushSubscriptionInfo> {
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapidPublicKeyB64Url),
    }));

  return toSubscriptionInfo(subscription);
}

/** Résilie l'abonnement Push actif de `registration`, s'il y en a un. */
export async function unsubscribeFromPush(registration: ServiceWorkerRegistration): Promise<boolean> {
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return false;
  return existing.unsubscribe();
}

function toSubscriptionInfo(subscription: PushSubscription): PushSubscriptionInfo {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!p256dh || !auth) {
    throw new Error("Push subscription is missing p256dh/auth keys — the browser's PushManager returned an incomplete subscription.");
  }
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: arrayBufferToBase64Url(p256dh), auth: arrayBufferToBase64Url(auth) },
  };
}

function base64UrlToUint8Array(b64url: string): Uint8Array<ArrayBuffer> {
  const padded = b64url.padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
