//! # PushJob
//!
//! **Action:** Data shape for a message to push through a `PushPort` when
//! no socket subscriber is connected.
//! **Input:** N/A (data type + constructor).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`.

use crate::entities::ChannelKey::TenantId;

#[derive(Debug, Clone)]
pub struct PushJob {
    pub tenant_id: TenantId,
    pub channel_id: String,
    pub payload: String,
    /// Push registration tokens (or topic names) of the recipients.
    /// Resolved upstream (tenant/channel → device tokens mapping,
    /// typically in a database): this module only handles HTTP dispatch.
    pub target_tokens: Vec<String>,
}

pub fn build_push_job(
    tenant_id: TenantId,
    channel_id: &str,
    payload: &str,
    target_tokens: Vec<String>,
) -> PushJob {
    PushJob {
        tenant_id,
        channel_id: channel_id.to_string(),
        payload: payload.to_string(),
        target_tokens,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn build_push_job_copies_fields() {
        let tenant = Uuid::from_u128(1);
        let job = build_push_job(tenant, "room-1", "hello", vec!["device-token".into()]);
        assert_eq!(job.tenant_id, tenant);
        assert_eq!(job.channel_id, "room-1");
        assert_eq!(job.payload, "hello");
        assert_eq!(job.target_tokens, vec!["device-token".to_string()]);
    }
}
