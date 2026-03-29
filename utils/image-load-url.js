const https = require('https')

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

      res.on('error', (err) => reject(err))
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })

    req.on('error', (err) => reject(err))
  })
}
