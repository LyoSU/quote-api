const { createCanvas, loadImage } = require('canvas')
const runes = require('runes')
const LRU = require('lru-cache')

const telegram = require('./telegram')

const avatarCache = new LRU({
  max: 20,
  maxAge: 1000 * 60 * 5
})

async function drawAvatar (user) {
  const avatarImage = await downloadAvatarImage(user)

  if (avatarImage) {
    const avatarSize = avatarImage.naturalHeight

    const canvas = createCanvas(avatarSize, avatarSize)
    const canvasCtx = canvas.getContext('2d')

    const avatarX = 0
    const avatarY = 0

    // canvasCtx.beginPath()
    // canvasCtx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true)
    // canvasCtx.clip()
    // canvasCtx.closePath()
    // canvasCtx.restore()
    canvasCtx.drawImage(avatarImage, avatarX, avatarY, avatarSize, avatarSize)

    return canvas
  }
}

async function downloadAvatarImage (user) {
  let avatarImage

  let nameLetters
  if (user.first_name && user.last_name) nameLetters = runes(user.first_name)[0] + (runes(user.last_name || '')[0])
  else {
    let name = user.first_name || user.name || user.title
    name = name.toUpperCase()
    const nameWord = name.split(' ')

    if (nameWord.length > 1) nameLetters = runes(nameWord[0])[0] + runes(nameWord.splice(-1)[0])[0]
    else nameLetters = runes(nameWord[0])[0]
  }

  const cacheKey = user.id

  const avatarImageCache = avatarCache.get(cacheKey)

  const avatarColorArray = [
    [ '#FF885E', '#FF516A' ], // red
    [ '#FFCD6A', '#FFA85C' ], // orange
    [ '#E0A2F3', '#D669ED' ], // purple
    [ '#A0DE7E', '#54CB68' ], // green
    [ '#53EDD6', '#28C9B7' ], // sea
    [ '#72D5FD', '#2A9EF1' ], // blue
    [ '#FFA8A8', '#FF719A' ] // pink
  ]

  const nameIndex = Math.abs(user.id) % 7

  const avatarColor = avatarColorArray[nameIndex]

  if (avatarImageCache) {
    avatarImage = avatarImageCache
  } else if (user.photo && user.photo.url) {
    avatarImage = await loadImage(user.photo.url)
  } else {
    try {
      let userPhoto, userPhotoUrl

      if (user.photo && user.photo.big_file_id) userPhotoUrl = await telegram.getFileLink(user.photo.big_file_id).catch(console.error)

      if (!userPhotoUrl) {
        const getChat = await telegram.getChat(user.id).catch(console.error)
        if (getChat && getChat.photo && getChat.photo.big_file_id) userPhoto = getChat.photo.big_file_id

        if (userPhoto) userPhotoUrl = await telegram.getFileLink(userPhoto)
        else if (user.username) userPhotoUrl = `https://telega.one/i/userpic/320/${user.username}.jpg`
        else avatarImage = await loadImage(await avatarImageLetters(nameLetters, avatarColor))
      }

      if (userPhotoUrl) avatarImage = await loadImage(userPhotoUrl)

      avatarCache.set(cacheKey, avatarImage)
    } catch (error) {
      avatarImage = await loadImage(await avatarImageLetters(nameLetters, avatarColor))
    }
  }

  return avatarImage
}

async function avatarImageLetters (letters, color) {
  const size = 500
  const canvas = createCanvas(size, size)
  const context = canvas.getContext('2d')

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)

  gradient.addColorStop(0, color[0])
  gradient.addColorStop(1, color[1])

  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  const drawLetters = await this.drawMultilineText(
    letters,
    null,
    size / 2,
    '#FFF',
    0,
    size,
    size * 5,
    size * 5
  )

  context.drawImage(drawLetters, (canvas.width - drawLetters.width) / 2, (canvas.height - drawLetters.height) / 1.5)

  return canvas.toBuffer()
}

module.exports = drawAvatar
