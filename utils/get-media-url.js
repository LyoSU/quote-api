const telegram = require('./telegram')

module.exports = async (mediaInfo) => {
  const mediaURL = await telegram.getFileLink(mediaInfo).catch(console.error)
  return mediaURL
}
