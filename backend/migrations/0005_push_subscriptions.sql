-- Browser Web Push subscriptions (VAPID) — registered by an end-user's
-- browser via the SDK's `subscribeToPush()` so that a message can still
-- reach them with no live WebSocket connection: tab closed, browser
-- backgrounded past what the OS lets a page's own JS keep running, or the
-- whole browser process not currently open (delivery then depends on the
-- OS/browser's own push wake-up, which this backend has no control over —
-- see `WebPushAdapter`'s doc comment for what "sent" does and doesn't guarantee).
--
-- `endpoint` is the natural identity of one subscription (one browser
-- profile's registration with its push service) — a browser may
-- resubscribe (rotated endpoint, refreshed keys) any number of times, so
-- it is the upsert key, not an auto-increment id.
--
-- `channels` stores a JSON array of channel ids/patterns (same `orders:*`
-- glob syntax as WS `SUB`) this subscription wants pushed — resolved
-- against a published channel the same way as a live WS subscription,
-- via `PushSubscriptionRepository::find_matching`.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL,
    sub TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    channels TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON push_subscriptions (tenant_id);
