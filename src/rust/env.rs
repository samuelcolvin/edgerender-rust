use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use js_sys::{Error, SyntaxError};
use serde::Deserialize;
use tera::{Tera, Context, Result as TeraResult};
use serde_json::{Value, to_string_pretty};
use crate::config::Config;
use crate::router::RouteMatch;

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
    pub fn render(&self, config: &Config, route_match: &JsValue, context_json: Option<String>) -> Result<String, JsValue> {
        let route_match_: RouteMatch = match route_match.into_serde() {
            Err(e) => return err!("route_match not a valid RouteMatch object: {:?}", e),
            Ok(v) => v,
        };
        let mut template_context;
        if let Some(s) = context_json {
            let context_value: Value = match serde_json::from_str(&s) {
                Err(e) => return err!("Error parsing context JSON: {:?}", e),
                Ok(v) => v,
            };
            template_context = match Context::from_value(context_value) {
                Err(e) => return err!("Error building tera context: {:?}", e),
                Ok(v) => v,
            };
        } else {
            template_context = Context::new();
        }
        config.add_context(&mut template_context);
        route_match_.add_context(&mut template_context);

        let template_name = match route_match_.template {
            Some(v) => v,
            None => config.get_default_template()
        };
        match self.tera.render(&template_name, &template_context) {
            Err(e) => err!("Error rendering template {}: {:?}", &template_name, e),
            Ok(v) => Ok(v),
        }
    }
}
//
// fn get_context(context_json: Option<&str>) -> Context{
//     if let Some(s) = context_json {
//         let context_value: Value = match serde_json::from_str(context_json) {
//             Err(e) => return err!("Error parsing context JSON: {:?}", e),
//             Ok(v) => v,
//         };
//         match Context::from_value(context_value) {
//             Err(e) => return err!("Error building tera context: {:?}", e),
//             Ok(v) => v,
//         }
//     } else {
//         Context::new()
//     }
// }

fn to_json(obj: &Value, args: &HashMap<String, Value>) -> TeraResult<Value> {
    let pretty: bool = match args.get("pretty") {
        Some(v) => match v.as_bool() {
            Some(v_) => v_,
            _ => return Err("'pretty' argument must be a boolean".into())
        },
        _ => false,
    };
    let s = match pretty {
        true => to_string_pretty(obj)?,
        false => obj.to_string(),
    };
    Ok(Value::from(s))
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
