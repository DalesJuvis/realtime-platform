//! # TemplateDto
//!
//! **Action:** Request/response bodies for the Templating page's CRUD
//! routes (`/api/v1/portal/templates*`).

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::entities::MessageTemplate::MessageTemplate;

#[derive(Deserialize)]
pub struct SaveTemplateDto {
    pub name: String,
    pub body: String,
}

#[derive(Serialize)]
pub struct TemplateResponseDto {
    pub id: Uuid,
    pub name: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<MessageTemplate> for TemplateResponseDto {
    fn from(template: MessageTemplate) -> Self {
        Self {
            id: template.id,
            name: template.name,
            body: template.body,
            created_at: template.created_at.to_rfc3339(),
            updated_at: template.updated_at.to_rfc3339(),
        }
    }
}
