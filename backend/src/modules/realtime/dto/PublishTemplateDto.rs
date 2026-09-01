//! # PublishTemplateDto
//!
//! **Action:** Request/response bodies for `POST /api/v1/messages/template`
//! — the `template_id` counterpart of `POST /api/v1/messages`'s raw
//! `payload`. Lets a client publish one of the tenant's saved templates
//! (see `modules::portal`'s Templating page) without ever seeing the
//! template's own text or the tenant's full template list — it only needs
//! the `template_id` and whatever `{{variable}}` values it wants filled
//! in. Same bearer client-token auth as `POST /api/v1/messages`, never the
//! raw tenant secret.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct PublishTemplateDto {
    pub tenant_id: Uuid,
    pub channel_id: String,
    pub template_id: Uuid,
    #[serde(default)]
    pub variables: HashMap<String, String>,
}

#[derive(Serialize)]
pub struct PublishTemplateResponseDto {
    pub published: bool,
}
