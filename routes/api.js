const Router = require('koa-router')
const api = new Router()

const method = require('../methods')

const apiHandle = async (ctx) => {
  const methodWithExt = ctx.params[0].match(/(.*).(png|webp)/)
  if (methodWithExt) ctx.props.ext = methodWithExt[2]
  ctx.result = await method(methodWithExt ? methodWithExt[1] : ctx.params[0], ctx.props)
}

api.post('/', apiHandle)

module.exports = api
