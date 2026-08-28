/**
 * `index.ts` — Point d'entrée public du package.
 *
 * Réexporte tout `@mio/realtime-sdk-react` (hooks/composants
 * identiques en React Native — aucun d'entre eux ne touche le DOM) sauf
 * `RealtimeProvider`, remplacé ici par la version consciente de
 * `AppState`.
 */

export { RealtimeProvider } from "./RealtimeProvider.js";
export { useNetworkReconnect } from "./useNetworkReconnect.js";

export {
  useRealtimeContext,
  useRealtimeClient,
  useConnectionState,
  useSubscription,
  useChannel,
  usePublish,
  ChannelSubscriber,
  ConnectionIndicator,
  RealtimeClient,
} from "@mio/realtime-sdk-react";

export type {
  RealtimeProviderProps,
  RealtimeContextValue,
  ConnectionState,
  UseChannelOptions,
  UseChannelResult,
  ChannelSubscriberProps,
  ConnectionIndicatorProps,
  RealtimeClientConfig,
  RealtimeEndpoint,
  RealtimeMessage,
  MessageHandler,
} from "@mio/realtime-sdk-react";
