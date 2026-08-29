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
use crate::modules::auth::repositories::ExtraTenantKeysRepository::ExtraTenantKeysRepository;
use crate::modules::auth::repositories::TenantSecretRepository::TenantSecretRepository;

type HmacSha256 = Hmac<Sha256>;

/// Generates a random 256-bit secret, base64url-encoded — the one place
/// this happens, shared by the Admin API (create/rotate tenant) and the
/// Portal API's self-serve signup/key-rotation/extra-key-generation.
pub fn generate_secret() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Generates a random public key identifier for an extra API key pair —
/// `pk_` plus 16 random bytes, hex-encoded (not base64url: this value is
/// meant to be read/compared by eye in a UI table, and hex avoids the
/// visually-ambiguous characters (`-`/`_`, similar-looking letters) a
/// base64url alphabet carries). Deliberately never `tenant_id` reused
/// under this name — see `ApiKeyRepository`'s own doc comment for why.
pub fn generate_public_key() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!("pk_{hex}")
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
///
/// Two stores, deliberately kept separate rather than unified into one
/// "list of keys": `repo` is the tenant's one primary secret (signup,
/// Settings' rotate-in-place flow — unchanged, single-value semantics,
/// exactly as before this type gained extra-key support); `extra` is zero
/// or more additional, independently-generated, independently-revocable
/// key pairs a tenant can generate for a specific server/app/environment
/// (the Portal API's `/api/v1/portal/api-keys` routes). A secret is valid
/// for this tenant if it matches *either* store; a token is valid if its
/// signature matches *any* currently-active secret from *either* store —
/// see `validate`'s own doc comment for the resulting O(k) trade-off.
pub struct TokenService {
    repo: TenantSecretRepository,
    extra: ExtraTenantKeysRepository,
}

impl TokenService {
    pub fn new() -> Self {
        Self {
            repo: TenantSecretRepository::new(),
            extra: ExtraTenantKeysRepository::new(),
        }
    }

    pub fn register_tenant(&self, tenant_id: TenantId, secret: impl Into<Vec<u8>>) {
        self.repo.register(tenant_id, secret);
    }

    /// Revokes a tenant entirely: both its primary secret and every extra
    /// key pair immediately stop validating.
    pub fn revoke_tenant(&self, tenant_id: TenantId) {
        self.repo.revoke(tenant_id);
        self.extra.revoke_all(tenant_id);
    }

    /// Adds an extra, independently-revocable key pair for `tenant_id` —
    /// purely additive, never touches the tenant's primary secret.
    pub fn add_extra_key(&self, tenant_id: TenantId, public_key: &str, secret: impl Into<Vec<u8>>) {
        self.extra.add(tenant_id, public_key.to_string(), secret.into());
    }

    /// Revokes one extra key pair by its public key. Returns `false` if no
    /// matching active entry was found (already revoked, or never existed
    /// in the in-memory store — e.g. a fresh instance that hasn't reloaded
    /// it from `ApiKeyRepository` yet).
    pub fn revoke_extra_key(&self, tenant_id: TenantId, public_key: &str) -> bool {
        self.extra.revoke(tenant_id, public_key)
    }

    /// The secret bytes to use, if `secret` currently matches *any* valid
    /// key (primary or extra) for `tenant_id` — the primary store is
    /// checked first since it's the common case (one HMAC compute) before
    /// falling back to scanning extra keys.
    fn find_valid_secret(&self, tenant_id: TenantId, secret: &[u8]) -> Option<Vec<u8>> {
        if let Some(stored) = self.repo.get(&tenant_id) {
            if bool::from(stored.as_slice().ct_eq(secret)) {
                return Some(stored.clone());
            }
        }
        self.extra.find_matching(&tenant_id, secret)
    }

    /// Constant-time check that `secret` is currently valid for this
    /// tenant (primary or any extra key) — used by the portal's
    /// self-registration flow and the public HTTP mint-token endpoint to
    /// prove a caller actually holds a real secret, not for the per-frame
    /// hot path (that's `validate`, which checks a signed token, never a
    /// raw secret).
    pub fn verify_tenant_secret(&self, tenant_id: TenantId, secret: &[u8]) -> bool {
        self.find_valid_secret(tenant_id, secret).is_some()
    }

    /// Issues a token for a given tenant/subject, valid for `ttl_secs`
    /// seconds, signed with the tenant's **primary** secret. Server/CLI
    /// utility to distribute tokens to client applications (the portal's
    /// own "mint a token" action, and admin-privileged minting) — not part
    /// of the runtime hot path (which only calls `validate`). Use
    /// `issue_token_with_secret` instead when the caller has proven
    /// knowledge of a *specific* secret (extra key included) and the
    /// token should be tied to exactly that one.
    pub fn issue_token(&self, tenant_id: TenantId, sub: &str, ttl_secs: u64) -> Result<String, AuthError> {
        let secret = self
            .repo
            .get(&tenant_id)
            .ok_or(AuthError::UnknownTenant(tenant_id))?;
        self.sign(tenant_id, sub, ttl_secs, &secret)
    }

    /// Issues a token signed with exactly `secret` — the caller must have
    /// already verified `secret` is currently valid for `tenant_id` (e.g.
    /// via `verify_tenant_secret`); this method does not re-check.
    /// Tying the signature to the specific secret the caller proved
    /// knowledge of (rather than always signing with the primary one) is
    /// what makes `revoke_extra_key` actually mean something: revoking a
    /// key immediately fails `validate` for any token signed with it,
    /// without affecting tokens signed with a still-active different key.
    pub fn issue_token_with_secret(
        &self,
        tenant_id: TenantId,
        sub: &str,
        ttl_secs: u64,
        secret: &[u8],
    ) -> Result<String, AuthError> {
        self.sign(tenant_id, sub, ttl_secs, secret)
    }

