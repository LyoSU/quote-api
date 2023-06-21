const path = require('path')
const fs = require('fs')
const { createCanvas } = require('canvas')
const sharp = require('sharp')
const runes = require('runes')
const axios = require('axios')
const lottie = require('lottie-node')
const zlib = require('zlib')

const {
  telegram, render, getView, getAvatarURL, formatHTML, getBackground, colorLuminance, lightOrDark
} = require('../utils')

const getEmojiStatusURL = async (emojiId) => {
  const customEmojiStickers = await telegram.callApi('getCustomEmojiStickers', {
    custom_emoji_ids: [emojiId]
  }).catch(console.error)

  if (!Array.isArray(customEmojiStickers) || !customEmojiStickers.length) {
    return null
  }

  const fileId = customEmojiStickers[0].thumb.file_id
  const fileURL = await telegram.getFileLink(fileId).catch(console.error)

  return fileURL || null
}

const buildUser = async (user, theme, options={ getAvatar: false }) => {
  const index = user.id ? Math.abs(user.id) % 7 : 1
  const color = userColors[theme][index]
  const emojiStatus = user.emoji_status ? await getEmojiStatusURL(user.emoji_status) : null

  let photo = null
  if (options.getAvatar) {
    photo = user.photo || null
    if (!photo || !photo.url) {
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
      name = ''
      initials = ''
    }
  }

  return { name, initials, color, photo, emojiStatus }
}

const buildReplyMessage = async (message, theme) => {
  if (!Object.keys(message).length) {
    return null
  }

  // kostyl
  const from = message.from || {
    id: message.chatId,
    name: message.name,
    emoji_status: null,
    photo: null
  }

  return {
    from: await buildUser(from, theme),
    text: message.text
  }
}

const buildMedia = async (media, type) => {
  let url = media.url
  if (!url) {
    const mediaInfo = Array.isArray(media) ? media.pop() : media
    url = await telegram.getFileLink(mediaInfo).catch(console.error)
  }

  if (!type) {
    type = url.endsWith('.webp') || url.endsWith('.tgs') ? 'sticker' : 'image'
  }

    if (url.endsWith('.tgs')) {
      const tgsCompressed = await axios
        .get(url, { responseType: 'arraybuffer' })
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
      const filename = url.split('/').pop()
      fs.writeFileSync(path.resolve(__dirname, `../cache/${filename}.png`), canvas.toBuffer())

      url = `http://localhost:${process.env.PORT}/cache/${filename}.png`
    }

    return { url, type }
}

const buildMessage = async (message, theme) => {
  const from = await buildUser(message.from, theme, { getAvatar: message.avatar || false })
  const replyMessage = message.replyMessage ? await buildReplyMessage(message.replyMessage, theme) : null
  const media = message.media ? await buildMedia(message.media, message.mediaType) : null

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
const MAX_SCALE = 20
const DEFAULT_BG_COLOR = '//#292232'
const DEFAULT_VIEW_NAME = 'default'
const RENDER_SELECTOR = '#quote'
const MAX_QUOTE_WIDTH = 512
const MAX_QUOTE_HEIGHT = 512

module.exports = async (parm) => {
  if (!parm || typeof parm != 'object') {
    return { error: 'query_empty' }
  }

  let type = parm.type || 'png'
  const format = parm.format || ''
  const ext = parm.ext || false
  const scale = parm.scale ? Math.min(parseFloat(parm.scale), MAX_SCALE) : 2

  const {
    backgroundColor, backgroundColorOne, backgroundColorTwo
  } = getBackground(parm.backgroundColor || DEFAULT_BG_COLOR)
  const theme = lightOrDark(backgroundColorOne)

  const messages = await Promise.all(parm.messages
    .filter(message => message)
    .map(message => buildMessage(message, theme))
  )

  if (!messages?.length) {
    return { error: 'messages_empty' }
  }

  const view = getView(DEFAULT_VIEW_NAME, type)
  const content = view({
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

  let image = await render(content, RENDER_SELECTOR)
  const imageSharp = await sharp(image)
  const { width, height } = await imageSharp.metadata()

  // if height is more than 2 width, return png instead quote
  if (type == 'quote' && height > width * 2) {
    type = 'png'
  }

  if (type == 'quote') {
    imageSharp.resize(height > width ? { height: MAX_QUOTE_HEIGHT } : { width: MAX_QUOTE_WIDTH })

    image = format == 'png' ?
      await imageSharp.png().toBuffer() :
      await imageSharp.webp({ lossless: true, force: true }).toBuffer()
  }

  return {
    image: ext ? image : image.toString('base64'),
    type, width, height, ext
  }
}
