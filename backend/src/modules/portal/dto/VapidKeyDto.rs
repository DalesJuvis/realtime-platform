//! # VapidKeyDto
//!
//! **Action:** Response shape for `GET /api/v1/portal/vapid-key`.
//! **Input:** N/A.
//! **Output:** N/A.
//!
//! Unlike `KeyPairDto`, this isn't tenant-scoped data — one VAPID keypair
//! is configured per backend *instance* (`Settings::vapid_public_key`),
//! shared by every tenant on it. `vapid_public_key: None` means Web Push
//! isn't configured on this deployment at all, distinct from an empty
//! string. Public by design, same as `tenant_id` — safe to hand straight
//! to a browser/client SDK's `subscribeToPush`, never a secret (that's
//! the private half, which never leaves the server).

use serde::Serialize;

#[derive(Serialize)]
pub struct VapidKeyDto {
    pub vapid_public_key: Option<String>,
}
