const logger = require('koa-logger')
const responseTime = require('koa-response-time')
const bodyParser = require('koa-bodyparser')
const ratelimit = require('koa-ratelimit')
const Router = require('koa-router')
const Koa = require('koa')
const { loadFonts } = require('./utils')

const app = new Koa()

app.use(logger())
app.use(responseTime())

// Legacy-domain sunset gate. The old public domain (bot.lyo.su) is being
// retired — its registration lapses in September 2026 and the host will stop
// resolving. A silent redirect would let clients that follow redirects keep
// working "invisibly" right up until the domain vanishes, then break with no
// warning. Instead we hard-fail every legacy-domain request with 410 Gone and
// a machine- + human-readable pointer to the new URL, so integration owners
// notice now and migrate before the cut-off. RFC 8594 Deprecation/Sunset
// headers are emitted for clients that watch for them.
const LEGACY_DOMAIN = process.env.LEGACY_DOMAIN || 'lyo.su'
const CANONICAL_ORIGIN = process.env.CANONICAL_ORIGIN || 'https://quote.yuri.ly'
const LEGACY_SUNSET = new Date(process.env.LEGACY_SUNSET || '2026-09-01T00:00:00Z')

app.use(async (ctx, next) => {
  const host = ctx.hostname
  const isLegacy = host === LEGACY_DOMAIN || host.endsWith('.' + LEGACY_DOMAIN)
  if (!isLegacy) return next()

  const newUrl = CANONICAL_ORIGIN + ctx.originalUrl

  ctx.set('Deprecation', 'true')
  ctx.set('Sunset', LEGACY_SUNSET.toUTCString())
  ctx.set('Link', `<${CANONICAL_ORIGIN}>; rel="successor-version"`)

  ctx.status = 410
  ctx.body = {
    ok: false,
    error: {
      code: 410,
      message: `This domain (${host}) is retired and will stop working after ${LEGACY_SUNSET.toISOString().slice(0, 10)}. Update your integration to use ${CANONICAL_ORIGIN}`,
      new_url: newUrl
    }
  }
})

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
    return token === process.env.BOT_TOKEN
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
