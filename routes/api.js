const Router = require('koa-router')
const api = new Router()

const method = require('../methods')

const apiHandle = async (ctx) => {
  ctx.result = await method(ctx.params[0], ctx.props)
}

api
  .all('/', apiHandle)

module.exports = api
