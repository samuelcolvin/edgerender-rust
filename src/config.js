export async function load_config(config_url, parse_config) {
  const content = await fetch_text(config_url)
  const default_template_root = `https://${new URL(config_url).hostname}`
  return parse_config(content, config_url, default_template_root)
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
  const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}ts=${new Date().getTime()}`)
  if (r.status === 200) {
    return await r.text()
  } else {
    throw Error(`unexpected response getting ${url}: ${r.status}`)
  }
}
