//! # WorkspaceProfileDto
//!
//! **Action:** Request/response bodies for the Settings → Profile tab
//! (`/api/v1/portal/profile*`).

use serde::{Deserialize, Serialize};

use crate::entities::WorkspaceProfile::WorkspaceProfile;

#[derive(Serialize)]
pub struct ProfileResponseDto {
    pub name: Option<String>,
    pub website_url: Option<String>,
    pub logo_data_uri: Option<String>,
}

impl From<WorkspaceProfile> for ProfileResponseDto {
    fn from(profile: WorkspaceProfile) -> Self {
        Self {
            name: profile.name,
            website_url: profile.website_url,
            logo_data_uri: profile.logo_data_uri,
        }
    }
}

/// `None` means "leave this field unchanged" — matches
/// `WorkspaceProfileRepository::update`'s `COALESCE`-based partial update.
#[derive(Deserialize)]
pub struct UpdateProfileDto {
    pub name: Option<String>,
    pub website_url: Option<String>,
}

/// `data_uri` is the full `data:image/png;base64,...` string the browser's
/// `FileReader` already produces client-side — no multipart parsing needed
/// server-side, just decode-and-validate.
#[derive(Deserialize)]
pub struct UploadLogoDto {
    pub data_uri: String,
}
