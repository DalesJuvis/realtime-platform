//! # MessageTemplate
//!
//! **Action:** A tenant's saved, reusable message body for the Templating
//! page — `{{variable}}` placeholders are a frontend-only convention; the
//! backend treats `body` as opaque text.
//! **Input:** N/A (data type).
//! **Output:** N/A.
//! **Side effects:** None — pure data type.
//! **Dependencies:** `entities::ChannelKey`, `uuid`, `chrono`.

use std::collections::HashMap;
use uuid::Uuid;

use crate::entities::ChannelKey::TenantId;

#[derive(Debug, Clone)]
pub struct MessageTemplate {
    pub id: Uuid,
    pub tenant_id: TenantId,
    pub name: String,
    pub body: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl MessageTemplate {
    /// Fills in `{{variable}}` placeholders in `body` from `variables`,
    /// same convention the tenant-portal frontend uses to author them
    /// (see this struct's own doc comment: opaque text as far as storage
    /// is concerned, but a real interpolation step for a client that
    /// wants to publish a template by id rather than resolving it itself).
    /// A name with no matching entry in `variables` renders as an empty
    /// string; an unclosed `{{` is left as literal text rather than
    /// dropped, since this must never panic on a hand-typed template.
    /// No `regex` dependency — this repo keeps the backend binary small
    /// (see `entities::Frame::crc16_ccitt_false`'s own note on the same
    /// tradeoff), and the pattern is simple enough to scan by hand.
    pub fn render(&self, variables: &HashMap<String, String>) -> String {
        let mut out = String::with_capacity(self.body.len());
        let mut rest = self.body.as_str();

        while let Some(start) = rest.find("{{") {
            out.push_str(&rest[..start]);
            let after_open = &rest[start + 2..];
            match after_open.find("}}") {
                Some(end) => {
                    let name = after_open[..end].trim();
                    if let Some(value) = variables.get(name) {
                        out.push_str(value);
                    }
                    rest = &after_open[end + 2..];
                }
                None => {
                    out.push_str("{{");
                    rest = after_open;
                }
            }
        }
        out.push_str(rest);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn template(body: &str) -> MessageTemplate {
        MessageTemplate {
            id: Uuid::new_v4(),
            tenant_id: Uuid::new_v4(),
            name: "test".to_string(),
            body: body.to_string(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        }
    }

    #[test]
    fn fills_in_a_matching_variable() {
        let vars = HashMap::from([("name".to_string(), "Ada".to_string())]);
        assert_eq!(template("Hi {{name}}!").render(&vars), "Hi Ada!");
    }

    #[test]
    fn tolerates_inner_whitespace_like_the_frontend_does() {
        let vars = HashMap::from([("name".to_string(), "Ada".to_string())]);
        assert_eq!(template("Hi {{ name }}!").render(&vars), "Hi Ada!");
    }

    #[test]
    fn renders_a_missing_variable_as_empty_rather_than_leaving_the_placeholder() {
        assert_eq!(template("Hi {{name}}!").render(&HashMap::new()), "Hi !");
    }

    #[test]
    fn leaves_an_unclosed_placeholder_as_literal_text() {
        assert_eq!(template("Hi {{name, welcome!").render(&HashMap::new()), "Hi {{name, welcome!");
    }

    #[test]
    fn renders_a_template_with_no_placeholders_unchanged() {
        assert_eq!(template("no variables here").render(&HashMap::new()), "no variables here");
    }

    #[test]
    fn fills_multiple_variables() {
        let vars = HashMap::from([("name".to_string(), "Ada".to_string()), ("place".to_string(), "mio".to_string())]);
        assert_eq!(template("Hi {{name}}, welcome to {{place}}!").render(&vars), "Hi Ada, welcome to mio!");
    }
}
