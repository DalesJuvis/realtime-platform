//! `auth.rs` — Authentification multi-tenant par jeton signé HMAC-SHA256.
//!
//! Format du jeton (compact, volontairement plus simple qu'une lib JWT
//! complète pour éviter sa surface d'attaque classique, ex: confusion
//! d'algorithme `"alg": "none"`) :
//!
//! ```text
//! base64url(payload_json) "." base64url(HMAC-SHA256(payload_json, tenant_secret))
//! ```
//!
//! `payload_json = {"tenant_id": "<uuid>", "sub": "<id session/utilisateur>", "exp": <unix_ts>}`
//!
//! Le secret du tenant est retrouvé en **O(1)** via une `DashMap<TenantId,
//! Secret>` peuplée au démarrage (ou dynamiquement via `register_tenant`) :
//! la validation complète — lookup + vérification HMAC — ne dépend donc
//! jamais du nombre de tenants enregistrés (contrainte #2).

use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use dashmap::DashMap;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::state::TenantId;

type HmacSha256 = Hmac<Sha256>;

/// Erreurs de validation/émission de jeton.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AuthError {
    #[error("format de jeton invalide")]
    Malformed,
    #[error("tenant inconnu : {0}")]
    UnknownTenant(TenantId),
    #[error("signature invalide")]
    BadSignature,
    #[error("jeton expiré")]
    Expired,
    #[error("le tenant du jeton ({token}) ne correspond pas au tenant demandé ({requested})")]
    TenantMismatch { token: TenantId, requested: TenantId },
}

/// Claims décodées d'un jeton valide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub tenant_id: TenantId,
    pub sub: String,
    pub exp: u64,
}

/// Registre des secrets HMAC par tenant et logique de validation associée.
///
/// `DashMap` autorise l'ajout/retrait de tenants à chaud (ex: via une API
/// d'admin interne) sans redémarrer le service ni bloquer les validations
/// en cours pour les autres tenants.
pub struct AuthManager {
    secrets: DashMap<TenantId, Vec<u8>>,
}

impl AuthManager {
    pub fn new() -> Self {
        Self {
            secrets: DashMap::new(),
        }
    }

    /// Enregistre (ou remplace) le secret HMAC d'un tenant.
    pub fn register_tenant(&self, tenant_id: TenantId, secret: impl Into<Vec<u8>>) {
        self.secrets.insert(tenant_id, secret.into());
    }

    /// Révoque un tenant : toute validation ultérieure pour ce tenant
    /// échouera immédiatement avec `UnknownTenant`.
    pub fn revoke_tenant(&self, tenant_id: TenantId) {
        self.secrets.remove(&tenant_id);
    }

    /// Émet un jeton pour un tenant/sujet donné, valable `ttl_secs`
    /// secondes. Utilitaire côté serveur/CLI pour distribuer des jetons
    /// aux applications clientes — ne fait pas partie du chemin chaud
    /// runtime (celui-ci n'appelle que `validate`).
    pub fn issue_token(
        &self,
        tenant_id: TenantId,
        sub: &str,
        ttl_secs: u64,
    ) -> Result<String, AuthError> {
        let secret = self
            .secrets
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

    /// Valide un jeton pour un tenant *attendu* (celui annoncé dans
    /// l'enveloppe du frame AUTH par le client).
    ///
    /// Ordre de vérification : format → lookup secret (O(1)) → signature
    /// HMAC (comparaison en temps constant via `Mac::verify_slice`,
    /// résistante au timing attack) → expiration → cohérence entre le
    /// tenant encodé dans le jeton et le tenant annoncé par le client.
    ///
    /// Cette dernière vérification empêche un client de rejouer un jeton
    /// valide émis pour le tenant A en prétendant, dans l'enveloppe du
    /// frame, appartenir au tenant B.
    pub fn validate(&self, expected_tenant: TenantId, token: &str) -> Result<Claims, AuthError> {
        let (payload_b64, sig_b64) = token.split_once('.').ok_or(AuthError::Malformed)?;

        let payload = URL_SAFE_NO_PAD
            .decode(payload_b64)
            .map_err(|_| AuthError::Malformed)?;
        let claims: Claims = serde_json::from_slice(&payload).map_err(|_| AuthError::Malformed)?;

        let secret = self
            .secrets
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

impl Default for AuthManager {
    fn default() -> Self {
        Self::new()
    }
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("horloge système antérieure à UNIX_EPOCH")
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn issue_then_validate_roundtrip() {
        let auth = AuthManager::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"super-secret-key".to_vec());

        let token = auth.issue_token(tenant, "user-42", 3600).unwrap();
        let claims = auth.validate(tenant, &token).unwrap();
        assert_eq!(claims.tenant_id, tenant);
        assert_eq!(claims.sub, "user-42");
    }

    #[test]
    fn rejects_tampered_signature() {
        let auth = AuthManager::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"secret".to_vec());
        let mut token = auth.issue_token(tenant, "user-1", 3600).unwrap();
        token.push('x'); // corrompt la signature
        assert_eq!(auth.validate(tenant, &token), Err(AuthError::BadSignature));
    }

    #[test]
    fn rejects_expired_token() {
        let auth = AuthManager::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"secret".to_vec());
        let token = auth.issue_token(tenant, "user-1", 0).unwrap();
        std::thread::sleep(std::time::Duration::from_secs(1));
        assert_eq!(auth.validate(tenant, &token), Err(AuthError::Expired));
    }

    #[test]
    fn rejects_cross_tenant_replay() {
        let auth = AuthManager::new();
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
        let auth = AuthManager::new();
        let tenant = Uuid::from_u128(99);
        let err = auth.issue_token(tenant, "user-1", 3600).unwrap_err();
        assert_eq!(err, AuthError::UnknownTenant(tenant));
    }

    #[test]
    fn revoked_tenant_fails_validation() {
        let auth = AuthManager::new();
        let tenant = Uuid::from_u128(1);
        auth.register_tenant(tenant, b"secret".to_vec());
        let token = auth.issue_token(tenant, "user-1", 3600).unwrap();
        auth.revoke_tenant(tenant);
        assert_eq!(
            auth.validate(tenant, &token),
            Err(AuthError::UnknownTenant(tenant))
        );
    }
}
