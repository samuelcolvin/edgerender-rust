import yaml from 'yaml'

export async function load_config(config_url) {
  const content = await fetch_text(config_url)
  const config = yaml.parse(content)
  config.url = config_url
  config.template_prefix = config.template_prefix || 'templates'
  config.template_root = config.template_root || `https://${new URL(config_url).hostname}`
  return config
}

export async function load_templates_s3(config) {
  const xml = await fetch_text(`${config.template_root}?list-type=2&prefix=${config.template_prefix}`)
  const templates = []
  const re = /<Key>(.+?)<\/Key>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    templates.push(m[1])
  }

  return await Promise.all(
    templates.map(async t => ({
      name: t.replace(new RegExp(`^${config.template_prefix}\/`), ''),
      content: await fetch_text(`${config.template_root}/${t}`),
    })),
  )
}

async function fetch_text(url) {
  const r = await fetch(url)
  if (r.status !== 200) {
    throw Error(`unexpected response getting list of templates ${url}: ${r.status}`)
  }
  return await r.text()
}
