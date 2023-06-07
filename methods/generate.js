const path = require('path')
const fs = require('fs')
const { createCanvas, loadImage } = require('canvas')
const sharp = require('sharp')

const render = require('../utils/render')
const getView = require('../utils/get-view')
const drawAvatar = require('../utils/draw-avatar')

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

const buildContent = getView('quote')
// FIXME: doest work
const bgImageURL = fs.readFileSync(
  path.resolve('./assets/pattern_02.png')
).toString('base64')

module.exports = async (parm) => {
  if (!parm) return { error: 'query_empty' }
  if (!parm.messages || !parm.messages.length) return { error: 'messages_empty' }

  let backgroundColor = parm.backgroundColor || '//#292232'
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

  const scale = parm.scale ? Math.min(parseFloat(parm.scale), 20) : 2
  const nameColors = ['red', 'orange', 'purple', 'green', 'sea', 'blue', 'pink']

  const messages = await Promise.all(parm.messages
    .filter(message => message)
    .map(async message => {
      const avatarURL = await drawAvatar(message.from)
      return {
        from: {
          name: message.from?.name ?? '',
          color: nameColors[message.from?.id ? Math.abs(message.from.id) % 7 : 1],
          emoji_status: message.from?.emojiStatus ?? '',
          avatar: { url: avatarURL.toDataURL() }
        },
        text: message.text ?? ''
      }
    })
  )

  if (!messages.length) {
    return { error: 'empty_messages' }
  }

  const content = buildContent({
    scale,
    width: parm.width * scale,
    height: parm.height * scale,
    theme: 'light',
    background: {
      image: { url: bgImageURL, },
      color1: colorLuminance(backgroundColorTwo, 0.15),
      color2: colorLuminance(backgroundColorOne, 0.15)
    },
    messages,
  })
  fs.writeFileSync('./content.html', content)

  let { type, format, ext } = parm
  const quoteImage = await render(content, '#quote')
  const { width, height } = await sharp(quoteImage).metadata()
  const image = ext ? quoteImage : quoteImage.toString('base64')

  if ((!type && ext) || (type != 'image' && height > 1024 * 2)) {
    type = 'png'
  }


  return {
    image,
    type,
    width,
    height,
    ext
  }


  // deprecated // TODO
/*
  for (const message of parm.messages) {
    if (message) {
      const canvasQuote = await quoteGenerate.generate(
        backgroundColorOne,
        backgroundColorTwo,
        message,
        parm.width,
        parm.height,
        parseFloat(parm.scale),
        parm.emojiBrand
      )

      quoteImages.push(canvasQuote)
    }
  }

  let canvasQuote

  if (quoteImages.length > 1) {
    let width = 0
    let height = 0

    for (let index = 0; index < quoteImages.length; index++) {
      if (quoteImages[index].width > width) width = quoteImages[index].width
      height += quoteImages[index].height
    }

    const quoteMargin = 5 * parm.scale

    const canvas = createCanvas(width, height + (quoteMargin * quoteImages.length))
    const canvasCtx = canvas.getContext('2d')

    let imageY = 0

    for (let index = 0; index < quoteImages.length; index++) {
      canvasCtx.drawImage(quoteImages[index], 0, imageY)
      imageY += quoteImages[index].height + quoteMargin
    }
    canvasQuote = canvas
  } else {
    canvasQuote = quoteImages[0]
  }

  let quoteImage

  let { type, format, ext } = parm

  if (!type && ext) type = 'png'
  if (type !== 'image' && type !== 'stories' && canvasQuote.height > 1024 * 2) type = 'png'

  if (type === 'quote') {
    const downPadding = 75
    const maxWidth = 512
    const maxHeight = 512

    const imageQuoteSharp = sharp(canvasQuote.toBuffer())

    if (canvasQuote.height > canvasQuote.width) imageQuoteSharp.resize({ height: maxHeight })
    else imageQuoteSharp.resize({ width: maxWidth })

    const canvasImage = await loadImage(await imageQuoteSharp.toBuffer())

    const canvasPadding = createCanvas(canvasImage.width, canvasImage.height + downPadding)
    const canvasPaddingCtx = canvasPadding.getContext('2d')

    canvasPaddingCtx.drawImage(canvasImage, 0, 0)

    const imageSharp = sharp(canvasPadding.toBuffer())

    if (canvasPadding.height >= canvasPadding.width) imageSharp.resize({ height: maxHeight })
    else imageSharp.resize({ width: maxWidth })

    if (format === 'png') quoteImage = await imageSharp.png().toBuffer()
    else quoteImage = await imageSharp.webp({ lossless: true, force: true }).toBuffer()
  } else if (type === 'image') {
    const heightPadding = 75 * parm.scale
    const widthPadding = 95 * parm.scale

    const canvasImage = await loadImage(canvasQuote.toBuffer())

    const canvasPic = createCanvas(canvasImage.width + widthPadding, canvasImage.height + heightPadding)
    const canvasPicCtx = canvasPic.getContext('2d')

    // radial gradient background (top left)
    const gradient = canvasPicCtx.createRadialGradient(
      canvasPic.width / 2,
      canvasPic.height / 2,
      0,
      canvasPic.width / 2,
      canvasPic.height / 2,
      canvasPic.width / 2
    )

    const patternColorOne = colorLuminance(backgroundColorTwo, 0.15)
    const patternColorTwo = colorLuminance(backgroundColorOne, 0.15)

    gradient.addColorStop(0, patternColorOne)
    gradient.addColorStop(1, patternColorTwo)

    canvasPicCtx.fillStyle = gradient
    canvasPicCtx.fillRect(0, 0, canvasPic.width, canvasPic.height)

    const canvasPatternImage = await loadImage('./assets/pattern_02.png')
    // const canvasPatternImage = await loadImage('./assets/pattern_ny.png');

    const pattern = canvasPicCtx.createPattern(imageAlpha(canvasPatternImage, 0.3), 'repeat')

    canvasPicCtx.fillStyle = pattern
    canvasPicCtx.fillRect(0, 0, canvasPic.width, canvasPic.height)

    // Add shadow effect to the canvas image
    canvasPicCtx.shadowOffsetX = 8
    canvasPicCtx.shadowOffsetY = 8
    canvasPicCtx.shadowBlur = 13
    canvasPicCtx.shadowColor = 'rgba(0, 0, 0, 0.5)'

    // Draw the image to the canvas with padding centered
    canvasPicCtx.drawImage(canvasImage, widthPadding / 2, heightPadding / 2)

    canvasPicCtx.shadowOffsetX = 0
    canvasPicCtx.shadowOffsetY = 0
    canvasPicCtx.shadowBlur = 0
    canvasPicCtx.shadowColor = 'rgba(0, 0, 0, 0)'

    // write text button right
    canvasPicCtx.fillStyle = `rgba(0, 0, 0, 0.3)`
    canvasPicCtx.font = `${8 * parm.scale}px Noto Sans`
    canvasPicCtx.textAlign = 'right'
    canvasPicCtx.fillText('@QuotLyBot', canvasPic.width - 25, canvasPic.height - 25)

    quoteImage = await sharp(canvasPic.toBuffer()).png({ lossless: true, force: true }).toBuffer()
  } else if (type === 'stories') {
    const canvasPic = createCanvas(720, 1280)
    const canvasPicCtx = canvasPic.getContext('2d')

    // radial gradient background (top left)
    const gradient = canvasPicCtx.createRadialGradient(
      canvasPic.width / 2,
      canvasPic.height / 2,
      0,
      canvasPic.width / 2,
      canvasPic.height / 2,
      canvasPic.width / 2
    )

    const patternColorOne = colorLuminance(backgroundColorTwo, 0.25)
    const patternColorTwo = colorLuminance(backgroundColorOne, 0.15)

    gradient.addColorStop(0, patternColorOne)
    gradient.addColorStop(1, patternColorTwo)

    canvasPicCtx.fillStyle = gradient
    canvasPicCtx.fillRect(0, 0, canvasPic.width, canvasPic.height)

    const canvasPatternImage = await loadImage('./assets/pattern_02.png')

    const pattern = canvasPicCtx.createPattern(imageAlpha(canvasPatternImage, 0.3), 'repeat')

    canvasPicCtx.fillStyle = pattern
    canvasPicCtx.fillRect(0, 0, canvasPic.width, canvasPic.height)

    // Add shadow effect to the canvas image
    canvasPicCtx.shadowOffsetX = 8
    canvasPicCtx.shadowOffsetY = 8
    canvasPicCtx.shadowBlur = 13
    canvasPicCtx.shadowColor = 'rgba(0, 0, 0, 0.5)'

    let canvasImage = await loadImage(canvasQuote.toBuffer())

    // мінімальний відступ від країв картинки
    const minPadding = 110

    // resize canvasImage if it is larger than canvasPic + minPadding
    if (canvasImage.width > canvasPic.width - minPadding * 2 || canvasImage.height > canvasPic.height - minPadding * 2) {
      canvasImage = await sharp(canvasQuote.toBuffer()).resize({
        width: canvasPic.width - minPadding * 2,
        height: canvasPic.height - minPadding * 2,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }).toBuffer()

      canvasImage = await loadImage(canvasImage)
    }

    // розмістити canvasImage в центрі по горизонталі і вертикалі
    const imageX = (canvasPic.width - canvasImage.width) / 2
    const imageY = (canvasPic.height - canvasImage.height) / 2

    canvasPicCtx.drawImage(canvasImage, imageX, imageY)

    canvasPicCtx.shadowOffsetX = 0
    canvasPicCtx.shadowOffsetY = 0
    canvasPicCtx.shadowBlur = 0

    // write text vertical left center text
    canvasPicCtx.fillStyle = `rgba(0, 0, 0, 0.4)`
    canvasPicCtx.font = `${16 * parm.scale}px Noto Sans`
    canvasPicCtx.textAlign = 'center'
    canvasPicCtx.translate(70, canvasPic.height / 2)
    canvasPicCtx.rotate(-Math.PI / 2)
    canvasPicCtx.fillText('@QuotLyBot', 0, 0)

    quoteImage = await sharp(canvasPic.toBuffer()).png({ lossless: true, force: true }).toBuffer()
  } else {
    quoteImage = canvasQuote.toBuffer()
  }
*/
}
