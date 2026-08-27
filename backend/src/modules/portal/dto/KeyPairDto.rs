//! # KeyPairDto
//!
//! **Action:** Response shape for `GET /api/v1/portal/keys` and
//! `POST /api/v1/portal/keys/rotate` — this system's honest equivalent of
//! a Stripe-style publishable/secret key pair: `tenant_id` already is the
//! public, safe-to-embed identifier every SDK config and HTTP publish
//! request carries; `secret_key` is the HMAC secret used server-side only,
//! to mint client tokens via `POST /api/v1/auth/tokens`.

use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub struct KeyPairDto {
    pub tenant_id: Uuid,
    pub secret_key: String,
}
