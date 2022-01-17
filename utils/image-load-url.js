const https = require('https')

module.exports = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (!res.headers['content-type'].match(/image|stream/)) {
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
