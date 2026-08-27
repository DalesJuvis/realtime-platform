//! # PortalAuthService
//!
//! **Action:** Password hashing/verification (argon2) and portal session
//! token issue/validation — a separate credential space from both the
//! Admin API's static token and a tenant's per-frame HMAC client tokens
//! (`auth::services::TokenService`). Session tokens use the same compact
//! format as `TokenService` (`base64url(payload).base64url(HMAC-SHA256(...))`)
//! but signed with this server's own `PORTAL_SESSION_SECRET`, not a
//! per-tenant secret — this authenticates "this portal user is who they
//! say they are", a different concern from "this WS/TCP frame belongs to
//! tenant X".
//! **Dependencies:** `argon2`, `hmac`, `sha2`, `base64`, `entities::PortalSession`.

use std::time::{SystemTime, UNIX_EPOCH};

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, SaltString};
use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::entities::PortalSession::PortalSession;
use crate::entities::TenantUser::TenantUser;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PortalAuthError {
    #[error("invalid email or password")]
    InvalidCredentials,
    #[error("malformed session token")]
    Malformed,
    #[error("invalid session signature")]
    BadSignature,
    #[error("session expired")]
    Expired,
}

pub struct PortalAuthService {
    session_secret: Vec<u8>,
}

impl PortalAuthService {
    pub fn new(session_secret: impl Into<Vec<u8>>) -> Self {
        Self {
            session_secret: session_secret.into(),
        }
    }

    pub fn hash_password(&self, password: &str) -> Result<String, PortalAuthError> {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|_| PortalAuthError::InvalidCredentials)
    }

    /// Constant-time by construction: `argon2::verify_password` compares digests, not raw bytes.
    pub fn verify_password(&self, password: &str, hash: &str) -> bool {
        let Ok(parsed) = PasswordHash::new(hash) else {
            return false;
        };
        Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()
    }

    pub fn issue_session(&self, user: &TenantUser, ttl_secs: u64) -> Result<String, PortalAuthError> {
        let claims = PortalSession {
            user_id: user.id,
            tenant_id: user.tenant_id,
            email: user.email.clone(),
            exp: now_unix() + ttl_secs,
        };
        let payload = serde_json::to_vec(&claims).map_err(|_| PortalAuthError::Malformed)?;
        let payload_b64 = URL_SAFE_NO_PAD.encode(&payload);

        let mut mac =
            HmacSha256::new_from_slice(&self.session_secret).map_err(|_| PortalAuthError::Malformed)?;
        mac.update(payload_b64.as_bytes());
        let sig_b64 = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());

        Ok(format!("{payload_b64}.{sig_b64}"))
    }

    pub fn validate_session(&self, token: &str) -> Result<PortalSession, PortalAuthError> {
        let (payload_b64, sig_b64) = token.split_once('.').ok_or(PortalAuthError::Malformed)?;

        let payload = URL_SAFE_NO_PAD
            .decode(payload_b64)
            .map_err(|_| PortalAuthError::Malformed)?;
        let claims: PortalSession = serde_json::from_slice(&payload).map_err(|_| PortalAuthError::Malformed)?;

        let sig = URL_SAFE_NO_PAD
            .decode(sig_b64)
            .map_err(|_| PortalAuthError::Malformed)?;

        let mut mac =
            HmacSha256::new_from_slice(&self.session_secret).map_err(|_| PortalAuthError::Malformed)?;
        mac.update(payload_b64.as_bytes());
        mac.verify_slice(&sig).map_err(|_| PortalAuthError::BadSignature)?;

        if claims.exp < now_unix() {
            return Err(PortalAuthError::Expired);
        }

        Ok(claims)
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

    fn make_user() -> TenantUser {
        TenantUser {
            id: Uuid::from_u128(1),
            tenant_id: Uuid::from_u128(2),
            email: "merchant@example.com".to_string(),
            password_hash: String::new(),
            created_at: chrono::Utc::now(),
        }
    }

    #[test]
    fn password_roundtrip() {
        let auth = PortalAuthService::new(b"session-secret".to_vec());
        let hash = auth.hash_password("correct horse battery staple").unwrap();
        assert!(auth.verify_password("correct horse battery staple", &hash));
        assert!(!auth.verify_password("wrong password", &hash));
    }

    #[test]
    fn session_roundtrip() {
        let auth = PortalAuthService::new(b"session-secret".to_vec());
        let user = make_user();
        let token = auth.issue_session(&user, 3600).unwrap();
        let claims = auth.validate_session(&token).unwrap();
        assert_eq!(claims.user_id, user.id);
        assert_eq!(claims.tenant_id, user.tenant_id);
        assert_eq!(claims.email, user.email);
    }

    #[test]
    fn rejects_expired_session() {
        let auth = PortalAuthService::new(b"session-secret".to_vec());
        let token = auth.issue_session(&make_user(), 0).unwrap();
        std::thread::sleep(std::time::Duration::from_secs(1));
        assert_eq!(auth.validate_session(&token), Err(PortalAuthError::Expired));
    }

    #[test]
    fn rejects_tampered_signature() {
        let auth = PortalAuthService::new(b"session-secret".to_vec());
        let mut token = auth.issue_session(&make_user(), 3600).unwrap();
        token.push('x');
        assert_eq!(auth.validate_session(&token), Err(PortalAuthError::BadSignature));
    }
}
