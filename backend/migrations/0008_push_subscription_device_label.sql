-- A human-readable label for which device this subscription belongs to
-- ("Chrome on Windows", "Safari on iPhone", …) — `endpoint` was already
-- the natural per-device identity (one row per browser/device, even for
-- the same `sub`; see 0005's doc comment), but an opaque push-service URL
-- gives no way to tell two of a user's devices apart when listing their
-- subscriptions. Nullable: older rows registered before this column
-- existed, and any caller that doesn't send one, simply have no label.
ALTER TABLE push_subscriptions ADD COLUMN device_label TEXT;
