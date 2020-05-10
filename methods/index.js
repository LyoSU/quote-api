const crypto = require('crypto')
const LRU = require('lru-cache')
const sizeof = require('object-sizeof')

const generate = require('./generate')

const methods = {
  generate
}

const cache = new LRU({
  max: 1000 * 1000 * 1000,
  length: (n) => { return sizeof(n) },
  maxAge: 1000 * 60 * 45
})

module.exports = async (method, parm) => {
  if (methods[method]) {
    let methodResult = {}

    let cacheString = crypto.createHash('md5').update(JSON.stringify({ method, parm })).digest('hex')
    const methodResultCache = cache.get(cacheString)

    if (!methodResultCache) {
      methodResult = await methods[method](parm)

      if (!methodResult.error) cache.set(cacheString, methodResult)
    } else {
      methodResult = methodResultCache
    }

    return methodResult
  } else {
    return {
      error: 'method not found'
    }
  }
}
