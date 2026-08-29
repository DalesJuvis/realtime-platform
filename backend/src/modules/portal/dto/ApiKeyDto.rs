//! # ApiKeyDto
//!
//! **Action:** Request/response shapes for `/api/v1/portal/api-keys` —
//! named, independently-revocable API key pairs, additive to the tenant's
//! own primary secret (`KeyPairDto`).
//!
//! Two distinct response shapes on purpose: `ApiKeyDto` (list/read) never
//! carries `secret` — once a pair is created, its secret is only ever
//! shown again by the caller who still has `GeneratedApiKeyDto`'s
//! one-time response saved; `GeneratedApiKeyDto` is that one-time
//! response, the only place `secret` ever appears.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::entities::ApiKey::ApiKey;

#[derive(Deserialize)]
pub struct CreateApiKeyDto {
    pub name: String,
}

#[derive(Serialize)]
pub struct ApiKeyDto {
    pub id: Uuid,
    pub name: String,
    pub public_key: String,
    pub status: &'static str,
    pub created_at: String,
    pub revoked_at: Option<String>,
}

impl From<&ApiKey> for ApiKeyDto {
    fn from(key: &ApiKey) -> Self {
        Self {
            id: key.id,
            name: key.name.clone(),
            public_key: key.public_key.clone(),
            status: key.status.as_str(),
            created_at: key.created_at.to_rfc3339(),
            revoked_at: key.revoked_at.map(|t| t.to_rfc3339()),
        }
    }
}

/// Shown exactly once, right after generation — the only response shape
/// in this file that ever carries `secret`.
#[derive(Serialize)]
pub struct GeneratedApiKeyDto {
    pub id: Uuid,
    pub name: String,
    pub public_key: String,
    pub secret: String,
    pub created_at: String,
}

impl From<ApiKey> for GeneratedApiKeyDto {
    fn from(key: ApiKey) -> Self {
        Self {
            id: key.id,
            name: key.name,
            public_key: key.public_key,
            secret: key.secret,
            created_at: key.created_at.to_rfc3339(),
        }
    }
}
