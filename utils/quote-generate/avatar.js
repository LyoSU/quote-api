// utils/quote-generate/avatar.js

const { createCanvas, loadImage } = require('canvas')
const LRU = require('lru-cache')
const runes = require('runes')
const loadImageFromUrl = require('../image-load-url')
const { AVATAR_COLORS } = require('./constants')

const avatarCache = new LRU({
  max: 20,
  maxAge: 1000 * 60 * 5
})

function avatarImageLetters (letters, color) {
  const size = 500
  const canvas = createCanvas(size, size)
  const context = canvas.getContext('2d')

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, color[0])
  gradient.addColorStop(1, color[1])

  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  const letterCount = runes(letters).length
  const fontSize = letterCount > 1 ? size * 0.38 : size * 0.48
  context.font = `600 ${fontSize}px NotoSans`
  context.fillStyle = '#FFF'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(letters, size / 2, size / 2)

  return canvas
}

async function downloadAvatarImage (user, telegram) {
  let avatarImage

  let nameLetters
  if (user.first_name && user.last_name) {
    nameLetters = runes(user.first_name)[0] + (runes(user.last_name || '')[0])
  } else {
    let name = user.first_name || (user.name && user.name !== false && user.name) || user.title || '?'
    if (typeof name !== 'string') name = String(name)
    name = name.toUpperCase()
    const nameWord = name.split(' ')

    if (nameWord.length > 1) nameLetters = runes(nameWord[0])[0] + runes(nameWord[nameWord.length - 1])[0]
    else nameLetters = runes(nameWord[0])[0]
  }

  const cacheKey = user.id != null ? user.id : `noId:${user.username || nameLetters}`
  const avatarImageCached = avatarCache.get(cacheKey)
  const nameIndex = user.id != null ? Math.abs(user.id) % 7 : 0
  const avatarColor = AVATAR_COLORS[nameIndex]

  if (avatarImageCached) {
    return avatarImageCached
  }

  if (user.photo && user.photo.url) {
    avatarImage = await loadImage(user.photo.url).catch(() => null)
  }

  if (!avatarImage) {
    try {
      let userPhoto, userPhotoUrl

      if (user.photo && user.photo.big_file_id) {
        userPhotoUrl = await telegram.getFileLink(user.photo.big_file_id).catch(() => {})
      }

      if (!userPhotoUrl) {
        const getChat = user.id != null
          ? await telegram.getChat(user.id).catch(() => {})
          : null

        if (getChat) {
          // Use chat data to fix missing initials
          if (nameLetters === '?') {
            const chatName = getChat.first_name || getChat.title
            if (chatName) {
              const upper = chatName.toUpperCase()
              const words = upper.split(' ')
              if (words.length > 1) nameLetters = runes(words[0])[0] + runes(words[words.length - 1])[0]
              else nameLetters = runes(words[0])[0]
            }
          }

          if (getChat.photo && getChat.photo.big_file_id) {
            userPhoto = getChat.photo.big_file_id
          }
        }

        if (userPhoto) {
          userPhotoUrl = await telegram.getFileLink(userPhoto).catch(() => {})
        } else if (user.username) {
          userPhotoUrl = `https://telega.one/i/userpic/320/${user.username}.jpg`
        }
      }

      if (userPhotoUrl) {
        const imageBuffer = await loadImageFromUrl(userPhotoUrl).catch((error) => {
          console.warn('Failed to load user photo from URL:', error.message)
          return null
        })

        if (imageBuffer) {
          avatarImage = await loadImage(imageBuffer).catch((error) => {
            console.warn('Failed to process user photo buffer:', error.message)
            return null
          })
        }
      }

      if (avatarImage) {
        avatarCache.set(cacheKey, avatarImage)
      }
    } catch (error) {
      console.warn('Error getting user photo:', error.message)
      avatarImage = null
    }
  }

  // Final fallback — initials avatar
  if (!avatarImage) {
    try {
      avatarImage = avatarImageLetters(nameLetters, avatarColor)
      avatarCache.set(cacheKey, avatarImage)
    } catch (error) {
      console.warn('Failed to create letters avatar:', error.message)
      avatarImage = null
    }
  }

  return avatarImage
}

async function drawAvatar (user, telegram) {
  try {
    const avatarImage = await downloadAvatarImage(user, telegram)

    if (avatarImage) {
      const avatarSize = avatarImage.naturalHeight || avatarImage.height

      const canvas = createCanvas(avatarSize, avatarSize)
      const canvasCtx = canvas.getContext('2d')

      canvasCtx.beginPath()
      canvasCtx.arc(avatarSize / 2, avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true)
      canvasCtx.save()
      canvasCtx.clip()
      canvasCtx.closePath()
      canvasCtx.drawImage(avatarImage, 0, 0, avatarSize, avatarSize)
      canvasCtx.restore()

      return canvas
    }
    console.warn('No avatar image available for user')
    return null
  } catch (error) {
    console.warn('Error drawing avatar:', error.message)
    return null
  }
}

module.exports = { drawAvatar, downloadAvatarImage, avatarImageLetters }
