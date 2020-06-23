import edgerender from './src/index'

const CONFIG_URL = 'https://edgerender.s3-eu-west-1.amazonaws.com/edgerender.yaml'
const CACHE_FLUSH_KEY = 'testing'
addEventListener('fetch', e => edgerender(e, CONFIG_URL, CACHE_FLUSH_KEY))
