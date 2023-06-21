const LRU = require('lru-cache')

const telegram = require('./telegram')

const avatarCache = new LRU({
  max: 20,
  maxAge: 1000 * 60 * 5
})

module.exports = async (user) => {
  let avatarURL = avatarCache.get(user.id)

  if (!avatarURL && user.photo?.big_file_id) {
    avatarURL = await telegram.getFileLink(user.photo.big_file_id).catch(console.error)
  }

  if (!avatarURL) {
    const chat = await telegram.getChat(user.id).catch(console.error)
    if (chat?.photo?.big_file_id) {
      avatarURL = await telegram.getFileLink(chat.photo.big_file_id).catch(console.error)
    }
  }

  if (!avatarURL && user.username) {
    avatarURL = `https://telega.one/i/userpic/320/${user.username}.jpg`
  }

  if (!avatarURL) {
    return null
  }

  avatarCache.set(user.id, avatarURL)
  return avatarURL
}

