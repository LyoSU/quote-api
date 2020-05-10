const logger = require('koa-logger')
const responseTime = require('koa-response-time')
const bodyParser = require('koa-bodyparser')
const Router = require('koa-router')
const Koa = require('koa')

const app = new Koa()

app.use(logger())
app.use(responseTime())
app.use(bodyParser())

app.use(require('./helpers').helpersApi)

const route = new Router()

const routes = require('./routes')

route.use('/*', routes.routeApi.routes())

app.use(route.routes())

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log('Listening on localhost, port', port)
})
