/**
 * `components.tsx` — Composants de composition, en plus des hooks.
 *
 * Ni l'un ni l'autre n'ajoutent de logique par rapport aux hooks
 * équivalents (`ChannelSubscriber` est un pur render-prop autour de
 * `useChannel`) — ils existent pour les bases de code qui préfèrent
 * composer du JSX plutôt qu'appeler un hook directement, notamment les
 * composants classe (où les hooks sont inutilisables).
 */

import { useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { useChannel, useConnectionState, type UseChannelOptions, type UseChannelResult } from "./hooks.js";
import { useWebPushRegistration, type UseWebPushRegistrationResult } from "./notifications.js";
import type { ConnectionState } from "./RealtimeContext.js";
import type { PushSubscriptionInfo, WebPushRegistrationOptions } from "@mio/realtime-sdk";

export interface ChannelSubscriberProps extends UseChannelOptions {
  channelId: string;
  children: (state: UseChannelResult) => ReactNode;
}

/** Équivalent render-prop de `useChannel` — voir sa doc pour le détail du comportement. */
export function ChannelSubscriber({ channelId, children, ...options }: ChannelSubscriberProps) {
  const state = useChannel(channelId, options);
  return <>{children(state)}</>;
}

export interface ConnectionIndicatorProps {
  className?: string;
  /** Libellés personnalisés par état — les états omis retombent sur le libellé par défaut. */
  labels?: Partial<Record<ConnectionState, string>>;
}

const DEFAULT_LABELS: Record<ConnectionState, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  open: "Connected",
  closed: "Disconnected",
  error: "Connection error",
};

/**
 * Texte d'état de connexion minimal, sans mise en forme imposée — un
 * vrai point de départ pour un indicateur visuel (badge, pastille), pas
 * un composant themé : ce SDK n'a pas d'opinion sur votre design system.
 * Pour plus de contrôle (icône, couleur, animation), consommez
 * `useConnectionState` directement plutôt que ce composant.
 */
export function ConnectionIndicator({ className, labels }: ConnectionIndicatorProps) {
  const { connectionState } = useConnectionState();
  return <span className={className}>{labels?.[connectionState] ?? DEFAULT_LABELS[connectionState]}</span>;
}

const DEFAULT_PUSH_BUTTON_LABELS: Record<WebPushRegistrationStatusForLabels, string> = {
  idle: "Enable notifications",
  subscribing: "Enabling…",
  subscribed: "Notifications enabled",
  unsubscribing: "Disabling…",
  error: "Enable notifications",
};

// Only re-declared here for `DEFAULT_PUSH_BUTTON_LABELS`'s type — importing
// `WebPushRegistrationStatus` itself would work identically, this alias
// just keeps the table above readable next to its own purpose.
type WebPushRegistrationStatusForLabels = UseWebPushRegistrationResult["status"];

export interface PushPermissionButtonProps
  extends WebPushRegistrationOptions,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children" | "type" | "className" | "disabled"> {
  /**
   * Two ways to use this component:
   * - Omit, or pass plain content (text/an icon) — rendered inside a
   *   real `<button>` this component manages for you (`onClick`,
   *   `disabled`, `aria-*` all wired). `className`/`style`/any other
   *   native `<button>` attribute (id, title, data-*, …) applies to that button.
   * - Pass a function instead — full control over what's rendered (your
   *   own component, a switch, anything), receiving the same state
   *   `useWebPushRegistration` returns. You then call `subscribe()`/
   *   `unsubscribe()` yourself from whatever gesture you render (native
   *   button attributes passed here are ignored — there's no `<button>`
   *   for them to apply to).
   */
  children?: ReactNode | ((state: UseWebPushRegistrationResult) => ReactNode);
  className?: string;
  /** What a click on the default `<button>` does. "toggle" (default)
   * subscribes when not subscribed, unsubscribes when it is — ignored
   * when `children` is a function (you own the click handling then). */
  action?: "subscribe" | "unsubscribe" | "toggle";
}

