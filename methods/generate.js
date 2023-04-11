const {
  QuoteGenerate
} = require('../utils')
const { createCanvas, loadImage } = require('canvas')
const sharp = require('sharp')

// https://codepen.io/jreyesgs/pen/yadmge
const addLight = (color, amount) => {
  const cc = parseInt(color, 16) + amount
  let c = (cc > 255) ? 255 : (cc)
  c = (c.toString(16).length > 1) ? c.toString(16) : `0${c.toString(16)}`
  return c
}

const normalizeColor = (color) => {
  const canvas = createCanvas(0, 0)
  const canvasCtx = canvas.getContext('2d')

  canvasCtx.fillStyle = color
  color = canvasCtx.fillStyle

  return color
}

const lighten = (color, amount) => {
  color = (color.indexOf('#') >= 0) ? color.substring(1, color.length) : color
  amount = parseInt((255 * amount) / 100)
  color = `#${addLight(color.substring(0, 2), amount)}${addLight(color.substring(2, 4), amount)}${addLight(color.substring(4, 6), amount)}`

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

module.exports = async (parm) => {
  // console.log(JSON.stringify(parm, null, 2))
  if (!parm) return { error: 'query_empty' }
  if (!parm.messages || parm.messages.length < 1) return { error: 'messages_empty' }

  let botToken = parm.botToken || process.env.BOT_TOKEN

  const quoteGenerate = new QuoteGenerate(botToken)

  const quoteImages = []

  let backgroundColor = parm.backgroundColor || '#292232'
  let backgroundColorOne
  let backgroundColorTwo

  const backgroundColorSplit = backgroundColor.split('/')

  if (backgroundColorSplit && backgroundColorSplit.length > 1 && backgroundColorSplit[0] !== '') {
    backgroundColorOne = normalizeColor(backgroundColorSplit[0])
    backgroundColorTwo = normalizeColor(backgroundColorSplit[1])
  } else if (backgroundColor.startsWith('//')) {
    backgroundColor = normalizeColor(backgroundColor.replace('//', ''))
    backgroundColorOne = colorLuminance(backgroundColor, 0.55)
    backgroundColorTwo = colorLuminance(backgroundColor, -0.55)
  } else {
    backgroundColor = normalizeColor(backgroundColor)
    backgroundColorOne = backgroundColor
    backgroundColorTwo = backgroundColor
  }

  for (const key in parm.messages) {
    const message = parm.messages[key]

    if (message) {
      const canvasQuote = await quoteGenerate.generate(
        backgroundColorOne,
        backgroundColorTwo,
        message,
        parm.width,
        parm.height,
        parm.scale,
        parm.emojiBrand
      )

      quoteImages.push(canvasQuote)
    }
  }

  if (quoteImages.length === 0) {
    return {
      error: 'empty_messages'
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

    const quoteMargin = 5

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
  if (type !== 'image' && canvasQuote.height > 1024 * 2) type = 'png'

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
    const padding = 25 * parm.scale

    const canvasImage = await loadImage(canvasQuote.toBuffer())

    const canvasPic = createCanvas(canvasImage.width + padding * 1.7, canvasImage.height + padding * 1.7)
    const canvasPicCtx = canvasPic.getContext('2d')

    const color = lighten(backgroundColorOne, 3)

    // radial gradient background (top left)
    const gradient = canvasPicCtx.createRadialGradient(
      canvasPic.width / 2,
      canvasPic.height / 2,
      0,
      canvasPic.width / 2,
      canvasPic.height / 2,
      canvasPic.width / 2
    )

    gradient.addColorStop(0, colorLuminance(color, 0.35))
    gradient.addColorStop(1, color)

    canvasPicCtx.fillStyle = gradient
    canvasPicCtx.fillRect(0, 0, canvasPic.width, canvasPic.height)

    const canvasPatternImage = await loadImage('./assets/pattern_02.png')
    // const canvasPatternImage = await loadImage('./assets/pattern_ny.png');

    const pattern = canvasPicCtx.createPattern(canvasPatternImage, 'repeat')
    canvasPicCtx.fillStyle = pattern
    canvasPicCtx.fillRect(0, 0, canvasPic.width, canvasPic.height)

    // Add shadow effect to the canvas image
    canvasPicCtx.shadowOffsetX = 8
    canvasPicCtx.shadowOffsetY = 8
    canvasPicCtx.shadowBlur = 13
    canvasPicCtx.shadowColor = 'rgba(0, 0, 0, 0.5)'

    canvasPicCtx.drawImage(canvasImage, padding, padding)

    quoteImage = await sharp(canvasPic.toBuffer()).png({ lossless: true, force: true }).toBuffer()
  } else {
    quoteImage = canvasQuote.toBuffer()
  }

  const imageMetadata = await sharp(quoteImage).metadata()

  const width = imageMetadata.width
  const height = imageMetadata.height

  let image
  if (ext) image = quoteImage
  else image = quoteImage.toString('base64')

  return {
    image,
    type,
    width,
    height,
    ext
  }
}
