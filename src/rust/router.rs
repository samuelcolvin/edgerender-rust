use std::collections::BTreeMap;
use std::fmt;
use serde_json::Value;
use serde::{Serialize, Deserialize};
use serde::ser::Serializer;
use serde::de::{Deserializer, Visitor, Error as SerdeError};
use regex::{Regex, Captures};
use tera::Context;
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
            if value.starts_with("/") {
                let router_re_str = format!(r"^{}$", VARIABLE_REGEX.replace_all(value, replace_variable));
                return Regex::new(&router_re_str).map_err(SerdeError::custom)
            } else {
                return Err(SerdeError::custom("route matches must start with a forward slash '/'"))
            }
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

fn default_response_status() -> u32 {
    200
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Route {
    #[serde(deserialize_with = "string_to_regex")]
    #[serde(serialize_with = "regex_to_string")]
    #[serde(rename = "match")]
    match_re: Regex,
    #[serde(default = "default_response_status")]
    response_status: u32,
    template: Option<String>,
    endpoint: Option<String>,
    context: Option<BTreeMap<String, Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RouteMatch {
    pub route_index: usize,
    pub variables: BTreeMap<String, String>,
    pub response_status: u32,
    pub template: Option<String>,
    pub endpoint: Option<String>,
    pub context: Option<BTreeMap<String, Value>>,
}

impl RouteMatch {
    pub fn add_context(&self, target: &mut Context) {
        if let Some(context) = &self.context {
            for (key, value) in context {
                target.insert(key, &value);
            }
        }
    }
}


impl Route {
    pub fn maybe_match(&self, route_index: usize, path: &str) -> Option<RouteMatch> {
        if let Some(cap) = self.match_re.captures(path) {
            let mut variables: BTreeMap<String, String> = BTreeMap::new();
            for op_name in self.match_re.capture_names() {
                if let Some(name) = op_name {
                    if let Some(m) = cap.name(name) {
                        variables.insert(name.to_string(), m.as_str().to_string());
                    }
                }
            }
            let endpoint = self.get_endpoint(&variables);
            Some(RouteMatch {
                route_index,
                variables,
                response_status: self.response_status,
                template: self.template.clone(),
                endpoint,
                context: self.context.clone(),
            })
        } else {
            None
        }
    }

    fn get_endpoint(&self, variables: &BTreeMap<String, String>) -> Option<String> {
        if let Some(route_endpoint) = &self.endpoint {
            let mut endpoint_str = route_endpoint.clone();
            let has_vars = endpoint_str.contains("{vars}");
            let mut vars = Vec::<String>::new();
            for (name, value) in variables {
                let rep = format!("{{{}}}", name);
                endpoint_str = endpoint_str.replace(&rep, &value);
                if has_vars {
                    vars.push(format!("{}={}", name, value));
                }
            }
            if has_vars {
                endpoint_str = endpoint_str.replace("{vars}", &vars.join("&"));
            }
            Some(endpoint_str)
        } else {
            None
        }
    }
}


pub fn find_route(routes: &Vec<Route>, path: &str) -> Option<RouteMatch> {
    for (i, route) in routes.iter().enumerate() {
        if let Some(route_match) = route.maybe_match(i, path) {
            return Some(route_match)
        }
    }
    None
}