/**
 * The "ask permission" UI for Web Push, as either a ready-to-style
 * `<button>` or a fully custom render — see `PushPermissionButtonProps.children`.
 * Wraps `useWebPushRegistration`; use that hook directly if you want the
 * state without any element being rendered on your behalf at all.
 *
 * ```tsx
 * // Quick: your own label/icon, this component's own <button>
 * <PushPermissionButton {...pushOptions} className="btn">
 *   <BellIcon /> Enable alerts
 * </PushPermissionButton>
 *
 * // Full control: your own markup, you drive subscribe()/unsubscribe()
 * <PushPermissionButton {...pushOptions}>
 *   {(state) => <MySwitch checked={state.status === 'subscribed'} onChange={state.subscribe} />}
 * </PushPermissionButton>
 * ```
 */
export function PushPermissionButton({
  children,
  className,
  action = "toggle",
  apiBaseUrl,
  token,
  tenantId,
  vapidPublicKey,
  channels,
  swUrl,
  deviceLabel,
  ...buttonProps
}: PushPermissionButtonProps) {
  const state = useWebPushRegistration({
    apiBaseUrl,
    token,
    tenantId,
    vapidPublicKey,
    ...(channels !== undefined && { channels }),
    ...(swUrl !== undefined && { swUrl }),
    ...(deviceLabel !== undefined && { deviceLabel }),
  });

  if (typeof children === "function") {
    return <>{children(state)}</>;
  }

  const isBusy = state.status === "subscribing" || state.status === "unsubscribing";

  function handleClick() {
    const shouldUnsubscribe = action === "unsubscribe" || (action === "toggle" && state.status === "subscribed");
    if (shouldUnsubscribe) {
      state.unsubscribe();
    } else {
      state.subscribe();
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={isBusy || !state.isSupported}
      aria-pressed={state.status === "subscribed"}
      {...buttonProps}
    >
      {children ?? DEFAULT_PUSH_BUTTON_LABELS[state.status]}
    </button>
  );
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
    return null;
  }
}

function writeDismissedAt(tenantId: string): void {
  try {
    window.localStorage.setItem(dismissedAtKey(tenantId), String(Date.now()));
  } catch {
    // Stockage indisponible — un rejet non mémorisé reproposera juste le
    // popup plus tôt que prévu, jamais une erreur visible.
  }
}

/** `true` seulement côté navigateur, avec `Notification` dispo — évalué à
 * chaque appel plutôt que mémoïsé, pour rester correct si le composant
 * est rendu côté serveur puis hydraté (SSR : `false` au premier rendu). */
function isPopupEligible(tenantId: string, repromptIntervalDays: number): boolean {
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;
  if (Notification.permission !== "default") return false;
  const dismissedAt = readDismissedAt(tenantId);
  if (dismissedAt === null) return true;
  const intervalMs = repromptIntervalDays * 24 * 60 * 60 * 1000;
  return intervalMs > 0 && Date.now() - dismissedAt >= intervalMs;
}

export interface PushPermissionPopupProps extends WebPushRegistrationOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
  dismissAriaLabel?: string;
  accentColor?: string;
  theme?: "light" | "dark";
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** Jours avant de reproposer le popup après un rejet — mémorisé dans
   * `localStorage`, par tenant. `0` (défaut) : ne se repropose jamais
   * automatiquement une fois rejeté. */
  repromptIntervalDays?: number;
  className?: string;
  onSubscribed?: (subscription: PushSubscriptionInfo) => void;
  onDismiss?: () => void;
}

const POSITION_STYLE: Record<NonNullable<PushPermissionPopupProps["position"]>, CSSProperties> = {
  "bottom-right": { bottom: 0, right: 0 },
  "bottom-left": { bottom: 0, left: 0 },
  "top-right": { top: 0, right: 0 },
  "top-left": { top: 0, left: 0 },
};

