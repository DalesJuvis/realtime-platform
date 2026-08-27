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
import type { ConnectionState } from "./RealtimeContext.js";

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
