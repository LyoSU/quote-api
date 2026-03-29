const https = require('https')
const http = require('http')

module.exports = (url, filter = false) => {
  return new Promise((resolve, reject) => {
    const options = new URL(url)
    options.headers = {
      'User-Agent': 'curl/8.4.0'
    }

    const client = options.protocol === 'http:' ? http : https

    const req = client.get(options, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }

      if (filter && filter(res.headers)) {
        res.resume()
        return resolve(Buffer.concat([]))
      }

      const chunks = []

      res.on('error', (err) => reject(err))
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })

    req.on('error', (err) => reject(err))
  })
}
