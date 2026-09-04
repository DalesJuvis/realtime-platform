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
 * Affiche une notification `Notification` native pour `message`, si la
 * page est cachée ou sans focus (sinon no-op : ne double pas ce que
 * l'utilisateur voit déjà à l'écran) — la même logique qu'utilise
 * `attachBackgroundNotifications` en interne, mais appelable directement
 * depuis n'importe quel handler (le callback de `subscribe()`, par
 * exemple), pas seulement depuis l'évènement `"message"` du client. Ne
 * demande pas la permission elle-même : appelez
 * `requestNotificationPermission()` avant (typiquement sur un clic
 * utilisateur), sinon cette fonction ne fait rien silencieusement.
 */
export function showBackgroundNotification(
  message: RealtimeMessage,
  options: BackgroundNotificationOptions = {},
): void {
  if (!isNotificationSupported()) return;
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
}

/**
 * Affiche une notification `Notification` native pour chaque message reçu
 * par `client` tant que la page est cachée ou sans focus — s'abonne à
 * l'évènement `"message"` du client (tous canaux confondus, avant même le
 * dispatch par canal), donc fonctionne quels que soient les canaux
 * souscrits par ailleurs, sans avoir à appeler `showBackgroundNotification`
 * vous-même dans chaque `subscribe()`. Ne demande pas la permission
 * elle-même : appelez `requestNotificationPermission()` avant (typiquement
 * sur un clic utilisateur), sinon les notifications sont silencieusement
 * omises.
 *
 * Retourne une fonction de désinscription.
 */
