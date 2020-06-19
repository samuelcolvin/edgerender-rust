import YAML from 'yaml'

export default function (event, config_url) {
  return event.respondWith(wrap_error(event.request, config_url))
}

async function wrap_error(request, config_url) {
  console.log('request:', request)
  console.log('config_url:', config_url)
  try {
    return await handle(request, config_url)
  } catch (e) {
    console.error(`error handling request to ${request.url}:`, e)
    // TODO log error
    return new Response(`Error handling request: ${e}`, {
      status: 500,
      headers: {'content-type': 'text/plain'},
    })
  }
}

const some_yaml = `
foo: "this is foo"
bar: 123
yaml:
  - A complete JavaScript implementation
  - https://www.npmjs.com/package/yaml
`

const templates = [
  {
    name: 'base.jinja',
    content: `
<!doctype html>
<html lang="en">
  <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
      <title>{{ title }}</title>
  </head>
  <body>
    {% block main %}
      <b>(main block)</b>
    {% endblock %}
  </body>
</html>
`,
  },
  {
    name: 'main.jinja',
    content: `
{% extends 'base.jinja' %}

{% block main %}
  <p>{{ date|date(format="%Y-%m-%d %A %H:%M:%S") }}</p>
  <ul>
    {% for name, item in things %}
      <li><b>{{ name }}:</b> {{ item }}</li>
    {% endfor %}
  </ul>
{% endblock %}
`,
  },
]

async function handle(request, config_url) {
  const {create_env} = await import('./edgerender-pkg')
  let env
  try {
    env = create_env(templates)
  } catch (e) {
    if (e instanceof SyntaxError) {
      // this is an invalid templates
      console.warn('invalid template:', e)
      return new Response(`Invalid Template\n\n${e.message}`, {status: 502})
    } else {
      console.error('error creating template environment:', e)
      return new Response(`Error Creating Template Environment\n\n${e.message}`, {status: 500})
    }
  }
  console.log('env:', env)

  const context = {
    title: 'This is working!',
    date: new Date(),
    things: {
      Foo: 'Bar',
      Apple: 'Pie',
    },
  }
  const config = YAML.parse(some_yaml)
  console.log('config:', config)
  Object.assign(context, config)

  let html
  try {
    html = env.render('main.jinja', JSON.stringify(context))
  } catch (e) {
    console.warn('error rendering template:', e)
    return new Response(`Rendering Error\n\n${e.message}`, {status: 502})
  }

  return new Response(html, {
    status: 200,
    headers: {'content-type': 'text/html'},
  })
}
