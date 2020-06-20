import {load_config, load_templates_s3} from './config'

export default function(event, config_url) {
  return event.respondWith(wrap_error(event.request, config_url))
}

async function wrap_error(request, config_url) {
  console.log(`config_url: ${config_url} request:`, request)
  try {
    return await handle(request, config_url)
  } catch (e) {
    console.error(`error handling request to ${request.url}:`, e)
    // TODO log error
    return new Response(`Error handling request:\n\n  ${e.message}`, {
      status: 500,
      headers: {'content-type': 'text/plain'},
    })
  }
}

let ENV = null

async function handle(request, config_url) {
  const config = await load_config(config_url)
  console.log('config:', config)
  const templates = await load_templates_s3(config)
  console.log('templates:', templates)

  const {create_env} = await import('../edgerender-pkg')
  if (!ENV) {
    try {
      ENV = create_env(templates)
    } catch (e) {
      if (e instanceof SyntaxError) {
        // this is an invalid templates
        console.warn('invalid template:', e)
        return new Response(`Invalid Template\n\n${e.message}`, {status: 502})
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
  if (config.context) {
    Object.assign(context, config.context)
  }

  let html
  try {
    html = ENV.render('main.jinja', JSON.stringify(context))
  } catch (e) {
    console.warn('error rendering template:', e)
    return new Response(`Rendering Error\n\n${e.message}`, {status: 502})
  }

  return new Response(html, {
    status: 200,
    headers: {'content-type': 'text/html'},
  })
}