/**
 * Version React de `showPushPermissionPopup` (SDK core) — même carte
 * compacte dans l'esprit du sélecteur de compte "Se connecter avec
 * Google" plutôt que le prompt brut du navigateur, mais un vrai composant
 * React (état/rendu via `useWebPushRegistration`, pas un DOM géré à la
 * main) puisque c'est ce dont une base de code React a besoin. Se rend
 * `null` (rien affiché) si la permission est déjà `"granted"`/`"denied"`,
 * ou rejetée il y a moins de `repromptIntervalDays` jours — se re-vérifie
 * si `tenantId`/`repromptIntervalDays` changent, pas seulement au montage.
 *
 * Afficher ce composant sans geste utilisateur est sans risque — seul
 * l'appel à `Notification.requestPermission()` *dans* `subscribe()`,
 * déclenché par le clic sur "Activer", en a besoin.
 */
export function PushPermissionPopup({
  title = "Enable notifications?",
  description = "Get notified about new activity, even when this tab is closed.",
  confirmLabel = "Enable",
  dismissAriaLabel = "Dismiss",
  accentColor = "#FF5E1A",
  theme = "light",
  position = "bottom-right",
  repromptIntervalDays = 0,
  className,
  onSubscribed,
  onDismiss,
  apiBaseUrl,
  token,
  tenantId,
  vapidPublicKey,
  channels,
  swUrl,
  deviceLabel,
}: PushPermissionPopupProps) {
  const state = useWebPushRegistration({
    apiBaseUrl,
    token,
    tenantId,
    vapidPublicKey,
    ...(channels !== undefined && { channels }),
    ...(swUrl !== undefined && { swUrl }),
    ...(deviceLabel !== undefined && { deviceLabel }),
  });
  const [visible, setVisible] = useState(() => isPopupEligible(tenantId, repromptIntervalDays));

  useEffect(() => {
    setVisible(isPopupEligible(tenantId, repromptIntervalDays));
  }, [tenantId, repromptIntervalDays]);

  useEffect(() => {
    if (state.status === "subscribed" && state.subscription) {
      setVisible(false);
      onSubscribed?.(state.subscription);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  if (!visible) return null;

  function handleDismiss() {
    writeDismissedAt(tenantId);
    setVisible(false);
    onDismiss?.();
  }

  const isBusy = state.status === "subscribing";
  const dark = theme === "dark";
  const bg = dark ? "#1e1f26" : "#ffffff";
  const fg = dark ? "#f3f3f5" : "#1a1a1a";
  const muted = dark ? "#a3a3ab" : "#5f6368";
  const border = dark ? "#33343d" : "#e0e0e0";
  const errorColor = dark ? "#ff8a8a" : "#c5221f";

  return (
    <div style={{ position: "fixed", zIndex: 2147483000, margin: 16, ...POSITION_STYLE[position] }} className={className}>
      <style>{`@keyframes mio-push-popup-indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }`}</style>
      <div
        style={{
          width: 320,
          maxWidth: "calc(100vw - 32px)",
          background: bg,
          color: fg,
          border: `1px solid ${border}`,
          borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          padding: 16,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          position: "relative",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
        role="dialog"
        aria-label={title}
      >
        {isBusy && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, overflow: "hidden" }}>
            <div style={{ width: "40%", height: "100%", background: accentColor, animation: "mio-push-popup-indeterminate 1s linear infinite" }} />
          </div>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={dismissAriaLabel}
          disabled={isBusy}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            lineHeight: "24px",
            textAlign: "center",
            border: "none",
            background: "transparent",
            color: muted,
            fontSize: 18,
            cursor: isBusy ? "default" : "pointer",
            opacity: isBusy ? 0.3 : 0.7,
            padding: 0,
          }}
        >
          ×
        </button>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingRight: 20 }}>
          <div style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>🔔</div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>{title}</p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: state.error ? errorColor : muted }}>
              {state.error ? state.error.message : description}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => state.subscribe()}
          disabled={isBusy}
          style={{
            marginTop: 14,
            width: "100%",
            border: "none",
            borderRadius: 999,
            background: accentColor,
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 600,
            padding: "10px 16px",
            cursor: isBusy ? "default" : "pointer",
          }}
        >
          {isBusy ? "…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}
