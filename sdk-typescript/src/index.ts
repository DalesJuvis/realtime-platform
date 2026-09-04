/**
 * `index.ts` — Point d'entrée public du package.
 *
 * L'usine `createRealtimeClient()` est le point de bascule à un seul
 * endroit entre le moteur maison et un adaptateur alternatif
 * (Firebase/PubNub, cf. `src/adapters/`) : le reste du code applicatif ne
 * programme que contre `RealtimeAdapter`, jamais contre `RealtimeClient`
 * directement, pour que ce switch reste réellement une ligne.
 */

export { RealtimeClient } from "./client.js";
export type { RealtimeClientConfig, TokenRefreshResult, WebSocketLike } from "./client.js";

export type {
  MessageHandler,
  RealtimeAdapter,
  RealtimeEvents,
  RealtimeMessage,
  Unsubscribe,
} from "./types.js";

export { ChannelHandle } from "./channel.js";
export type { ChannelTransport, EventEnvelope } from "./channel.js";

export { Opcode, ProtocolError, crc16CcittFalse, globMatch } from "./protocol.js";
export type { DecodedFrame, FrameFields } from "./protocol.js";

export { DEFAULT_MAX_MESSAGE_BYTES } from "./chunking.js";

export {
  isNotificationSupported,
  requestNotificationPermission,
  showBackgroundNotification,
  attachBackgroundNotifications,
  registerPushServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
  guessDeviceLabel,
  registerWebPushSubscription,
  unregisterWebPushSubscription,
  showPushPermissionPopup,
} from "./notifications.js";
export type {
  BackgroundNotificationOptions,
  PushSubscriptionInfo,
  PushSubscriptionKeys,
  WebPushRegistrationOptions,
  WebPushRegistrationResult,
  WebPushUnregistrationOptions,
  PushPermissionPopupOptions,
  PushPermissionPopupHandle,
} from "./notifications.js";

import { RealtimeClient, type RealtimeClientConfig } from "./client.js";
import type { RealtimeAdapter } from "./types.js";

/**
 * Construit le client par défaut (moteur maison). Pour basculer vers un
 * autre backend, remplacez cet appel par ex. `new FirebaseAdapter(...)`
 * ou `new PubNubAdapter(...)` (cf. `src/adapters/`) — le reste de
 * l'application, écrit contre `RealtimeAdapter`, n'a rien d'autre à changer.
 */
export function createRealtimeClient(config: RealtimeClientConfig): RealtimeAdapter {
  return new RealtimeClient(config);
}
