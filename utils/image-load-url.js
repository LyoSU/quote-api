const https = require('https')

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024

module.exports = (url, filter = false) => {
  return new Promise((resolve, reject) => {
    const options = new URL(url)

    if (options.protocol !== 'https:') {
      return reject(new Error(`Unsupported protocol ${options.protocol} for ${url}`))
    }

    options.headers = {
      'User-Agent': 'curl/8.4.0'
    }

    const req = https.get(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }

      if (filter && filter(res.headers)) {
        res.resume()
        return resolve(Buffer.concat([]))
      }

      const chunks = []
      let totalBytes = 0

      res.on('error', (err) => reject(err))
      res.on('data', (chunk) => {
        totalBytes += chunk.length
        if (totalBytes > MAX_RESPONSE_BYTES) {
          req.destroy()
          res.destroy()
          return reject(new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes for ${url}`))
        }
        chunks.push(chunk)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy()
      reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms for ${url}`))
    })

    req.on('error', (err) => reject(err))
  })
}
