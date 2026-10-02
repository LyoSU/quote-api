const https = require('https')
const http = require('http')
const dns = require('dns')
const net = require('net')

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024
const MAX_REDIRECTS = 5

// SSRF guard: media/avatar URLs come from the request body, so without this
// a caller could make the server fetch cloud metadata (169.254.169.254),
// localhost or other containers on the docker network. Private addresses are
// refused after DNS resolution (and the connection uses that checked address,
// so DNS rebinding can't swap it), on every redirect hop. The self-hosted Bot
// API host (BOT_API_ROOT) may legitimately be internal and is always allowed,
// as are hosts in IMAGE_HOST_ALLOWLIST (comma-separated). Tests that serve
// fixtures from localhost set ALLOW_PRIVATE_IMAGE_URLS=1.
function isPrivateIp (ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase()
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v)
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
}

function allowedHosts () {
  const hosts = new Set()
  if (process.env.BOT_API_ROOT) {
    try { hosts.add(new URL(process.env.BOT_API_ROOT).hostname) } catch (_) {}
  }
  for (const h of (process.env.IMAGE_HOST_ALLOWLIST || '').split(',')) {
    if (h.trim()) hosts.add(h.trim().toLowerCase())
  }
  return hosts
}

function guardedLookup (hostname, options, callback) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err)
    const list = Array.isArray(address) ? address : [{ address, family }]
    const blocked = list.find((a) => isPrivateIp(a.address))
    if (blocked) return callback(new Error(`Refusing private address ${blocked.address} for ${hostname}`))
    callback(null, address, family)
  })
}

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

    const guarded = !process.env.ALLOW_PRIVATE_IMAGE_URLS &&
      !allowedHosts().has(parsed.hostname.toLowerCase())
    if (guarded) {
      // IP literals skip DNS lookup entirely, so check them up front.
      const literal = parsed.hostname.replace(/^\[|\]$/g, '')
      if (net.isIP(literal)) {
        if (isPrivateIp(literal)) return reject(new Error(`Refusing private address ${literal}`))
      } else {
        options.lookup = guardedLookup
      }
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
module.exports.isPrivateIp = isPrivateIp