    fn sign(&self, tenant_id: TenantId, sub: &str, ttl_secs: u64, secret: &[u8]) -> Result<String, AuthError> {
        let claims = Claims {
            tenant_id,
            sub: sub.to_string(),
            exp: now_unix() + ttl_secs,
        };
        let payload = serde_json::to_vec(&claims).map_err(|_| AuthError::Malformed)?;
        let payload_b64 = URL_SAFE_NO_PAD.encode(&payload);

        let mut mac = HmacSha256::new_from_slice(secret).map_err(|_| AuthError::Malformed)?;
        mac.update(payload_b64.as_bytes());
        let sig_b64 = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());

        Ok(format!("{payload_b64}.{sig_b64}"))
    }

    /// Validates a token against an *expected* tenant (the one announced
    /// in the AUTH frame envelope by the client).
    ///
    /// Verification order: format → secret lookup → HMAC signature
    /// (constant-time comparison via `Mac::verify_slice`, timing-attack
    /// resistant, tried against the primary secret then each extra key in
    /// turn) → expiry → consistency between the tenant encoded in the
    /// token and the tenant announced by the client.
    ///
    /// No longer strict O(1) now that a tenant can have extra keys: it's
    /// O(k) in however many currently-active secrets (primary + extra)
    /// this tenant has, since the token carries no key identifier telling
    /// `validate` which one to check first — an accepted trade-off for a
    /// tenant's realistically small (single-digit to low tens) key count,
    /// not a claim this stays O(1) forever.
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

        let primary = self.repo.get(&claims.tenant_id).map(|r| r.clone());
        let extras = self.extra.get_all_secrets(&claims.tenant_id);
        if primary.is_none() && extras.is_empty() {
            return Err(AuthError::UnknownTenant(claims.tenant_id));
        }

        let sig = URL_SAFE_NO_PAD
            .decode(sig_b64)
            .map_err(|_| AuthError::Malformed)?;

        let verifies_with = |secret: &[u8]| -> bool {
            let Ok(mut mac) = HmacSha256::new_from_slice(secret) else { return false };
            mac.update(payload_b64.as_bytes());
            mac.verify_slice(&sig).is_ok()
        };

        let signature_valid = primary.as_deref().is_some_and(verifies_with)
            || extras.iter().any(|secret| verifies_with(secret));
        if !signature_valid {
            return Err(AuthError::BadSignature);
        }

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

    #[test]
    fn extra_key_secret_verifies_alongside_primary() {
        let auth = TokenService::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"primary-secret".to_vec());
        auth.add_extra_key(tenant, "pk_extra1", b"extra-secret".to_vec());

        assert!(auth.verify_tenant_secret(tenant, b"primary-secret"));
        assert!(auth.verify_tenant_secret(tenant, b"extra-secret"));
        assert!(!auth.verify_tenant_secret(tenant, b"not-a-real-secret"));
    }

    #[test]
    fn token_signed_with_extra_key_validates() {
        let auth = TokenService::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"primary-secret".to_vec());
        auth.add_extra_key(tenant, "pk_extra1", b"extra-secret".to_vec());

        let token = auth
            .issue_token_with_secret(tenant, "user-1", 3600, b"extra-secret")
            .unwrap();
        let claims = auth.validate(tenant, &token).unwrap();
        assert_eq!(claims.sub, "user-1");
    }

    #[test]
    fn revoking_one_extra_key_only_invalidates_tokens_signed_with_it() {
        let auth = TokenService::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"primary-secret".to_vec());
        auth.add_extra_key(tenant, "pk_a", b"secret-a".to_vec());
        auth.add_extra_key(tenant, "pk_b", b"secret-b".to_vec());

        let token_a = auth.issue_token_with_secret(tenant, "user-a", 3600, b"secret-a").unwrap();
        let token_b = auth.issue_token_with_secret(tenant, "user-b", 3600, b"secret-b").unwrap();
        let primary_token = auth.issue_token(tenant, "user-primary", 3600).unwrap();

        assert!(auth.revoke_extra_key(tenant, "pk_a"));

        assert_eq!(auth.validate(tenant, &token_a), Err(AuthError::BadSignature));
        assert!(auth.validate(tenant, &token_b).is_ok());
        assert!(auth.validate(tenant, &primary_token).is_ok());
        assert!(!auth.verify_tenant_secret(tenant, b"secret-a"));
        assert!(auth.verify_tenant_secret(tenant, b"secret-b"));
    }

    #[test]
    fn revoke_extra_key_returns_false_when_not_found() {
        let auth = TokenService::new();
        let tenant = Uuid::from_u128(1);
        assert!(!auth.revoke_extra_key(tenant, "pk_never_added"));
    }

    #[test]
    fn revoking_tenant_also_revokes_its_extra_keys() {
        let auth = TokenService::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"primary-secret".to_vec());
        auth.add_extra_key(tenant, "pk_a", b"secret-a".to_vec());

        let token_a = auth.issue_token_with_secret(tenant, "user-a", 3600, b"secret-a").unwrap();
        auth.revoke_tenant(tenant);

        assert_eq!(auth.validate(tenant, &token_a), Err(AuthError::UnknownTenant(tenant)));
        assert!(!auth.verify_tenant_secret(tenant, b"secret-a"));
    }
}
