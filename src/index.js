import {load_config, load_templates_s3} from './config'

export default function(event, config_url) {
  return event.respondWith(wrap_error(event.request, config_url))
}

let ENV = null

async function wrap_error(request, config_url) {
  console.log(`${request.method} ${request.url}`)
  try {
    if (!ENV) {
      ENV = await new Env().load(config_url)
    }
    return await new Handler(ENV, request).handle()
  } catch (e) {
    console.error('error handling request:', request)
    console.error('config_url:', config_url)
    console.error('error:', e)
    return new Response(`\nError occurred:\n\n${e.message}\n`, {
      status: 500,
      headers: {'content-type': 'text/plain'},
    })
  }
}

class Env {
  constructor() {
    this.load = this.load.bind(this)
    this.render = this.render.bind(this)
  }

  async load(config_url) {
    const {parse_config, create_env} = await import('../edgerender-pkg')
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
}

class Handler {
  constructor(env, request) {
    this.env = env
    this.request = request
    this.url = new URL(request.url)
    this.upstream_json = null
    this.upstream = null
    this.response_headers = {'content-type': 'text/html'}
    this.response_status = null
    this.handle = this.handle.bind(this)
    this._get_upstream = this._get_upstream.bind(this)
  }

  async handle() {
    const static_url = this.env.config.get_static_file(this.url.pathname)
    if (static_url) {
      console.log('request for static file, returning:', static_url)
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
