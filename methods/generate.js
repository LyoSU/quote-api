const path = require('path')
const fs = require('fs')
const { createCanvas, loadImage } = require('canvas')
const sharp = require('sharp')
const runes = require('runes')
const axios = require('axios')
const lottie = require('lottie-node')
const zlib = require('zlib')

const render = require('../utils/render')
const getView = require('../utils/get-view')
const getAvatarURL = require('../utils/get-avatar-url')
const getMediaURL = require('../utils/get-media-url')
const lightOrDark = require('../utils/light-or-dark')
const formatHTML = require('../utils/format-html')
const telegram = require('../utils/telegram')
const { getBackground, colorLuminance } = require('../utils/color-manipulate')

const getEmojiStatusURL = async (emojiId) => {
  const customEmojiStickers = await telegram.callApi('getCustomEmojiStickers', {
    custom_emoji_ids: [emojiId]
  }).catch(() => {})

  if (!Array.isArray(customEmojiStickers) || !customEmojiStickers.length) {
    return null
  }

  const fileId = customEmojiStickers[0].thumb.file_id
  const fileURL = await telegram.getFileLink(fileId).catch(() => {})
  return fileURL || null
}

const buildUser = async (user, theme, options={ getAvatar: false }) => {
  const index = user.id ? Math.abs(user.id) % 7 : 1
  const color = userColors[theme][index]
  const emojiStatus = user.emoji_status ? await getEmojiStatusURL(user.emoji_status) : null

  let photo = null
  if (options.getAvatar) {
    photo = user.photo || photo
    if (!photo?.url) {
      const photoURL = await getAvatarURL(user)
      photo = photoURL ? { url: photoURL } : photo
    }
  }

  let name, initials

  if (user.first_name && user.last_name) {
    name = user.first_name + ' ' + user.last_name
    initials = runes(user.first_name)[0] + runes(user.last_name)[0]
  }
  else {
    name = user.name || user.first_name || user.title

    if (typeof name == 'string') {
      const nameWords = name.split(' ')
      initials = runes(nameWords[0])[0]
      if (nameWords.length > 1) {
        initials += runes(nameWords.pop()[0])[0]
      }
    }
    else {
      name == ''
      initials = ''
    }
  }

  return { name, initials, color, photo, emojiStatus }
}

const buildMessage = async (message, theme) => {
  const from = await buildUser(message.from, theme, { getAvatar: message.avatar || false })

  let replyMessage = message.replyMessage
  if (replyMessage && Object.keys(replyMessage) != 0) {
    // kostyl
    if (!replyMessage.from) {
      replyMessage.from = {
        id: replyMessage.chatId,
        name: replyMessage.name,
        emoji_status: null,
        photo: null
      }
    }
    replyMessage = {
      from: await buildUser(replyMessage.from, theme),
      text: replyMessage.text
    }
  }
  else {
    replyMessage = null
  }

  let media = message.media || null
  if (media) {
    if (!media.url) {
      if (media.length) {
        const mediaInfo = media.pop()
        const mediaURL = await getMediaURL(mediaInfo)
        media = { url: mediaURL }
      } else {
        media = null
      }
    }
  }
  if (media) {
    media.type = message.mediaType
    if (!media.type) {
      media.type = media.url.endsWith('.webp') || media.url.endsWith('.tgs') ? 'sticker' : 'image'
    }

    if (media.url.endsWith('.tgs')) {
      const tgsCompressed = await axios
        .get(media.url, { responseType: 'arraybuffer' })
        .then(res => Buffer.from(res.data))
        .catch(console.error)
      const tgs = await new Promise((resolve, reject) => zlib.gunzip(tgsCompressed, (error, result) => {
        if (error) {
          return reject(error)
        }
        resolve(JSON.parse(result.toString()))
      }))

      const canvas = createCanvas(512, 512)
      const animation = lottie(tgs, canvas)
      const middleFrame = Math.floor(animation.getDuration(true) / 2)

      animation.goToAndStop(middleFrame, true)
      const filename = media.url.split('/').pop()
      fs.writeFileSync(path.resolve(__dirname, `../cache/${filename}.png`), canvas.toBuffer())

      media.url = `http://localhost:${process.env.PORT}/cache/${filename}.png`
    }
  }

  let text = message.text ?? ''
  if (Array.isArray(message.entities)) {
    text = await formatHTML(text, message.entities)
  }
  text = text.replace(/\n/g, '<br />')

  const type = media ? media.type : 'regular'

  return {
    type, from, replyMessage, text, media,
    showAvatar: message.avatar
  }
}

const userColors = {
  light: ['#FC5C51', '#FA790F', '#895DD5', '#0FB297', '#0FC9D6', '#3CA5EC', '#D54FAF'],
  dark: ['#FF8E86', '#FFA357', '#B18FFF', '#4DD6BF', '#45E8D1', '#7AC9FF', '#FF7FD5']
}
const bgImageURL = `http://localhost:${process.env.PORT}/assets/pattern_02_alpha.png`

module.exports = async (parm) => {
  if (!parm || typeof parm != 'object') {
    return { error: 'query_empty' }
  }

  let type = parm.type || 'png'
  const format = parm.format || ''
  const ext = parm.ext || false
  const scale = parm.scale ? Math.min(parseFloat(parm.scale), 20) : 2

  const {
    backgroundColor, backgroundColorOne, backgroundColorTwo
  } = getBackground(parm.backgroundColor || '//#292232')
  const theme = lightOrDark(backgroundColorOne)

  const messages = await Promise.all(parm.messages
    .filter(message => message)
    .map(message => buildMessage(message, theme))
  )

  if (!messages?.length) {
    return { error: 'messages_empty' }
  }

  const content = getView('default', type)({
    scale,
    width: parm.width,
    height: parm.height,
    theme,
    background: {
      image: { url: bgImageURL },
      color1: colorLuminance(backgroundColorOne, 0.15),
      color2: colorLuminance(backgroundColorTwo, 0.15)
    },
    messages
  })

  if (type == 'html') {
    return {
      image: ext ? content : Buffer.from(content).toString('base64'),
      width: parm.width,
      height: parm.height,
      type, ext
    }
  }

  let image = await render(content, '#quote')
  const imageSharp = await sharp(image)
  const { width, height } = await imageSharp.metadata()

  // if height is more than 2 width, return png instead quote
  if (type == 'quote' && height > width * 2) {
    type = 'png'
  }

  if (type == 'quote') {
    const maxWidth = 512
    const maxHeight = 512

    imageSharp.resize(height > width ? { height: maxHeight } : { width: maxWidth })

    image = format == 'png' ?
      await imageSharp.png().toBuffer() :
      await imageSharp.webp({ lossless: true, force: true }).toBuffer()
  }

  return {
    image: ext ? image : image.toString('base64'),
    type, width, height, ext
  }
}
