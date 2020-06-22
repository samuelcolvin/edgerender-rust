import {load_config, load_templates_s3} from './config'

export default function(event, config_url) {
  return event.respondWith(wrap_error(event.request, config_url))
}

async function wrap_error(request, config_url) {
  console.log(`${request.method} ${request.url}`)
  try {
    return await handle(request, config_url)
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

let ENV = null
const DEBUG = true

async function handle(request, config_url) {
  const {create_env, parse_config} = await import('../edgerender-pkg')
  let config = await load_config(config_url, parse_config)
  console.log('config:', config)
  const templates = await load_templates_s3(config)
  console.log('templates:', templates)

  const url = new URL(request.url)
  const route_match = config.find_route(url.pathname)
  if (!route_match) {
    console.warn('no route found, returning 404, URL:', url)
    return new Response('404 No route found', {status: 404})
  }
  console.log('route_match:', route_match)

  if (!ENV || DEBUG) {
    try {
      ENV = create_env(templates)
    } catch (e) {
      if (e instanceof SyntaxError) {
        // this is an invalid templates
        console.warn('invalid template:', e)
        return new Response(`\nInvalid Template:\n\n${e.message}\n`, {status: 502})
      } else {
        throw e
      }
    }
  }
  let raw_json = null
  let response_status
  if (route_match.upstream) {
    const upstream_url = new URL(config.upstream_root)
    upstream_url.pathname = route_match.upstream
    console.log(`getting data from: ${upstream_url}`)
    const r = await fetch(upstream_url, request)
    if (r.status >= 500) {
      let text = await r.text()
      console.warn(`upstream error ${r.status}:`, r, text)
      return new Response(`Error getting upstream response:\n${text}`, {status: 502})
    }
    let ct = r.headers.get('content-type') || ''
    if (!ct.startsWith('application/json')) {
      console.log(`non-JSON response (content-type: "${ct}"), returning raw`, r)
      return r
    }
    raw_json = await r.text()
    response_status = route_match.response_status || r.status
    console.log(`got JSON response, returning with status ${response_status}, JSON:`, {raw_json})
  } else {
    response_status = route_match.response_status || 200
    console.log('no upstream path for route, not getting upstream data, returning with status:', response_status)
  }

  let html
  try {
    html = ENV.render(config, route_match, raw_json)
  } catch (e) {
    console.warn('error rendering template:', e)
    return new Response(`Rendering Error\n\n${e.message}`, {status: 502})
  }

  return new Response(html, {
    status: response_status,
    headers: {'content-type': 'text/html'},
  })
}
