const logger = require('koa-logger')
const responseTime = require('koa-response-time')
const bodyParser = require('koa-bodyparser')
const ratelimit = require('koa-ratelimit')
const Router = require('koa-router')
const Koa = require('koa')
const { loadFonts } = require('./utils')

const app = new Koa()

// Prod path is Cloudflare → host nginx → docker port, so ctx.ip is the docker
// gateway and every public client shared ONE rate-limit bucket. TRUST_PROXY=1
// reads the client IP from a proxy header: PROXY_IP_HEADER=CF-Connecting-IP
// behind Cloudflare (X-Forwarded-For's last hop there is a Cloudflare edge,
// not the client). Only the last value is used, so a client-sent header can't
// override what the proxy set — as long as the port isn't reachable directly.
if (process.env.TRUST_PROXY) {
  app.proxy = true
  app.maxIpsCount = 1
  if (process.env.PROXY_IP_HEADER) app.proxyIpHeader = process.env.PROXY_IP_HEADER
}

app.use(logger())
app.use(responseTime())
app.use(bodyParser())

const ratelimitDb = new Map()

app.use(ratelimit({
  driver: 'memory',
  db: ratelimitDb,
  duration: 1000 * 55,
  errorMessage: {
    ok: false,
    error: {
      code: 429,
      message: 'Rate limit exceeded. See "Retry-After"'
    }
  },
  id: (ctx) => ctx.ip,
  headers: {
    remaining: 'Rate-Limit-Remaining',
    reset: 'Rate-Limit-Reset',
    total: 'Rate-Limit-Total'
  },
  max: 20,
  disableHeader: false,
  whitelist: (ctx) => {
    // The bot sends its token in the request body (kept out of the URL/access
    // logs); accept either location so its own requests stay un-throttled.
    const token = ctx.query.botToken || (ctx.request.body && ctx.request.body.botToken)
    // Without BOT_TOKEN set, `undefined === undefined` whitelisted every
    // token-less request — i.e. disabled rate limiting entirely.
    return Boolean(process.env.BOT_TOKEN) && token === process.env.BOT_TOKEN
  },
  blacklist: (ctx) => {
  }
}))

app.use(require('./helpers').helpersApi)

const route = new Router()

const routes = require('./routes')

// Health check endpoint for Docker/Coolify
route.get('/health', (ctx) => {
  ctx.status = 200
  ctx.body = { status: 'ok', timestamp: Date.now() }
})

route.use('/*', routes.routeApi.routes())

app.use(route.routes())

const port = process.env.PORT || 3000

async function start () {
  await loadFonts()
  app.listen(port, () => {
    console.log('Listening on localhost, port', port)
  })
}

start()
