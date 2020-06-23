use crate::config::Config;
use crate::router::RouteMatch;
use js_sys::{Error, SyntaxError};
use serde::Deserialize;
use serde_json::{to_string_pretty, Value as SerdeValue};
use std::collections::HashMap;
use tera::{Context, Result as TeraResult, Tera};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
pub struct Template {
    name: String,
    content: String,
}

#[wasm_bindgen]
pub struct Env {
    tera: Tera,
}

#[wasm_bindgen]
impl Env {
    pub fn render(
        &self,
        config: &Config,
        route_match: &JsValue,
        upstream_json: Option<String>,
        response_status: u32,
        upstream: &JsValue,
    ) -> Result<String, JsValue> {
        let route_match_: RouteMatch = match route_match.into_serde() {
            Err(e) => return err!("route_match not a valid RouteMatch object: {:?}", e),
            Ok(v) => v,
        };
        let mut context = Context::new();
        config.add_context(&mut context);
        route_match_.add_context(&mut context);
        if let Some(s) = upstream_json {
            let context_value: SerdeValue = match serde_json::from_str(&s) {
                Err(e) => return err!("Error parsing context JSON: {:?}", e),
                Ok(v) => v,
            };
            context.insert("data", &context_value);
        } else {
            context.insert("data", &SerdeValue::Null);
        }

        context.insert("response_status", &response_status);
        let upstream_value: SerdeValue = match upstream.into_serde() {
            Err(e) => return err!("Error parsing upstream data: {:?}", e),
            Ok(v) => v,
        };
        context.insert("upstream", &upstream_value);

        let template_name = match route_match_.template {
            Some(v) => v,
            None => config.get_default_template(),
        };
        match self.tera.render(&template_name, &context) {
            Err(e) => err!("Error rendering template {}: {:?}", &template_name, e),
            Ok(v) => Ok(v),
        }
    }
}

fn to_json(obj: &SerdeValue, args: &HashMap<String, SerdeValue>) -> TeraResult<SerdeValue> {
    let pretty: bool = match args.get("pretty") {
        Some(v) => match v.as_bool() {
            Some(v_) => v_,
            _ => return Err("'pretty' argument must be a boolean".into()),
        },
        _ => false,
    };
    let s = match pretty {
        true => to_string_pretty(obj)?,
        false => obj.to_string(),
    };
    Ok(SerdeValue::from(s))
}

cfg_if::cfg_if! {
    // When the `console_error_panic_hook` feature is enabled, we can call the
    // `set_panic_hook` function at least once during initialization, and then
    // we will get better error messages if our code ever panics.
    //
    // For more details see
    // https://github.com/rustwasm/console_error_panic_hook#readme
    if #[cfg(feature = "console_error_panic_hook")] {
        pub use console_error_panic_hook::set_once as set_panic_hook;
    } else {
        #[inline]
        pub fn set_panic_hook() {}
    }
}

#[wasm_bindgen]
pub fn create_env(templates: &JsValue) -> Result<Env, JsValue> {
    set_panic_hook();

    let templates_vec: Vec<Template> = match templates.into_serde() {
        Err(e) => return err!("Error decoding templates: {}", e),
        Ok(v) => v,
    };
    let mut tera = Tera::default();
    tera.register_filter("json", to_json);
    tera.autoescape_on(vec![".html", ".html", ".xml", ".jinja", ".jinja2"]);
    for t in templates_vec {
        match tera.add_raw_template(&t.name, &t.content) {
            Err(e) => return Err(SyntaxError::new(&format!("Invalid template {}: {:?}", t.name, e)).into()),
            Ok(v) => v,
        };
    }
    Ok(Env { tera })
}
