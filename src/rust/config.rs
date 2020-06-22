use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;
use serde_json::Value;
use serde::Deserialize;
use js_sys::Error;
use tera::Context;
use crate::router::{Route, find_route};

fn default_templates_prefix() -> String {
    "templates".to_string()
}

fn default_template() -> String {
    "main.jinja".to_string()
}

#[wasm_bindgen]
#[derive(Debug, Deserialize)]
pub struct Config {
    #[serde(skip)]
    url: String,
    upstream: String,
    routes: Vec<Route>,
    #[serde(default = "default_template")]
    default_template: String,
    #[serde(default = "default_templates_prefix")]
    template_prefix: String,
    #[serde(skip)]
    template_root: Option<String>,
    #[serde(skip)]
    template_root_default: String,
    context: Option<BTreeMap<String, Value>>,
}

#[wasm_bindgen]
impl Config {
    #[wasm_bindgen(getter)]
    pub fn url(&self) -> String { self.url.clone() }

    #[wasm_bindgen(getter)]
    pub fn upstream(&self) -> String { self.upstream.clone() }

    #[wasm_bindgen(getter)]
    pub fn routes(&self) -> JsValue {
        JsValue::from_serde(&self.routes).unwrap()
    }

    #[wasm_bindgen(getter)]
    pub fn template_prefix(&self) -> String { self.template_prefix.clone() }

    #[wasm_bindgen(getter)]
    pub fn template_root(&self) -> String {
        match self.template_root.clone() {
            Some(v) => v,
            None => self.template_root_default.clone(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn context(&self) -> JsValue {
        JsValue::from_serde(&self.context).unwrap()
    }

    pub fn find_route(&self, path: String) -> JsValue {
        let route_match = find_route(&self.routes, &path);
        JsValue::from_serde(&route_match).unwrap()
    }
}

impl Config {
    pub fn add_context(&self, target: &mut Context) {
        if let Some(context) = &self.context {
            for (key, value) in context {
                target.insert(key, &value);
            }
        }
    }
}

#[wasm_bindgen]
pub fn parse_config(s: String, url: String, default_template_root: String) -> Result<Config, JsValue> {
    let mut config: Config = match serde_yaml::from_str(&s) {
        Err(e) => return err!("Error loading config: {}", e),
        Ok(config) => config
    };
    config.url = url;
    config.template_root_default = default_template_root;
    Ok(config)
}
