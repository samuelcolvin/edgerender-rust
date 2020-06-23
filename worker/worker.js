const CONFIG_URL = 'https://edgerender.s3-eu-west-1.amazonaws.com/edgerender.yaml'
const CACHE_FLUSH_KEY = 'testing'
addEventListener('fetch', e => edgerender(e, CONFIG_URL, CACHE_FLUSH_KEY))

function edgerender(event, config_url, cache_flush_key) {
  return event.respondWith(wrap_error(event.request, config_url, cache_flush_key))
}

async function wrap_error(request, config_url, cache_flush_key) {
  console.log(`${request.method} ${request.url}`)
  if (request.url.endsWith('/short-circuit/')) {
    return new Response('short-circuit: skipped wasm, direct response', {status: 202})
  }
  try {
    return await handle_request(request, config_url, cache_flush_key)
  } catch (e) {
    console.error('error handling request:', request)
    console.error('config_url:', config_url)
    console.error('error:', e)
    return new Response(`\nError occurred:\n\n${e.message}\n${e.stack}\n`, {status: 500})
  }
}

async function handle_request(request, config_url, cache_flush_key) {
  if (request.method === 'POST' && new URL(request.url).pathname === `/.cache/flush/${cache_flush_key}`) {
    // NOTE: this doesn't take care of the case where list_complete is false and we need to use a cursor
    let [cache_keys, cache_ts] = await Promise.all([CACHE.list(), CACHE.get('ts')])
    const key_count = cache_keys.keys.length
    if (cache_ts) {
      cache_ts = new Date(cache_ts)
    }
    console.log(`flushing cache key_count=${key_count} cache_timestamp=${cache_ts} keys=`, cache_keys)
    await Promise.all(cache_keys.keys.map(k => CACHE.delete(k.name)))
    ENV = null
    await get_env(request, config_url)
    const msg = `flushed cache and rebuilt, key_count=${key_count} cache_timestamp=${cache_ts}`
    return new Response(msg, {status: 201})
  } else {
    const {env, cache_state} = await get_env(request, config_url)
    return await new Handler(env, request, cache_state).handle()
  }
}

let ENV = null

async function get_env(request, config_url) {
  // THIS makes sure old ENVs don't continue to be used after the KV cache has been flushed
  let cache_state = 'miss'
  let cache_ts = await CACHE.get('ts')
  if (cache_ts) {
    cache_state = 'hit-kv'
  } else {
    cache_ts = new Date().getTime().toString()
    await CACHE.put('ts', cache_ts)
  }
  if (ENV && ENV.cache_ts === cache_ts) {
    console.log('reusing existing ENV', ENV)
    cache_state = 'hit-memory'
  } else {
    ENV = await new Env().load(config_url, cache_ts)
  }
  return {cache_state, env: ENV}
}

class Env {
  constructor() {
    this.load = this.load.bind(this)
    this.render = this.render.bind(this)
    this.get_static_file = this.get_static_file.bind(this)
  }

  async load(config_url, cache_ts) {
    this.cache_ts = cache_ts
    const {parse_config, create_env} = wasm_bindgen
    await wasm_bindgen(wasm)
    // const {parse_config, create_env} = await import('./pkg')
    this.config = await load_config(config_url, parse_config)
    console.log('config:', this.config)
    const templates = await load_templates_s3(this.config)
    console.log('templates:', templates)

    try {
      this._rust_env = create_env(templates)
    } catch (e) {
      if (e instanceof SyntaxError) {
        // this is an invalid templates
        console.warn('invalid template:', e)
        return new Response(`\nInvalid Template:\n\n${e.message}\n`, {status: 502})
      } else {
        throw e
      }
    }

    return this
  }

  render(route_match, upstream_json, response_status, upstream) {
    return this._rust_env.render(this.config, route_match, upstream_json, response_status, upstream)
  }

  get_static_file(pathname) {
    const static_url = this.config.get_static_file(pathname)
    if (static_url) {
      return `${static_url}${static_url.includes('?') ? '&' : '?'}ts=${this.cache_ts}`
    }
  }
}

