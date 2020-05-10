module.exports = async (ctx, next) => {
  ctx.props = Object.assign(ctx.query || {}, ctx.request.body || {})

  try {
    await next()

    if (!ctx.body) {
      ctx.assert(ctx.result, 404, 'Not Found')

      if (ctx.result.image) {
        ctx.type = 'text/plain; charset=utf-8'
        ctx.type = 'image/png'
        ctx.type = '.png'
        ctx.type = 'png'
        ctx.body = ctx.result.image
      } else {
        if (ctx.result.error) {
          ctx.status = 400
          ctx.body = {
            ok: false,
            error: ctx.result.error
          }
        } else {
          ctx.body = {
            ok: true,
            result: ctx.result
          }
        }
      }
    }
  } catch (error) {
    ctx.status = error.statusCode || error.status || 500
    ctx.body = {
      ok: false,
      error: {
        code: ctx.status,
        message: error.message,
        description: error.description
      }
    }
  }
}
