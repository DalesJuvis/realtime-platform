//! `realtime-sdk` — Client Rust pour le moteur de notification et
//! messagerie temps réel multi-tenant (protocole binaire 256 octets).
//!
//! Voir `README.md` pour le démarrage rapide. API volontairement proche
//! du SDK TypeScript (`sdk-typescript/`) pour une expérience cohérente
//! entre les deux : mêmes opérations (`publish`, `subscribe`, `unicast`,
//! `replay`, `publish_template`), mêmes limitations documentées (pas
//! d'UNSUB réseau, motifs non supportés par REPLAY, ID utilisateur ≤ 24
//! octets pour UNICAST).

pub mod client;
pub mod protocol;

pub use client::{ClientConfig, ClientError, RealtimeClient, RealtimeMessage};
pub use protocol::{Opcode, ProtocolError};
