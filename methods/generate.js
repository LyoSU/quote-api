const path = require('path')
const fs = require('fs')
const { createCanvas, loadImage } = require('canvas')
const sharp = require('sharp')
const runes = require('runes')

const render = require('../utils/render')
const getView = require('../utils/get-view')
const getAvatarURL = require('../utils/get-avatar-url')
const getMediaURL = require('../utils/get-media-url')
const lightOrDark = require('../utils/light-or-dark')
const formatHTML = require('../utils/format-html')

const normalizeColor = (color) => {
  const canvas = createCanvas(0, 0)
  const canvasCtx = canvas.getContext('2d')

  canvasCtx.fillStyle = color
  color = canvasCtx.fillStyle

  return color
}

const colorLuminance = (hex, lum) => {
  hex = String(hex).replace(/[^0-9a-f]/gi, '')
  if (hex.length < 6) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  lum = lum || 0

  // convert to decimal and change luminosity
  let rgb = '#'
  let c
  let i
  for (i = 0; i < 3; i++) {
    c = parseInt(hex.substr(i * 2, 2), 16)
    c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16)
    rgb += ('00' + c).substr(c.length)
  }

  return rgb
}

const imageAlpha = (image, alpha) => {
  const canvas = createCanvas(image.width, image.height)

  const canvasCtx = canvas.getContext('2d')

  canvasCtx.globalAlpha = alpha

  canvasCtx.drawImage(image, 0, 0)

  return canvas
}

const buildUser = async (user, theme, options={ getAvatar: false }) => {
  const index = user.id ? Math.abs(user.id) % 7 : 1
  const color = userColors[theme][index]
  const emojiStatus = user.emojiStatus ?? ''

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
    replyMessage = {
      from: await buildUser(replyMessage.from, theme),
      text: replyMessage.text
    }
  }
  else {
    replyMessage = null
  }

  let media = message.media || null
  if (media && !media.url) {
    if (media.length) {
      const mediaId = media.pop()
      const mediaURL = await getMediaURL(mediaId)
      media = { url: mediaURL }
    } else {
      media = null
    }
  }

  let text = message.text ?? ''
  if (Array.isArray(message.entities)) {
    text = await formatHTML(text, message.entities)
  }
  text = text.replace(/\n/g, '<br />')

  return {
    from, replyMessage, text, media,
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

  let backgroundColor = parm.backgroundColor || '//#292232'
  let backgroundColorOne, backgroundColorTwo
  const backgroundColorSplit = backgroundColor.split('/')

  // TODO effect colors with CSS
  if (backgroundColorSplit && backgroundColorSplit.length > 1 && backgroundColorSplit[0] !== '') {
    backgroundColorOne = normalizeColor(backgroundColorSplit[0])
    backgroundColorTwo = normalizeColor(backgroundColorSplit[1])
  } else if (backgroundColor.startsWith('//')) {
    backgroundColor = normalizeColor(backgroundColor.replace('//', ''))
    backgroundColorOne = colorLuminance(backgroundColor, 0.35)
    backgroundColorTwo = colorLuminance(backgroundColor, -0.15)
  } else {
    backgroundColor = normalizeColor(backgroundColor)
    backgroundColorOne = backgroundColor
    backgroundColorTwo = backgroundColor
  }

  const theme = lightOrDark(backgroundColorOne)

  const messages = await Promise.all(parm.messages
    .filter(message => message)
    .map(message => buildMessage(message, theme))
  )

  if (!messages?.length) {
    return { error: 'messages_empty' }
  }

  const content = getView(type)({
    scale,
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
