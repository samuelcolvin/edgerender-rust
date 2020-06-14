extern crate cfg_if;
extern crate wasm_bindgen;
extern crate console_error_panic_hook;
extern crate tera;

#[macro_use]
extern crate serde_derive;

use wasm_bindgen::prelude::*;
use js_sys::{Error, SyntaxError};
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

macro_rules! err {
    ($msg:expr) => (
        Err(Error::new(&format!("{}", $msg)).into())
    );
    ($fmt:expr, $($arg:expr),+) => (
        Err(Error::new(&format!($fmt, $($arg),+)).into())
    );
}

#[wasm_bindgen]
impl Env {
    pub fn render(&mut self, template_name: &str, context_json: &str) -> Result<String, JsValue> {
        let context_value: Value = match serde_json::from_str(context_json) {
            Err(e) => return err!("Error parsing context JSON: {:?}", e),
            Ok(v) => v,
        };
        let template_context = match Context::from_value(context_value) {
            Err(e) => return err!("Error building tera context: {:?}", e),
            Ok(v) => v,
        };
        match self.tera.render(template_name, &template_context) {
            Err(e) => err!("Error rendering template {}: {:?}", template_name, e),
            Ok(v) => Ok(v),
        }
    }
}

#[wasm_bindgen]
pub fn create_env(templates: &JsValue) -> Result<Env, JsValue>
{
    console_error_panic_hook::set_once();

    let templates_vec: Vec<Template> = match templates.into_serde() {
        Err(e) => return err!("Error decoding templates: {}", e),
        Ok(v) => v,
    };
    let mut tera = Tera::default();
    tera.autoescape_on(vec![".html", ".html", ".xml", ".jinja", ".jinja2"]);
    for t in templates_vec {
        match tera.add_raw_template(&t.name, &t.content) {
            Err(e) => return Err(SyntaxError::new(&format!("Invalid template {}: {:?}", t.name, e)).into()),
            Ok(v) => v,
        };
    }
    Ok(Env { tera })
}
