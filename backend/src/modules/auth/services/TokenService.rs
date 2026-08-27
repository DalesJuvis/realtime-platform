//! # TokenService
//!
//! **Action:** Multi-tenant HMAC-SHA256 signed-token authentication.
//! **Input:** Tenant secrets (via the repository), tokens to validate, claims to issue.
//! **Output:** `Claims` on success, typed `AuthError` on failure.
//! **Side effects:** None beyond delegating storage to `TenantSecretRepository`.
//! **Dependencies:** `hmac`, `sha2`, `base64`, `serde_json`, `repositories::TenantSecretRepository`, `entities::Claims`.
//!
//! Token format (compact, deliberately simpler than a full JWT library to
//! avoid its classic attack surface, e.g. `"alg": "none"` confusion):
//!
//! ```text
//! base64url(payload_json) "." base64url(HMAC-SHA256(payload_json, tenant_secret))
//! ```
//!
//! `payload_json = {"tenant_id": "<uuid>", "sub": "<session/user id>", "exp": <unix_ts>}`
//!
//! The tenant secret is looked up in **O(1)** via `TenantSecretRepository`:
//! full validation (lookup + HMAC check) never depends on the number of
//! registered tenants (constraint #2).

use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::Sha256;
use subtle::ConstantTimeEq;

use crate::entities::Claims::Claims;
use crate::entities::ChannelKey::TenantId;
use crate::modules::auth::repositories::TenantSecretRepository::TenantSecretRepository;

type HmacSha256 = Hmac<Sha256>;

/// Generates a random 256-bit secret, base64url-encoded — the one place
/// this happens, shared by the Admin API (create/rotate tenant) and the
/// Portal API's self-serve signup/key-rotation.
pub fn generate_secret() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AuthError {
    #[error("malformed token")]
    Malformed,
    #[error("unknown tenant: {0}")]
    UnknownTenant(TenantId),
    #[error("invalid signature")]
    BadSignature,
    #[error("expired token")]
    Expired,
    #[error("token tenant ({token}) does not match the requested tenant ({requested})")]
    TenantMismatch { token: TenantId, requested: TenantId },
}

/// Tenant HMAC secret registry and associated validation logic.
pub struct TokenService {
    repo: TenantSecretRepository,
}

impl TokenService {
    pub fn new() -> Self {
        Self {
            repo: TenantSecretRepository::new(),
        }
    }

    pub fn register_tenant(&self, tenant_id: TenantId, secret: impl Into<Vec<u8>>) {
        self.repo.register(tenant_id, secret);
    }

    /// Revokes a tenant: any subsequent validation for it immediately
    /// fails with `UnknownTenant`.
    pub fn revoke_tenant(&self, tenant_id: TenantId) {
        self.repo.revoke(tenant_id);
    }

    /// Constant-time check that `secret` is this tenant's real HMAC
    /// secret — used once, by the portal's self-registration flow, to
    /// prove a caller actually holds the secret an admin gave them at
    /// tenant creation (see `modules::portal`), not for the per-frame hot
    /// path (that's `validate`, which checks a signed token, never a raw secret).
    pub fn verify_tenant_secret(&self, tenant_id: TenantId, secret: &[u8]) -> bool {
        match self.repo.get(&tenant_id) {
            Some(stored) => stored.as_slice().ct_eq(secret).into(),
            None => false,
        }
    }

    /// Issues a token for a given tenant/subject, valid for `ttl_secs`
    /// seconds. Server/CLI utility to distribute tokens to client
    /// applications — not part of the runtime hot path (which only calls `validate`).
    pub fn issue_token(&self, tenant_id: TenantId, sub: &str, ttl_secs: u64) -> Result<String, AuthError> {
        let secret = self
            .repo
            .get(&tenant_id)
            .ok_or(AuthError::UnknownTenant(tenant_id))?;

        let claims = Claims {
            tenant_id,
            sub: sub.to_string(),
            exp: now_unix() + ttl_secs,
        };
        let payload = serde_json::to_vec(&claims).map_err(|_| AuthError::Malformed)?;
        let payload_b64 = URL_SAFE_NO_PAD.encode(&payload);

        let mut mac = HmacSha256::new_from_slice(&secret).map_err(|_| AuthError::Malformed)?;
        mac.update(payload_b64.as_bytes());
        let sig_b64 = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());

