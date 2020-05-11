const {
  generateQuote,
  loadCanvasImage
} = require('../utils')
const { createCanvas } = require('canvas')
const sharp = require('sharp')

// https://codepen.io/jreyesgs/pen/yadmge
const addLight = (color, amount) => {
  const cc = parseInt(color, 16) + amount
  let c = (cc > 255) ? 255 : (cc)
  c = (c.toString(16).length > 1) ? c.toString(16) : `0${c.toString(16)}`
  return c
}

const lighten = (color, amount) => {
  color = (color.indexOf('#') >= 0) ? color.substring(1, color.length) : color
  amount = parseInt((255 * amount) / 100)
  color = `#${addLight(color.substring(0, 2), amount)}${addLight(color.substring(2, 4), amount)}${addLight(color.substring(4, 6), amount)}`

  return color
}

module.exports = async (parm) => {
  if (!parm) return { error: 'query_empty' }
  if (!parm.messages || parm.messages.length < 1) return { error: 'messages_empty' }

  const quoteImages = []

  for (const key in parm.messages) {
    const data = parm.messages[key]

    if (data && data.message) {
      const canvasQuote = await generateQuote(parm.backgroundColor, data.message, data.replyMessage, data.entities, parm.width, parm.height, parm.scale)

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

  let quoteImage, width, height

  let type = parm.type

  if (type !== 'image' && canvasQuote.height > 1024 * 2) type = 'png'

  if (type === 'quote') {
    const downPadding = 75
    const maxWidth = 512
    const maxHeight = 512

    const imageQuoteSharp = sharp(canvasQuote.toBuffer())

    if (canvasQuote.height > canvasQuote.width) imageQuoteSharp.resize({ height: maxHeight })
    else imageQuoteSharp.resize({ width: maxWidth })

    const canvasImage = await loadCanvasImage(await imageQuoteSharp.toBuffer())

    const canvasPadding = createCanvas(canvasImage.width, canvasImage.height + downPadding)
    const canvasPaddingCtx = canvasPadding.getContext('2d')

    canvasPaddingCtx.drawImage(canvasImage, 0, 0)

    width = canvasImage.width
    height = canvasImage.height

    quoteImage = await sharp(canvasPadding.toBuffer()).webp({ lossless: true, force: true }).toBuffer()
  } else if (type === 'image') {
    const padding = 25

    const canvasImage = await loadCanvasImage(canvasQuote.toBuffer())

    const canvasPic = createCanvas(canvasImage.width + padding * 2, canvasImage.height + padding * 2)
    const canvasPicCtx = canvasPic.getContext('2d')

    canvasPicCtx.fillStyle = lighten(parm.backgroundColor, 20)
    canvasPicCtx.fillRect(0, 0, canvasPic.width + padding, canvasPic.height + padding)

    const canvasPatternImage = await loadCanvasImage('./assets/pattern_02.png')
    // const canvasPatternImage = await loadCanvasImage('./assets/pattern_ny.png')

    const pattern = canvasPicCtx.createPattern(canvasPatternImage, 'repeat')
    canvasPicCtx.fillStyle = pattern
    canvasPicCtx.fillRect(0, 0, canvasPic.width, canvasPic.height)

    canvasPicCtx.drawImage(canvasImage, padding, padding)

    width = canvasImage.width
    height = canvasImage.height

    quoteImage = await sharp(canvasPic.toBuffer()).png({ lossless: true, force: true }).toBuffer()
  } else {
    width = canvasQuote.width
    height = canvasQuote.height

    quoteImage = canvasQuote.toBuffer()
  }

  return {
    image: quoteImage.toString('base64'),
    type,
    width,
    height
  }
}
