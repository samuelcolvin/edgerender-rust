use std::collections::BTreeMap;
use std::fmt;
use serde_json::Value;
use serde::{Serialize, Deserialize};
use serde::ser::Serializer;
use serde::de::{Deserializer, Visitor, Error as SerdeError};
use regex::{Regex, Captures};
use lazy_static::lazy_static;

lazy_static! {
    static ref VARIABLE_REGEX: Regex = Regex::new(r"\{(?P<name>[a-zA-Z0-9_]+)?(?::(?P<regex>[^}]+))?\}").unwrap();
}

fn replace_variable(caps: &Captures) -> String {
    let regex = match caps.name("regex") {
        Some(m) => m.as_str(),
        None => r"[^{}/]+"
    };
    match caps.name("name") {
        Some(name) => format!(r"(?P<{}>{})", name.as_str(), regex),
        None => regex.to_string(),
    }
}

fn build_route_re(route_str: &str) -> Result<Regex, String> {
    let router_re_str = format!(r"^{}$", VARIABLE_REGEX.replace_all(route_str, replace_variable));
    match Regex::new(&router_re_str) {
        Err(e) => Err(format!("error parsing router regex: {}", e)),
        Ok(r) => Ok(r)
    }
}


pub fn default_template() -> String {
    "main.jinja".to_string()
}

pub fn default_context() -> BTreeMap<String, Value> {
    BTreeMap::new()
}

fn string_to_regex<'de, D>(deserializer: D) -> Result<Regex, D::Error>
where
    D: Deserializer<'de>,
{
    struct StringVisitor;

    impl<'de> Visitor<'de> for StringVisitor {
        type Value = Regex;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("string")
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: SerdeError,
        {
            Ok(build_route_re(value).unwrap())
        }
    }

    deserializer.deserialize_any(StringVisitor)
}

fn regex_to_string<S>(regex: &Regex, s: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    s.serialize_str(&format!("{:?}", regex))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Route {
    #[serde(deserialize_with = "string_to_regex")]
    #[serde(serialize_with = "regex_to_string")]
    #[serde(rename = "match")]
    match_re: Regex,
    #[serde(default = "default_template")]
    template: String,
    endpoint: Option<String>,
    #[serde(default = "default_context")]
    context: BTreeMap<String, Value>,
}


// pub fn find_route(routes: &Vec<>)
