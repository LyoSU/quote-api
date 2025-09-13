const https = require('https')

module.exports = (url, filter = false) => {
  return new Promise((resolve, reject) => {
    const options = new URL(url)
    options.headers = {
      'User-Agent': 'curl/8.4.0'
    }

    https.get(options, (res) => {
      if (filter && filter(res.headers)) {
        resolve(Buffer.concat([]))
      }

      const chunks = []

      res.on('error', (err) => {
        reject(err)
      })
      res.on('data', (chunk) => {
        chunks.push(chunk)
      })
      res.on('end', () => {
        resolve(Buffer.concat(chunks))
      })
    })
  })
}
