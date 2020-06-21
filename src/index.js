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
    return new Response(`\nError occurred:\n\n  ${e.message}\n`, {
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

  const context = {
    title: 'This is working!',
    date: new Date(),
    items: {
      Foo: 'Bar',
      Apple: 'Pie',
    },
  }

  let html
  try {
    html = ENV.render(config, 'main.jinja', JSON.stringify(context))
  } catch (e) {
    console.warn('error rendering template:', e)
    return new Response(`Rendering Error\n\n${e.message}`, {status: 502})
  }

  return new Response(html, {
    status: 200,
    headers: {'content-type': 'text/html'},
  })
}
