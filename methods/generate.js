const path = require('path')
const fs = require('fs')
const { createCanvas, loadImage } = require('canvas')
const sharp = require('sharp')
const { Telegram } = require('telegraf')

const render = require('../utils/render')
const getView = require('../utils/get-view')
const drawAvatar = require('../utils/draw-avatar')
const lightOrDark = require('../utils/light-or-dark')

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


const userColors = {
  light: ['#FC5C51', '#FA790F', '#895DD5', '#0FB297', '#0FC9D6', '#3CA5EC', '#D54FAF'],
  dark: ['#FF8E86', '#FFA357', '#B18FFF', '#4DD6BF', '#45E8D1', '#7AC9FF', '#FF7FD5']
}
const bgImageURL = `http://localhost:${process.env.PORT}/assets/pattern_02.png`

module.exports = async (parm) => {
  if (!parm || typeof parm != 'object') {
    return { error: 'query_empty' }
  }

  let type = parm.type || 'png'
  const format = parm.format || ''
  const ext = parm.ext || false
  const scale = parm.scale ? Math.min(parseFloat(parm.scale), 20) : 2
  let backgroundColor = parm.backgroundColor || '//#292232'
  let messages = parm.messages?.filter(message => message)

  if (!messages?.length) {
    return { error: 'messages_empty' }
  }

  let backgroundColorOne, backgroundColorTwo
  const backgroundColorSplit = backgroundColor.split('/')

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

  messages = await Promise.all(messages
    .map(async message => {
      const avatar = await drawAvatar(message.from)
      const fromId = message.from?.id ? Math.abs(message.from.id) % 7 : 1
      const userColor = userColors[theme][fromId]
      let replyMessage = message.replyMessage

      if (replyMessage && Object.keys(replyMessage) != 0) {
        const replyFromId = replyMessage.from?.id ? Math.abs(replyMessage.from.id) % 7 : 1
        const replyUserColor = userColors[theme][replyFromId]

        replyMessage = {
          from: {
            name: replyMessage.name ?? '',
            color: replyUserColor
          },
          text: replyMessage.text
        }
      } else {
        replyMessage = null
      }

      return {
        from: {
          name: message.from?.name ?? '',
          color: userColor,
          emoji_status: message.from?.emojiStatus ?? '',
          avatar: { url: avatar.toDataURL() }  // TODO optimize
        },
        replyMessage,
        text: message.text ?? ''
      }
    })
  )

  const content = getView(type)({
    scale,
    theme,
    background: {
      image: { url: bgImageURL },
      color1: colorLuminance(backgroundColorTwo, 0.15),
      color2: colorLuminance(backgroundColorOne, 0.15)
    },
    messages
  })

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
    type,
    width,
    height,
    ext
  }
}
