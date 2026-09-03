# Channel router — known limits

Grounded in the current flat-map/glob design (`ChannelStateRepository`,
`ChannelRouterService`, `PushFallbackService`). Each item cites where it
lives in the code.

## 1. No channel directory

Channels are pure emergent state, never a queryable first-class entity
(`ChannelStateRepository.rs:140-145`). There's no way to ask "which
devices are subscribed to X" or "list all channels for targeting" except
by scanning currently-live `DashMap` entries — no directory service to
target against.

## 2. Wildcard matching is O(n) per publish, not indexed

Every `PUB` linear-scans *every* wildcard subscription the tenant
currently has and glob-matches each one (`ChannelRouterService.rs:162`).
The code's own comment assumes pattern counts "stay small" — not built to
scale to, say, thousands of concurrent wildcard subscribers per tenant.

## 3. A channel that's ever carried a message never dies — **bug, not a tradeoff**

`prune_empty`'s `history.is_empty()` condition can never re-trigger once
any message has been published, so per-order/per-user channel naming
(`orders:42`, `orders:43`, …) leaks memory for the life of the process.
Unlike the others below, this isn't an inherent cost of the design — it's
just wrong, and worth fixing regardless of anything else.

## 4. No cross-instance subscriber awareness

`local_subscribers == 0` is per-*instance*, not cluster-wide, so a
multi-instance deployment can fire a spurious push notification even
though a subscriber is live on a different instance (documented in
`PushFallbackService.rs`'s own doc comment).

## 5. No delivery guarantee, no backpressure

`PUB` is fire-and-forget over a `broadcast` channel with a 256-message
ring buffer per channel; a slow subscriber that falls more than 256
messages behind just gets dropped (`RecvError::Lagged`), not throttled or
queued.

## 6. Targeting is entirely subscription-driven, not identity-driven

You can't target "device X" or "user Y" directly — only a channel name,
reaching whoever happens to be subscribed to it (live) or has a matching
Web Push subscription (offline). `UNICAST` fakes per-user targeting by
convention (`user:{sub}` as a channel name), not as a real addressing
primitive.

## 7. Hard payload/name caps

211 UTF-8 bytes per message, 24 bytes per `channel_id` (HTTP publish
path) — no chunking at this layer (chunking, where it exists, is a
client-SDK concern layered on top).

---

## Which of these are actually worth integrating

Most of these are tradeoffs of a stateless, no-DB, fixed-frame realtime
router — changing them changes what the system fundamentally is, not a
bug fix.

- **#3 is a real bug**, independent of any design choice — worth fixing
  outright regardless of anything else.
- **#1 and #6** are the two that could genuinely be addressed without
  fighting the architecture. The `notifications` table added for the
  tenant-portal bell is already halfway to both: it durably records every
  channel a tenant has ever used (a directory, in effect) and could be
  extended toward a real per-user inbox, replacing the `user:{sub}`
  channel-naming hack with actual addressing.
- **#2, #4, #5, #7** are best left alone — "fixing" them means adding
  indexing, distributed coordination, ACKs, or chunking at this layer,
  which is a different system, not a patch on this one.
