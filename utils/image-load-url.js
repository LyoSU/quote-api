const https = require('https')
const http = require('http')

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024
const MAX_REDIRECTS = 5

function doRequest (url, filter, redirectCount) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const transport = parsed.protocol === 'https:' ? https : http

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return reject(new Error(`Unsupported protocol ${parsed.protocol} for ${url}`))
    }

    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'curl/8.4.0' }
    }

    const req = transport.get(options, (res) => {
      // Follow redirects (301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        if (redirectCount >= MAX_REDIRECTS) {
          return reject(new Error(`Too many redirects (${MAX_REDIRECTS}) for ${url}`))
        }
        const redirectUrl = new URL(res.headers.location, url).href
        return resolve(doRequest(redirectUrl, filter, redirectCount + 1))
      }

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

module.exports = (url, filter = false) => doRequest(url, filter, 0)