        Ok(format!("{payload_b64}.{sig_b64}"))
    }

    /// Validates a token against an *expected* tenant (the one announced
    /// in the AUTH frame envelope by the client).
    ///
    /// Verification order: format → secret lookup (O(1)) → HMAC signature
    /// (constant-time comparison via `Mac::verify_slice`, timing-attack
    /// resistant) → expiry → consistency between the tenant encoded in the
    /// token and the tenant announced by the client.
    ///
    /// This last check prevents a client from replaying a valid token
    /// issued for tenant A while claiming, in the frame envelope, to
    /// belong to tenant B.
    pub fn validate(&self, expected_tenant: TenantId, token: &str) -> Result<Claims, AuthError> {
        let (payload_b64, sig_b64) = token.split_once('.').ok_or(AuthError::Malformed)?;

        let payload = URL_SAFE_NO_PAD
            .decode(payload_b64)
            .map_err(|_| AuthError::Malformed)?;
        let claims: Claims = serde_json::from_slice(&payload).map_err(|_| AuthError::Malformed)?;

        let secret = self
            .repo
            .get(&claims.tenant_id)
            .ok_or(AuthError::UnknownTenant(claims.tenant_id))?;

        let sig = URL_SAFE_NO_PAD
            .decode(sig_b64)
            .map_err(|_| AuthError::Malformed)?;

        let mut mac = HmacSha256::new_from_slice(&secret).map_err(|_| AuthError::Malformed)?;
        mac.update(payload_b64.as_bytes());
        mac.verify_slice(&sig).map_err(|_| AuthError::BadSignature)?;

        if claims.exp < now_unix() {
            return Err(AuthError::Expired);
        }

        if claims.tenant_id != expected_tenant {
            return Err(AuthError::TenantMismatch {
                token: claims.tenant_id,
                requested: expected_tenant,
            });
        }

        Ok(claims)
    }
}

impl Default for TokenService {
    fn default() -> Self {
        Self::new()
    }
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock predates UNIX_EPOCH")
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn issue_then_validate_roundtrip() {
        let auth = TokenService::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"super-secret-key".to_vec());

        let token = auth.issue_token(tenant, "user-42", 3600).unwrap();
        let claims = auth.validate(tenant, &token).unwrap();
        assert_eq!(claims.tenant_id, tenant);
        assert_eq!(claims.sub, "user-42");
    }

    #[test]
    fn rejects_tampered_signature() {
        let auth = TokenService::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"secret".to_vec());
        let mut token = auth.issue_token(tenant, "user-1", 3600).unwrap();
        token.push('x');
        assert_eq!(auth.validate(tenant, &token), Err(AuthError::BadSignature));
    }

    #[test]
    fn rejects_expired_token() {
        let auth = TokenService::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"secret".to_vec());
        let token = auth.issue_token(tenant, "user-1", 0).unwrap();
        std::thread::sleep(std::time::Duration::from_secs(1));
        assert_eq!(auth.validate(tenant, &token), Err(AuthError::Expired));
    }

    #[test]
    fn rejects_cross_tenant_replay() {
        let auth = TokenService::new();
        let tenant_a = Uuid::from_u128(1);
        let tenant_b = Uuid::from_u128(2);
        auth.register_tenant(tenant_a, b"secret-a".to_vec());
        auth.register_tenant(tenant_b, b"secret-b".to_vec());

        let token_a = auth.issue_token(tenant_a, "user-1", 3600).unwrap();
        let err = auth.validate(tenant_b, &token_a).unwrap_err();
        assert_eq!(
            err,
            AuthError::TenantMismatch {
                token: tenant_a,
                requested: tenant_b,
            }
        );
    }

    #[test]
    fn rejects_unknown_tenant() {
        let auth = TokenService::new();
        let tenant = Uuid::from_u128(99);
        let err = auth.issue_token(tenant, "user-1", 3600).unwrap_err();
        assert_eq!(err, AuthError::UnknownTenant(tenant));
    }

    #[test]
    fn revoked_tenant_fails_validation() {
        let auth = TokenService::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"secret".to_vec());
        let token = auth.issue_token(tenant, "user-1", 3600).unwrap();
        auth.revoke_tenant(tenant);
        assert_eq!(auth.validate(tenant, &token), Err(AuthError::UnknownTenant(tenant)));
    }
}
