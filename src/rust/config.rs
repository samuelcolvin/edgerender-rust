use crate::router::{find_route, Route};
use lazy_static::lazy_static;
use regex::Regex;
use js_sys::Error;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
use tera::Context;
use wasm_bindgen::prelude::*;

lazy_static! {
    static ref HTTP_REGEX: Regex = Regex::new(r"^https?://").unwrap();
}

fn default_templates_prefix() -> String {
    "templates".to_string()
}

fn default_template() -> String {
    "main.jinja".to_string()
}

fn default_static() -> String {
    "/static/".to_string()
}

#[wasm_bindgen]
#[derive(Debug, Deserialize)]
pub struct Config {
    #[serde(skip)]
    url: String,
    upstream_root: String,
    routes: Vec<Route>,
    #[serde(default = "default_template")]
    default_template: String,
    #[serde(default = "default_templates_prefix")]
    template_prefix: String,
    #[serde(skip)]
    template_root: Option<String>,
    #[serde(skip)]
    config_origin: String,
    context: Option<BTreeMap<String, Value>>,
    #[serde(default = "default_static")]
    static_path_prefix: String,
    #[serde(default = "default_static")]
    static_upstream: String,
    #[serde(skip)]
    static_upstream_absolute: String,
}

#[wasm_bindgen]
impl Config {
    #[wasm_bindgen(getter)]
    pub fn url(&self) -> String {
        self.url.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn upstream_root(&self) -> String {
        self.upstream_root.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn routes(&self) -> JsValue {
        JsValue::from_serde(&self.routes).unwrap()
    }

    #[wasm_bindgen(getter)]
    pub fn default_template(&self) -> String {
        self.default_template.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn template_prefix(&self) -> String {
        self.template_prefix.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn template_root(&self) -> String {
        // replace with or_else
        match self.template_root.clone() {
            Some(v) => v,
            None => self.config_origin.clone(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn context(&self) -> JsValue {
        JsValue::from_serde(&self.context).unwrap()
    }

    #[wasm_bindgen(getter)]
    pub fn static_path_prefix(&self) -> String {
        self.static_path_prefix.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn static_upstream_absolute(&self) -> String {
        self.static_upstream_absolute.clone()
    }

    pub fn get_static_file(&self, pathname: String) -> Option<String> {
        if pathname.starts_with(&self.static_path_prefix) {
            let url = format!("{}{}", &self.static_upstream_absolute, &pathname[self.static_path_prefix.len()..]);
            Some(url)
        } else {
            None
        }
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

    pub fn get_default_template(&self) -> String {
        self.default_template.clone()
    }
}

#[wasm_bindgen]
pub fn parse_config(s: String, url: String, config_origin: String) -> Result<Config, JsValue> {
    let mut config: Config = match serde_yaml::from_str(&s) {
        Err(e) => return err!("Error loading config: {}", e),
        Ok(config) => config,
    };
    config.url = url;
    config.config_origin = config_origin;
    config.static_upstream_absolute = match HTTP_REGEX.is_match(&config.static_upstream) {
        true => config.static_upstream.clone(),
        false => format!("{}{}", config.config_origin, config.static_upstream)
    };
    Ok(config)
}
