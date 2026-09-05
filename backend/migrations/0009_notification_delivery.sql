-- Which path a notification actually went out on: 'realtime' when a
-- session was subscribed locally at publish time, 'push' when it wasn't
-- (push fallback was attempted) — see `PushFallbackService::publish_and_fanout`.
-- Backfilled to 'realtime' for rows written before this column existed;
-- not retroactively accurate for those, but harmless (they predate this
-- split ever being surfaced anywhere).
ALTER TABLE notifications ADD COLUMN delivery TEXT NOT NULL DEFAULT 'realtime';
