//! # portal
//!
//! **Action:** Tenant-facing self-service API — email/password portal
//! accounts (distinct from both the Admin API's static token and a
//! tenant's per-frame HMAC client tokens), a live "devices" (connected
//! sessions) view, and server-side client-token minting.
//! **Dependencies:** `modules::auth`, `modules::realtime`, `modules::metrics`, `sqlx`.

pub mod PortalContext;
pub mod PortalError;
pub mod controllers;
pub mod dto;
pub mod middleware;
pub mod repositories;
pub mod routes;
pub mod services;
pub mod usecases;
