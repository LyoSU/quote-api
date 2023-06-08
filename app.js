const path = require('path')
const logger = require('koa-logger')
const responseTime = require('koa-response-time')
const bodyParser = require('koa-bodyparser')
const ratelimit = require('koa-ratelimit')
const serve = require('koa-static')
const mount = require('koa-mount')
const Router = require('koa-router')
const Koa = require('koa')

const app = new Koa()

app.use(logger())
app.use(responseTime())
app.use(bodyParser())
app.use(mount('/assets', serve(path.resolve('./assets'))))

const ratelimitВb = new Map()

app.use(ratelimit({
  driver: 'memory',
  db: ratelimitВb,
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
    return ctx.query.botToken === process.env.BOT_TOKEN
  },
  blacklist: (ctx) => {
  }
}))

app.use(require('./helpers').helpersApi)

const route = new Router()

const routes = require('./routes')

route.use('/*', routes.routeApi.routes())

app.use(route.routes())

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log('Listening on localhost, port', port)
})
