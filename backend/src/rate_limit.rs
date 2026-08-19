//! `rate_limit.rs` — Anti-abus par Token Bucket, O(1), à deux niveaux
//! (roadmap "Rate Limiting & Anti-Abus").
//!
//! Deux seaux vérifiés à chaque frame reçu :
//! - **par session** : un socket ne peut pas dépasser son propre débit,
//!   quel que soit le tenant — protège contre un client individuel
//!   compromis ou buggé (boucle infinie de PUB, par exemple) ;
//! - **par tenant** : agrège tous les sockets d'un même tenant — protège
//!   le service contre un tenant entier qui inonderait le système via de
//!   multiples connexions simultanées.
//!
//! `check()` est O(1) amorti : un lookup `DashMap` + quelques opérations
//! flottantes, sans allocation ni tâche de fond dédiée (le rechargement
//! du seau est calculé paresseusement à chaque appel).

use std::time::Instant;

use dashmap::DashMap;
use serde::{Deserialize, Serialize};

use crate::state::{SessionId, TenantId};

/// Seau à jetons classique : `capacity` jetons max, rechargés au débit
/// `refill_per_sec`. Chaque frame traité consomme 1 jeton.
struct TokenBucket {
    capacity: f64,
    tokens: f64,
    refill_per_sec: f64,
    last_refill: Instant,
}

impl TokenBucket {
    fn new(capacity: u32, refill_per_sec: u32) -> Self {
        Self {
            capacity: capacity as f64,
            tokens: capacity as f64,
            refill_per_sec: refill_per_sec as f64,
            last_refill: Instant::now(),
        }
    }

    /// Tente de consommer 1 jeton. Recharge d'abord le seau au prorata du
    /// temps écoulé depuis le dernier appel — pas d'horloge globale à
    /// synchroniser, coût constant indépendant du nombre de seaux gérés.
    fn try_consume(&mut self) -> bool {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        self.last_refill = now;
        self.tokens = (self.tokens + elapsed * self.refill_per_sec).min(self.capacity);

        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

/// Configuration des limites. Valeurs par défaut raisonnables pour un
/// canal de notifications temps réel ; à terme, ajustable par tenant via
/// l'Admin API (roadmap "Gestion des clés d'API & Dynamic Tenant
/// Management") plutôt que figé au démarrage du process comme ici.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub session_capacity: u32,
    pub session_refill_per_sec: u32,
    pub tenant_capacity: u32,
    pub tenant_refill_per_sec: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            session_capacity: 20,
            session_refill_per_sec: 10,
            tenant_capacity: 2_000,
            tenant_refill_per_sec: 500,
        }
    }
}

/// Registre des seaux — un par session, un par tenant — dans des
/// `DashMap` pour un accès concurrent lock-free (sharded), cohérent avec
/// le reste de `state.rs`. `overrides` permet à l'Admin API (`admin.rs`)
/// d'ajuster les quotas d'un tenant précis à chaud, sans redémarrage.
pub struct RateLimiter {
    default_config: RateLimitConfig,
    overrides: DashMap<TenantId, RateLimitConfig>,
    per_session: DashMap<SessionId, TokenBucket>,
    per_tenant: DashMap<TenantId, TokenBucket>,
}

impl RateLimiter {
    pub fn new(default_config: RateLimitConfig) -> Self {
        Self {
            default_config,
            overrides: DashMap::new(),
            per_session: DashMap::new(),
            per_tenant: DashMap::new(),
        }
    }

    fn config_for(&self, tenant_id: TenantId) -> RateLimitConfig {
        self.overrides
            .get(&tenant_id)
            .map(|c| *c)
            .unwrap_or(self.default_config)
    }

    /// Applique des quotas spécifiques à un tenant, effectifs
    /// immédiatement (le seau tenant existant est réinitialisé pour
    /// refléter la nouvelle config dès le prochain `check`). Destiné à
    /// être appelé par l'Admin API.
    ///
    /// Note : les seaux *session* déjà créés pour ce tenant conservent
    /// leur config d'origine jusqu'à la fin de la connexion — seul le
    /// seau agrégé par tenant est immédiatement affecté. Acceptable pour
    /// des sessions temps réel de durée de vie courte à moyenne ; à
    /// revoir si des connexions de très longue durée sont attendues.
    pub fn set_tenant_limits(&self, tenant_id: TenantId, config: RateLimitConfig) {
        self.overrides.insert(tenant_id, config);
        self.per_tenant.remove(&tenant_id);
    }

    /// Retire la configuration spécifique d'un tenant, qui retombe sur
    /// les quotas par défaut au prochain `check`.
    pub fn clear_tenant_limits(&self, tenant_id: TenantId) {
        self.overrides.remove(&tenant_id);
        self.per_tenant.remove(&tenant_id);
    }