export function attachBackgroundNotifications(
  client: RealtimeClient,
  options: BackgroundNotificationOptions = {},
): Unsubscribe {
  if (!isNotificationSupported()) return () => {};
  return client.on("message", (message) => showBackgroundNotification(message, options));
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

/**
 * Devine un libellé humainement lisible ("Chrome sur Windows", "Safari sur
 * iPhone") à partir de `navigator.userAgent` — pratique pour distinguer les
 * appareils d'un même utilisateur ayant plusieurs abonnements Push actifs
 * (un téléphone, un navigateur de bureau, etc.), chacun identifié par son
 * propre `endpoint` côté serveur (voir `PushSubscriptionInfo`). Pas de
 * bibliothèque de détection : ceci n'a besoin d'être correct que pour un
 * humain qui parcourt une liste d'appareils, pas pour une vraie détection
 * de plateforme — une supposition fausse est sans conséquence, le libellé
 * n'est jamais utilisé pour du routage ou une décision de sécurité.
 *
 * Aucune valeur renvoyée n'est envoyée automatiquement au serveur : passez
 * le résultat vous-même dans le corps de votre requête d'inscription (le
 * champ optionnel `device_label` de `POST /api/v1/push/subscriptions`).
 */
export function guessDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;

  const os = (() => {
    if (/iPhone/.test(ua)) return "iPhone";
    if (/iPad/.test(ua)) return "iPad";
    if (/Android/.test(ua)) return "Android";
    if (/Mac OS X/.test(ua)) return "Mac";
    if (/Windows/.test(ua)) return "Windows";
    if (/Linux/.test(ua)) return "Linux";
    return null;
  })();

  const browser = (() => {
    if (/Edg\//.test(ua)) return "Edge";
    if (/OPR\//.test(ua)) return "Opera";
    // Le user-agent de Chrome contient aussi le jeton de Safari, d'où l'ordre de test.
    if (/Chrome\//.test(ua)) return "Chrome";
    if (/CriOS\//.test(ua)) return "Chrome";
    if (/FxiOS\//.test(ua)) return "Firefox";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Safari\//.test(ua)) return "Safari";
    return null;
  })();

  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

/**
 * Propriétés d'un appel à `registerWebPushSubscription()` — tout ce dont
 * l'appelant a besoin est passé ici, rien n'est codé en dur : aucun champ
 * de configuration global, aucune variable de module. Un script d'un
 * site tiers peut donc appeler cette fonction directement, avec ses
 * propres identifiants, sans dépendre d'un état déjà initialisé ailleurs.
 */
export interface WebPushRegistrationOptions {
  /** URL de base de votre instance mio, sans slash final
   * (ex. `"https://mio.example.com"`). */
  apiBaseUrl: string;
  /** Jeton client (`Authorization: Bearer`) — jamais le secret du tenant.
   * À miner côté serveur via `POST /api/v1/auth/tokens` (ou l'équivalent
   * authentifié par session portail), jamais dans ce script. */
  token: string;
  tenantId: string;
  /** Clé publique VAPID (base64url, point P-256 non compressé 65 octets)
   * — visible sur la page Overview/Settings de votre instance mio. */
  vapidPublicKey: string;
  /** Canaux/motifs que cet abonnement veut recevoir hors ligne — même
   * syntaxe glob `orders:*` que `SUB`. Défaut : `["*"]` (tous les canaux). */
  channels?: string[];
  /** URL du Service Worker, déjà déployé sur votre propre site — cette
   * fonction l'enregistre via `registerPushServiceWorker`, elle n'en crée
   * pas un pour vous. Défaut : `"/sw.js"`. */
  swUrl?: string;
  /** Libellé humainement lisible pour distinguer cet appareil dans une
   * liste d'abonnements côté serveur. Défaut : `guessDeviceLabel()`. */
  deviceLabel?: string;
}

export interface WebPushRegistrationResult {
  subscription: PushSubscriptionInfo;
  registered: true;
}

/**
 * "Étend" `subscribeToPush()` en y ajoutant l'étape qui manque pour que
 * l'abonnement serve à quelque chose : l'enregistrer côté serveur
 * (`POST /api/v1/push/subscriptions`) — sans ça, le navigateur a bien un
 * abonnement Push actif, mais aucun backend ne sait qu'il existe ni sur
 * quels canaux le pousser. Un seul appel, toutes les données passées en
 * propriétés (voir `WebPushRegistrationOptions`) : demande la permission,
 * enregistre le Service Worker, s'abonne, puis inscrit l'abonnement.
 *
 * Lève une erreur explicite à chaque étape qui peut échouer (permission
 * refusée, inscription serveur rejetée) plutôt que d'échouer silencieusement.
 */
export async function registerWebPushSubscription(
  options: WebPushRegistrationOptions,
): Promise<WebPushRegistrationResult> {
  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    throw new Error(`Notification permission was "${permission}", not "granted".`);
  }

  const registration = await registerPushServiceWorker(options.swUrl ?? "/sw.js");
  const subscription = await subscribeToPush(registration, options.vapidPublicKey);

  const res = await fetch(`${options.apiBaseUrl}/api/v1/push/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token}` },
    body: JSON.stringify({
      tenant_id: options.tenantId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      channels: options.channels ?? ["*"],
      device_label: options.deviceLabel ?? guessDeviceLabel(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Push subscription registration failed (${res.status}).`);
  }

  return { subscription, registered: true };
}

export interface WebPushUnregistrationOptions {
  apiBaseUrl: string;
  token: string;
  tenantId: string;
  swUrl?: string;
}

/**
 * Contrepartie de `registerWebPushSubscription()` : résilie l'abonnement
 * navigateur puis le retire côté serveur. Renvoie `false` sans rien
 * appeler côté réseau s'il n'y avait aucun abonnement actif.
 */
export async function unregisterWebPushSubscription(
  options: WebPushUnregistrationOptions,
): Promise<boolean> {
  const registration = await registerPushServiceWorker(options.swUrl ?? "/sw.js");
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return false;

  const endpoint = existing.endpoint;
  await existing.unsubscribe();

  const res = await fetch(`${options.apiBaseUrl}/api/v1/push/subscriptions`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token}` },
    body: JSON.stringify({ tenant_id: options.tenantId, endpoint }),
  });
  if (!res.ok) {
    throw new Error(`Push subscription removal failed (${res.status}).`);
  }
  return true;
}

export interface PushPermissionPopupOptions extends WebPushRegistrationOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
  dismissAriaLabel?: string;
  /** Couleur du bouton "Activer" et de la barre de progression. */
  accentColor?: string;
  theme?: "light" | "dark";
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** Jours avant de reproposer le popup après un rejet (X/Échap) — mémorisé
   * dans localStorage, par tenant. `0` ou absent : ne se repropose jamais
   * automatiquement une fois rejeté (jusqu'à effacement du localStorage). */
  repromptIntervalDays?: number;
  onSubscribed?: (result: WebPushRegistrationResult) => void;
  onError?: (err: Error) => void;
  onDismiss?: () => void;
}

export interface PushPermissionPopupHandle {
  /** Referme le popup (s'il est affiché) sans le compter comme un rejet —
   * n'écrit rien dans localStorage, donc un prochain appel peut le
   * réafficher immédiatement. */
  close: () => void;
}

const DISMISSED_AT_KEY_PREFIX = "mio_push_popup_dismissed_at:";

function dismissedAtKey(tenantId: string): string {
  return `${DISMISSED_AT_KEY_PREFIX}${tenantId}`;
}

function readDismissedAt(tenantId: string): number | null {
  try {
    const raw = window.localStorage.getItem(dismissedAtKey(tenantId));
    return raw ? Number(raw) : null;
  } catch {
    // Stockage indisponible (navigation privée stricte, quota…) — se
    // comporte comme "jamais rejeté" plutôt que de planter.
    return null;
  }
}

function writeDismissedAt(tenantId: string): void {
  try {
    window.localStorage.setItem(dismissedAtKey(tenantId), String(Date.now()));
  } catch {
    // Idem — un rejet non mémorisé reproposera simplement le popup plus
    // tôt que prévu, jamais une erreur visible pour l'utilisateur.
  }
}

const POPUP_STYLE_ELEMENT_ID = "mio-push-popup-styles";

/** Injecte les `@keyframes`/styles `:hover` une seule fois (pas faisable
 * en style inline) — no-op si déjà présent, y compris entre plusieurs
 * popups affichés l'un après l'autre. */
function ensurePopupStylesInjected(): void {
  if (document.getElementById(POPUP_STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = POPUP_STYLE_ELEMENT_ID;
  style.textContent = `
@keyframes mio-push-popup-indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
@keyframes mio-push-popup-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.mio-push-popup-confirm:hover:not(:disabled) { filter: brightness(0.92); }
.mio-push-popup-dismiss:hover { opacity: 1 !important; }
`;
  document.head.appendChild(style);
}

/**
 * Affiche une petite carte flottante — dans l'esprit du sélecteur de
 * compte "Se connecter avec Google" (carte compacte, un geste, un état de
 * chargement clair) — plutôt que le prompt brut du navigateur sans aucun
 * contexte. Un seul clic sur "Activer" fait tout : demande la permission,
 * enregistre le Service Worker, s'abonne, inscrit l'abonnement (voir
 * `registerWebPushSubscription`, dont ce popup n'est qu'une présentation).
 *
 * N'affiche rien (retourne un handle inerte) si la permission est déjà
 * `"granted"` (rien à demander) ou `"denied"` (le navigateur refusera de
 * toute façon — redemander n'irrite que l'utilisateur), ou si le popup a
 * déjà été rejeté il y a moins de `repromptIntervalDays` jours.
 *
 * Afficher CE popup tout seul, sans geste utilisateur, est sans risque —
 * c'est uniquement l'appel à `Notification.requestPermission()` *à
 * l'intérieur*, déclenché par le clic sur "Activer", qui a besoin d'un
 * vrai geste.
 */
export function showPushPermissionPopup(options: PushPermissionPopupOptions): PushPermissionPopupHandle {
  const noop: PushPermissionPopupHandle = { close: () => {} };
  if (typeof document === "undefined" || !isNotificationSupported()) return noop;
  if (Notification.permission !== "default") return noop;

  const repromptDays = options.repromptIntervalDays ?? 0;
  const dismissedAt = readDismissedAt(options.tenantId);
  if (dismissedAt !== null) {
    const intervalMs = repromptDays * 24 * 60 * 60 * 1000;
    if (intervalMs <= 0 || Date.now() - dismissedAt < intervalMs) return noop;
  }

  ensurePopupStylesInjected();

  const dark = options.theme === "dark";
  const accent = options.accentColor ?? "#FF5E1A";
  const bg = dark ? "#1e1f26" : "#ffffff";
  const fg = dark ? "#f3f3f5" : "#1a1a1a";
  const muted = dark ? "#a3a3ab" : "#5f6368";
  const border = dark ? "#33343d" : "#e0e0e0";

  const positionStyle: Record<string, string> = { position: "fixed", zIndex: "2147483000", margin: "16px" };
  const [vSide, hSide] = (options.position ?? "bottom-right").split("-") as ["top" | "bottom", "left" | "right"];
  positionStyle[vSide] = "0";
  positionStyle[hSide] = "0";

  const overlay = document.createElement("div");
  Object.assign(overlay.style, positionStyle);

  const card = document.createElement("div");
  Object.assign(card.style, {
    width: "320px",
    maxWidth: "calc(100vw - 32px)",
    background: bg,
    color: fg,
    border: `1px solid ${border}`,
    borderRadius: "12px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
    padding: "16px",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    animation: "mio-push-popup-in 0.2s ease-out",
    position: "relative",
    overflow: "hidden",
    boxSizing: "border-box",
  } satisfies Partial<CSSStyleDeclaration>);

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.textContent = "×";
  dismissBtn.setAttribute("aria-label", options.dismissAriaLabel ?? "Dismiss");
  dismissBtn.className = "mio-push-popup-dismiss";
  Object.assign(dismissBtn.style, {
    position: "absolute",
    top: "8px",
    right: "8px",
    width: "24px",
    height: "24px",
    lineHeight: "24px",
    textAlign: "center",
    border: "none",
    background: "transparent",
    color: muted,
    fontSize: "18px",
    cursor: "pointer",
    opacity: "0.7",
    padding: "0",
  } satisfies Partial<CSSStyleDeclaration>);

  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", gap: "12px", alignItems: "flex-start", paddingRight: "20px" });

  const icon = document.createElement("div");
  icon.textContent = "🔔";
  Object.assign(icon.style, { fontSize: "24px", lineHeight: "1", flexShrink: "0" });

  const textCol = document.createElement("div");
  Object.assign(textCol.style, { minWidth: "0" });

  const titleEl = document.createElement("p");
  titleEl.textContent = options.title ?? "Enable notifications?";
  Object.assign(titleEl.style, { margin: "0 0 4px", fontSize: "14px", fontWeight: "600" });

  const descEl = document.createElement("p");
  descEl.textContent = options.description ?? "Get notified about new activity, even when this tab is closed.";
  Object.assign(descEl.style, { margin: "0", fontSize: "13px", color: muted, lineHeight: "1.4" });

  textCol.appendChild(titleEl);
  textCol.appendChild(descEl);
  row.appendChild(icon);
  row.appendChild(textCol);

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "mio-push-popup-confirm";
  confirmBtn.textContent = options.confirmLabel ?? "Enable";
  Object.assign(confirmBtn.style, {
    marginTop: "14px",
    width: "100%",
    border: "none",
    borderRadius: "999px",
    background: accent,
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "600",
    padding: "10px 16px",
    cursor: "pointer",
  } satisfies Partial<CSSStyleDeclaration>);

  const progress = document.createElement("div");
  Object.assign(progress.style, {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    height: "3px",
    overflow: "hidden",
    background: "transparent",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  const progressBar = document.createElement("div");
  Object.assign(progressBar.style, { width: "40%", height: "100%", background: accent, animation: "mio-push-popup-indeterminate 1s linear infinite" });
  progress.appendChild(progressBar);

  card.appendChild(progress);
  card.appendChild(dismissBtn);
  card.appendChild(row);
  card.appendChild(confirmBtn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  confirmBtn.focus();

  function remove(): void {
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
  }

  function dismiss(): void {
    writeDismissedAt(options.tenantId);
    remove();
    options.onDismiss?.();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") dismiss();
  }
  document.addEventListener("keydown", onKeyDown);
  dismissBtn.addEventListener("click", dismiss);

  confirmBtn.addEventListener("click", () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "…";
    dismissBtn.style.display = "none";
    progress.style.display = "block";

    registerWebPushSubscription(options).then(
      (result) => {
        remove();
        options.onSubscribed?.(result);
      },
      (err: unknown) => {
        progress.style.display = "none";
        confirmBtn.disabled = false;
        confirmBtn.textContent = options.confirmLabel ?? "Enable";
        dismissBtn.style.display = "";
        const asError = err instanceof Error ? err : new Error(String(err));
        descEl.textContent = asError.message;
        descEl.style.color = dark ? "#ff8a8a" : "#c5221f";
        options.onError?.(asError);
      },
    );
  });

  return { close: remove };
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
