/**
 * `components.tsx` — Composants de composition, en plus des hooks.
 *
 * Ni l'un ni l'autre n'ajoutent de logique par rapport aux hooks
 * équivalents (`ChannelSubscriber` est un pur render-prop autour de
 * `useChannel`) — ils existent pour les bases de code qui préfèrent
 * composer du JSX plutôt qu'appeler un hook directement, notamment les
 * composants classe (où les hooks sont inutilisables).
 */

import type { ReactNode } from "react";
import { useChannel, useConnectionState, type UseChannelOptions, type UseChannelResult } from "./hooks.js";
import { useWebPushRegistration, type UseWebPushRegistrationResult } from "./notifications.js";
import type { ConnectionState } from "./RealtimeContext.js";
import type { WebPushRegistrationOptions } from "@mio/realtime-sdk";

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

export interface PushPermissionButtonProps extends WebPushRegistrationOptions {
  /**
   * Two ways to use this component:
   * - Omit, or pass plain content (text/an icon) — rendered inside a
   *   real `<button>` this component manages for you (`onClick`,
   *   `disabled`, `aria-*` all wired). `className` applies to that button.
   * - Pass a function instead — full control over what's rendered (your
   *   own component, a switch, anything), receiving the same state
   *   `useWebPushRegistration` returns. You then call `subscribe()`/
   *   `unsubscribe()` yourself from whatever gesture you render.
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
export function PushPermissionButton({ children, className, action = "toggle", ...options }: PushPermissionButtonProps) {
  const state = useWebPushRegistration(options);

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
    >
      {children ?? DEFAULT_PUSH_BUTTON_LABELS[state.status]}
    </button>
  );
}