    /// Vérifie et consomme un jeton aux deux niveaux. Retourne `true`
    /// seulement si les deux seaux (session ET tenant) l'acceptent — le
    /// premier des deux à être vide bloque le frame.
    ///
    /// Note : le seau tenant est indexé sur le `TenantId` *annoncé dans
    /// l'enveloppe du frame*, disponible avant même la validation AUTH —
    /// volontaire, pour bloquer un flood pré-authentification. Le
    /// contrepoint est qu'un attaquant peut forger des `TenantId`
    /// aléatoires pour obtenir un seau "jetable" à chaque fois. Un
    /// durcissement possible (TODO) : limiter aussi par adresse IP au
    /// niveau de l'acceptation du socket, en amont du parsing de frame.
    pub fn check(&self, session_id: SessionId, tenant_id: TenantId) -> bool {
        let cfg = self.config_for(tenant_id);

        let session_ok = self
            .per_session
            .entry(session_id)
            .or_insert_with(|| TokenBucket::new(cfg.session_capacity, cfg.session_refill_per_sec))
            .try_consume();

        let tenant_ok = self
            .per_tenant
            .entry(tenant_id)
            .or_insert_with(|| TokenBucket::new(cfg.tenant_capacity, cfg.tenant_refill_per_sec))
            .try_consume();

        session_ok && tenant_ok
    }

    /// À appeler à la fermeture d'une session pour ne pas faire grossir
    /// indéfiniment `per_session` avec des seaux morts. Le seau tenant
    /// n'est volontairement jamais retiré ici : il doit survivre à la
    /// déconnexion/reconnexion de sockets individuels du même tenant.
    pub fn drop_session(&self, session_id: SessionId) {
        self.per_session.remove(&session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn allows_burst_up_to_capacity_then_blocks() {
        let limiter = RateLimiter::new(RateLimitConfig {
            session_capacity: 3,
            session_refill_per_sec: 1,
            tenant_capacity: 100,
            tenant_refill_per_sec: 100,
        });
        let session = Uuid::from_u128(1);
        let tenant = Uuid::from_u128(1);

        assert!(limiter.check(session, tenant));
        assert!(limiter.check(session, tenant));
        assert!(limiter.check(session, tenant));
        // 4e frame dans la même fraction de seconde : seau session vide.
        assert!(!limiter.check(session, tenant));
    }

    #[test]
    fn tenant_bucket_shared_across_sessions() {
        let limiter = RateLimiter::new(RateLimitConfig {
            session_capacity: 100,
            session_refill_per_sec: 100,
            tenant_capacity: 2,
            tenant_refill_per_sec: 1,
        });
        let tenant = Uuid::from_u128(1);
        let session_a = Uuid::from_u128(1);
        let session_b = Uuid::from_u128(2);

        assert!(limiter.check(session_a, tenant));
        assert!(limiter.check(session_b, tenant));
        // Seau tenant épuisé même si chaque session a encore du budget.
        assert!(!limiter.check(session_a, tenant));
    }

    #[test]
    fn refills_over_time() {
        let limiter = RateLimiter::new(RateLimitConfig {
            session_capacity: 1,
            session_refill_per_sec: 100, // recharge rapide pour le test
            tenant_capacity: 100,
            tenant_refill_per_sec: 100,
        });
        let session = Uuid::from_u128(1);
        let tenant = Uuid::from_u128(1);

        assert!(limiter.check(session, tenant));
        assert!(!limiter.check(session, tenant));
        std::thread::sleep(std::time::Duration::from_millis(20));
        assert!(limiter.check(session, tenant));
    }

    #[test]
    fn tenant_override_applies_immediately() {
        let limiter = RateLimiter::new(RateLimitConfig {
            session_capacity: 100,
            session_refill_per_sec: 100,
            tenant_capacity: 100,
            tenant_refill_per_sec: 100,
        });
        let tenant = Uuid::from_u128(1);
        let session = Uuid::from_u128(1);

        // Config par défaut généreuse : passe.
        assert!(limiter.check(session, tenant));

        // Un admin resserre drastiquement le quota de ce tenant.
        limiter.set_tenant_limits(
            tenant,
            RateLimitConfig {
                session_capacity: 100,
                session_refill_per_sec: 100,
                tenant_capacity: 1,
                tenant_refill_per_sec: 0,
            },
        );

        assert!(limiter.check(session, tenant)); // consomme le seul jeton du nouveau seau
        assert!(!limiter.check(session, tenant)); // seau tenant épuisé, pas de recharge

        limiter.clear_tenant_limits(tenant);
        assert!(limiter.check(session, tenant)); // retombe sur la config par défaut généreuse
    }

    #[test]
    fn drop_session_frees_its_bucket() {
        let limiter = RateLimiter::new(RateLimitConfig {
            session_capacity: 1,
            session_refill_per_sec: 1,
            tenant_capacity: 100,
            tenant_refill_per_sec: 100,
        });
        let session = Uuid::from_u128(1);
        let tenant = Uuid::from_u128(1);
        assert!(limiter.check(session, tenant));
        assert!(!limiter.check(session, tenant));
        limiter.drop_session(session);
        // Nouveau seau recréé plein après le drop.
        assert!(limiter.check(session, tenant));
    }
}
