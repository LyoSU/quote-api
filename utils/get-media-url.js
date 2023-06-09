const telegram = require('./telegram')

module.exports = async (mediaId) => {
  const mediaURL = await telegram.getFileLink(mediaId).catch(console.error)
  return mediaURL
}
