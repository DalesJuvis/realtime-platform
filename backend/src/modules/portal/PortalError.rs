//! # PortalError
//!
//! **Action:** Error type shared across every portal usecase — mapped to
//! an HTTP status + code by each controller.
//! **Dependencies:** `axum`, `sqlx`.

use axum::http::StatusCode;

#[derive(Debug, thiserror::Error)]
pub enum PortalError {
    #[error("tenant_id/secret pair does not match a registered tenant")]
    InvalidTenantSecret,
    #[error("email is already registered")]
    EmailAlreadyRegistered,
    #[error("invalid email or password")]
    InvalidCredentials,
    #[error("no key pair found for this tenant yet — rotate to generate one")]
    KeyPairNotFound,
    #[error("template not found")]
    TemplateNotFound,
    #[error("channel_id exceeds 24 bytes")]
    ChannelIdTooLong,
    #[error("payload exceeds 211 bytes for a single broadcast — split it into multiple sends")]
    PayloadTooLarge,
    #[error("rate limit exceeded for this tenant")]
    RateLimited,
    #[error("storage error: {0}")]
    Storage(#[from] sqlx::Error),
}

impl PortalError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            PortalError::InvalidTenantSecret => StatusCode::UNAUTHORIZED,
            PortalError::EmailAlreadyRegistered => StatusCode::CONFLICT,
            PortalError::InvalidCredentials => StatusCode::UNAUTHORIZED,
            PortalError::KeyPairNotFound => StatusCode::NOT_FOUND,
            PortalError::TemplateNotFound => StatusCode::NOT_FOUND,
            PortalError::ChannelIdTooLong | PortalError::PayloadTooLarge => StatusCode::BAD_REQUEST,
            PortalError::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            PortalError::Storage(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            PortalError::InvalidTenantSecret => "INVALID_TENANT_SECRET",
            PortalError::EmailAlreadyRegistered => "EMAIL_ALREADY_REGISTERED",
            PortalError::InvalidCredentials => "INVALID_CREDENTIALS",
            PortalError::KeyPairNotFound => "KEY_PAIR_NOT_FOUND",
            PortalError::TemplateNotFound => "TEMPLATE_NOT_FOUND",
            PortalError::ChannelIdTooLong => "CHANNEL_ID_TOO_LONG",
            PortalError::PayloadTooLarge => "PAYLOAD_TOO_LARGE",
            PortalError::RateLimited => "RATE_LIMITED",
            PortalError::Storage(_) => "STORAGE_ERROR",
        }
    }
}
