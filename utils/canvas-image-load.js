const { loadImage } = require('canvas')

module.exports = (image) => {
  return new Promise((resolve, reject) => {
    loadImage(image).then((image) => {
      resolve(image)
    })
  })
}
