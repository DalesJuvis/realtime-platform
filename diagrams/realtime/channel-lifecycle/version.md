# Lifecycle — how a channel is born, lives, and (mostly doesn't) die

Context: `backend/src/modules/realtime/services/ChannelRouterService.rs` +
`repositories/ChannelStateRepository.rs` (the `DashMap<ChannelKey,
ChannelState>` this whole diagram walks through) + `services/PresenceService.rs`
(the only caller of `prune_empty`). A channel (`ChannelKey` = `tenant_id` +
`channel_id` string) is never a first-class, explicitly-created resource in
this system — no `CreateChannelUseCase` exists. This diagram traces exactly
what "implicit" means in practice, including a dead end the code doesn't
advertise: once a channel has ever carried a message, nothing ever removes
it again.

Backfilled at the user's request, after the behavior was already live —
not written alongside the original implementation.

```text
                              first SUB or first PUB
                              (tenant_id, channel_id)
                                       │
                                       ▼
                          ┌─────────────────────────┐
                          │      DOES NOT EXIST       │   no entry in the
                          │   (no map entry at all)   │   channels DashMap
                          └─────────────────────────┘
                                       │
                                       │ get_or_create_channel()
                                       ▼
                          ┌─────────────────────────┐
                          │         CREATED           │  sender: broadcast(256)
                          │    subscribers = 0        │  history: ring, cap 50
                          │    history = empty        │
                          └─────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │ SUB                                  │ PUB (still 0 subs)
                    ▼                                      ▼
        ┌─────────────────────┐                 history gets its first
        │       ACTIVE          │◄── PUB ────────  entry either way —
        │  subscribers > 0      │   (fan-out to    from now on the ring
        └─────────────────────┘    every sub)      is never truly empty
                    │
                    │ last subscriber leaves —
                    │ UNSUB, clean disconnect, or presence-sweep timeout
                    ▼
        ┌─────────────────────┐
        │         IDLE           │   subscribers = 0
        │  (still in the map)   │   entry untouched, just quiet
        └─────────────────────┘
                    │
      ┌─────────────┴──────────────────────────────┐
      │                                              │
      │ reached via UNSUB                            │ reached via disconnect
      │                                               │ or presence-sweep timeout
      ▼                                               ▼
┌───────────────────────┐                 ┌─────────────────────────┐
│  prune_empty() is       │                 │   prune_empty() DOES run  │
│  NEVER even called       │                 │   remove_if(subs==0 AND   │
│  for this channel —      │                 │             history==∅)   │
│  UNSUB already dropped   │                 └─────────────────────────┘
│  it from the session's   │                              │
│  tracked list before     │                ┌─────────────┴─────────────┐
│  prune ever runs          │                │ history really is empty    │ history has ≥1 entry
└───────────────────────┘                │ (nothing was ever published) │ (normal case — any
      │                                       ▼                              │ PUB put something there)
      │                             ┌─────────────────────┐                  ▼
      │                             │   REMOVED — gone      │      ┌─────────────────────────┐
      │                             │   from the map          │      │   STUCK — LINGERS FOREVER │
      │                             └─────────────────────┘      │   subscribers = 0           │
      │                                                              │   never revisited,          │
      │                                                              │   never pruned               │
      │                                                              │   still returned by          │
      │                                                              │   GET /portal/channels       │
      │                                                              └─────────────────────────────┘
      │                                                                            ▲
      └────────────────────────────────────────────────────────────────────────────┘
                        (both dead-end paths land the same place in practice)
```

## What each step actually is, in code

1. **Birth.** `ChannelStateRepository::get_or_create_channel` — an atomic
   `DashMap::entry(key).or_insert_with(...)` — is called from both
   `ChannelRouterService::subscribe()` and `::publish()`. Whichever
   happens first creates the entry: a `broadcast::channel(256)` sender and
   an empty history ring (`DEFAULT_HISTORY_CAPACITY = 50`). The repo's own
   doc comment: *"channels are never a first-class persisted entity in
   this system, only born implicitly on first SUB/PUB and pruned once
   empty."* This diagram is mostly about how much weight that "pruned
   once empty" is actually carrying.
2. **Wildcards are a separate universe.** `orders:*`-style subscriptions
   live in their own `DashMap<WildcardKey, Sender>`, never touching the
   exact-channel map above. `subscriber_count()` (what the Broadcasting
   page's "Reach" and the Channels list both read) only counts exact-match
   receivers — a channel can have real wildcard listeners and still report
   `0`.
3. **Publish** fetches-or-creates, pushes one history entry, sends to the
   exact-channel subscribers, then separately scans wildcard patterns for
   the same tenant and fans out to those too.
4. **The only removal path** is `prune_empty`:
   `remove_if(key, |state| receiver_count == 0 && history.is_empty())`,
   called from exactly two places in `PresenceService` — a session's full
   disconnect, and the heartbeat sweep for timed-out sessions. Nothing
   else in the codebase ever calls it.
5. **Why it almost never fires for a real channel.** Two independent
   things defeat it, shown as the two branches above:
   - An **explicit UNSUB** removes the channel from that session's own
     tracked list immediately — before either disconnect-cleanup or the
     sweep loop ever gets a chance to consider it. `prune_empty` is
     simply never invoked for that channel again on that session's account.
   - Even when `prune_empty` *does* run (full disconnect / timeout), its
     `history.is_empty()` half of the condition requires that literally
     zero messages were ever published to that channel. The ring buffer
     only overwrites its oldest entry on overflow — it never drains to
     zero once it holds anything. So the very first `PUB` a channel ever
     receives permanently disqualifies it from this branch of cleanup,
     for the rest of the process's life.
6. **Net effect.** A channel that has ever carried one message is
   permanent for the life of the process (or until an in-memory restart —
   Redis-backed history, if `REDIS_URL` is set, survives that too, just
   trimmed by `HISTORY_STREAM_MAXLEN` rather than removed). It can cycle
   `ACTIVE ⇄ IDLE` indefinitely as subscribers come and go, but there is
   no path back to "gone." `GET /api/v1/portal/channels` reads this same
   map, so the Channels page will, over time, accumulate long-idle
   channels sitting at `subscriber_count: 0` alongside genuinely live ones
   — there's no TTL or explicit expiry anywhere in this path.
7. **Wildcards don't have this problem.** `prune_dead_wildcards` runs on
   every sweep tick with no history-based exemption (wildcard entries
   carry no history to begin with), so dead wildcard patterns are reliably
   removed — this dead end is specific to exact-match channels.
