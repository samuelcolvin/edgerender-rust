addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

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
`
  },
  {
    name: 'main.jinja',
    content: `
{% extends 'base.jinja' %}

{% block main %}
  <p>{{ date|date(format="%Y-%m-%d %A %H:%M") }}</p>
  <ul>
    {% for name, item in things %}
      <li><b>{{ name }}:</b> {{ item }}</li>
    {% endfor %}
  </ul>
{% endblock %}
`
  }
]


async function handleRequest(request) {
  const {create_env} = wasm_bindgen
  await wasm_bindgen(wasm)
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
      'Foo': 'Bar',
      'Apple': 'Pie',
    }
  }

  let html
  try {
    html = env.render('main.jinja', JSON.stringify(context))
  } catch (e) {
      console.warn('error rendering template:', e)
      return new Response(`Rendering Error\n\n${e.message}`, {status: 502})
  }

  return new Response(html, {
    status: 200,
    headers: {'content-type': 'text/html'}
  })
}