class Handler {
  constructor(env, request, cache_state) {
    this.env = env
    this.request = request
    this.url = new URL(request.url)
    this.upstream_json = null
    this.upstream = null
    this.response_headers = {
      'content-type': 'text/html',
      'edgerender-cache-state': cache_state,
      'edgerender-cache-ts': new Date(parseInt(env.cache_ts)).toString(),
    }
    this.response_status = null
    this.handle = this.handle.bind(this)
    this._get_upstream = this._get_upstream.bind(this)
  }

  async handle() {
    const static_url = this.env.get_static_file(this.url.pathname)
    if (static_url) {
      console.log('static path, proxying request to:', static_url)
      return fetch(static_url, this.request)
    }

    this.route_match = this.env.config.find_route(this.url.pathname)
    if (!this.route_match) {
      console.warn('no route found, returning 404, URL:', this.url)
      return new Response('404 No route found', {status: 404})
    }
    console.log('route_match:', this.route_match)

    const raw_response = await this._get_upstream()
    if (raw_response) {
      // this is a raw response
      return raw_response
    }

    let html
    try {
      html = this.env.render(this.route_match, this.upstream_json, this.response_status, this.upstream)
    } catch (e) {
      console.warn('error rendering template:', e)
      return new Response(`Rendering Error\n\n${e.message}`, {status: 502})
    }

    return new Response(html, {status: this.response_status, headers: this.response_headers})
  }

  async _get_upstream() {
    if (!this.route_match.upstream) {
      this.response_status = this.route_match.response_status || 200
      console.log(
        'no upstream path for route, not getting upstream data, returning with status:',
        this.response_status,
      )
      return null
    }
    let upstream_url
    if (this.route_match.upstream.match(/^https?:\/\//)) {
      upstream_url = this.route_match.upstream
    } else {
      upstream_url =
        this.env.config.upstream_root.replace(/\/$/, '') + '/' + this.route_match.upstream.replace(/^\//, '')
    }
    if (this.url.search.length > 1) {
      upstream_url += (upstream_url.includes('?') ? '&' : '?') + this.url.search.substr(1)
    }
    console.log('getting data from:', upstream_url)
    const r = await fetch(upstream_url, this.request)
    if (r.status >= 500) {
      let text = await r.text()
      const info = {response: r, headers: get_headers(r), body: text}
      console.warn(`upstream error ${r.status}:`, info)
      return new Response(`Error getting upstream response:\n${text}`, {status: 502})
    }
    let ct = r.headers.get('content-type') || ''
    if (!ct.startsWith('application/json')) {
      console.log(`non-JSON response (content-type: "${ct}"), returning raw`, r)
      return r
    }
    this.upstream_json = await r.text()
    this.upstream = {
      url: upstream_url,
      status: r.status,
      headers: get_headers(r),
    }
    this.response_status = this.route_match.response_status || r.status

    // copy specific headers to response TODO: anymore?
    for (let h of ['cookie', 'set-cookie']) {
      let v = r.headers.get(h)
      if (v) {
        this.response_headers[h] = v
      }
    }
    console.log(`got JSON response from upstream, rendering`, {
      upstream_json: this.upstream_json,
      upstream: this.upstream,
      response_status: this.response_status,
    })
    return null
  }
}

const get_headers = r => Object.assign(...Array.from(r.headers.entries()).map(([k, v]) => ({[k]: v})))

async function load_config(config_url, parse_config) {
  const content = await fetch_text(config_url)
  const config_origin = `https://${new URL(config_url).hostname}`
  return parse_config(content, config_url, config_origin)
}

async function load_templates_s3(config) {
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
  const cache_value = await CACHE.get(url)
  if (cache_value) {
    console.debug('fetch-text cache HIT', url)
    return cache_value
  }
  console.debug('fetch-text cache MISS', url)
  const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}ts=${new Date().getTime()}`)
  if (r.status === 200) {
    const text = await r.text()
    await CACHE.put(url, text)
    return text
  } else {
    throw Error(`unexpected response getting ${url}: ${r.status}`)
  }
}
