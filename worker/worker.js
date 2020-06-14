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
  const {Env} = wasm_bindgen
  await wasm_bindgen(wasm)
  const context = {
    title: 'This is working!',
    date: new Date(),
    things: {
      'Foo': 'Bar',
      'Apple': 'Pie',
    }
  }
  const env = Env.new(templates)
  console.log('env:', env)
  const html = env.render('main.jinja', JSON.stringify(context))
  return new Response(html, {
    status: 200,
    headers: {'content-type': 'text/html'}
  })
}
