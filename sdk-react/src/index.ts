/**
 * `index.ts` — Point d'entrée public du package.
 */

export { RealtimeProvider, useRealtimeContext } from "./RealtimeContext.js";
export type { RealtimeProviderProps, RealtimeContextValue, ConnectionState } from "./RealtimeContext.js";

export {
  useRealtimeClient,
  useConnectionState,
  useSubscription,
  useChannel,
  usePublish,
  usePublishTemplate,
} from "./hooks.js";
export type { UseChannelOptions, UseChannelResult } from "./hooks.js";

export { ChannelSubscriber, ConnectionIndicator } from "./components.js";
export type { ChannelSubscriberProps, ConnectionIndicatorProps } from "./components.js";

export { useBackgroundNotifications, usePushSubscription } from "./notifications.js";
export type { PushSubscriptionStatus, UsePushSubscriptionResult } from "./notifications.js";

// Réexportés pour que le code applicatif n'ait pas besoin d'un import
// séparé vers `@mio/realtime-sdk` juste pour ces types/cette classe
// couramment utilisés à côté des hooks ci-dessus.
export { RealtimeClient } from "@mio/realtime-sdk";
export type { RealtimeClientConfig, RealtimeMessage, MessageHandler } from "@mio/realtime-sdk";
