extern crate cfg_if;
extern crate wasm_bindgen;
extern crate tera;

#[macro_use]
extern crate serde_derive;

use wasm_bindgen::prelude::*;
use tera::{Tera, Context};
use serde_json::Value;

mod utils;

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
    pub fn new(templates: &JsValue) -> Env
    {
        let templates_vec: Vec<Template> = templates.into_serde().unwrap();
        let mut tera = Tera::default();
        tera.autoescape_on(vec![".html", ".html", ".xml", ".jinja"]);
        for t in templates_vec {
            tera.add_raw_template(&t.name, &t.content).unwrap();
        }
        Env { tera }
    }

    pub fn render(&mut self, template_name: &str, context_json: &str) -> String {
        let context_value: Value = match serde_json::from_str(context_json) {
            Err(e) => return format!("serde from JSON string error: {:?}", e),
            Ok(v) => v,
        };
        let template_context = match Context::from_value(context_value) {
            Err(e) => return format!("context from serde error: {:?}", e),
            Ok(v) => v,
        };
        match self.tera.render(template_name, &template_context) {
            Err(e) => format!("rendering error: {:?}", e),
            Ok(v) => v,
        }
    }
}
