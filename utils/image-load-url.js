const https = require('https')

module.exports = (url, filter = false) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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
