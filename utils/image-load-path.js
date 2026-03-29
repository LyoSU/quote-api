const fs = require('fs')

module.exports = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (error, data) => {
      if (error) reject(error)
      else resolve(data)
    })
  })
}
