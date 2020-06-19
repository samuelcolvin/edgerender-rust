import edgerender from './src/index'

const CONFIG_URL = 'https://edgerender.s3-eu-west-1.amazonaws.com/edgerender.toml'
addEventListener('fetch', e => edgerender(e, CONFIG_URL))
