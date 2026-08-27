//! # UploadLogoUseCase
//!
//! **Action:** Validates and stores a workspace logo.
//! **Input:** `TenantId` (from the validated portal session), `UploadLogoDto`.
//! **Output:** `ProfileResponseDto`.
//! **Side effects:** Overwrites `workspace_profile.logo_data_uri`.
//! **Dependencies:** `base64`, `portal::repositories::WorkspaceProfileRepository`.
//!
//! Validation happens server-side (never trust a client-declared MIME
//! type or the browser's own `accept=""` filtering) by decoding the
//! base64 payload and checking its actual byte length, and by requiring
//! the declared MIME prefix to be one of the three allowed image types.

use base64::{engine::general_purpose::STANDARD, Engine as _};

use crate::entities::ChannelKey::TenantId;
use crate::modules::portal::dto::WorkspaceProfileDto::{ProfileResponseDto, UploadLogoDto};
use crate::modules::portal::PortalContext::PortalContext;
use crate::modules::portal::PortalError::PortalError;

const MAX_LOGO_BYTES: usize = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES: [&str; 3] = ["image/png", "image/jpeg", "image/webp"];

pub async fn execute(ctx: &PortalContext, tenant_id: TenantId, dto: UploadLogoDto) -> Result<ProfileResponseDto, PortalError> {
    let (header, data) = dto
        .data_uri
        .split_once(",")
        .ok_or_else(|| PortalError::InvalidLogo("malformed data URI".to_string()))?;

    let mime = header
        .strip_prefix("data:")
        .and_then(|h| h.split(';').next())
        .ok_or_else(|| PortalError::InvalidLogo("malformed data URI".to_string()))?;

    if !ALLOWED_MIME_TYPES.contains(&mime) {
        return Err(PortalError::InvalidLogo(format!(
            "unsupported image type {mime} — use PNG, JPEG, or WebP"
        )));
    }

    let decoded = STANDARD
        .decode(data)
        .map_err(|_| PortalError::InvalidLogo("malformed base64 payload".to_string()))?;

    if decoded.len() > MAX_LOGO_BYTES {
        return Err(PortalError::InvalidLogo(format!(
            "logo is {} bytes, max is {MAX_LOGO_BYTES} bytes (2 MB)",
            decoded.len()
        )));
    }

    ctx.workspace_profile.update_logo(tenant_id, &dto.data_uri).await?;
    let profile = ctx.workspace_profile.get(tenant_id).await?;
    Ok(ProfileResponseDto::from(profile))
}
