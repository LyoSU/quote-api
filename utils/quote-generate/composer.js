// utils/quote-generate/composer.js

const { createCanvas } = require('canvas')
const { drawRoundRect, drawGradientRoundRect, roundImage, drawReplyLine } = require('./canvas-utils')

function drawQuote (options) {
  const {
    scale = 1,
    background,
    avatar,
    reply,
    name,
    text,
    media
  } = options

  const avatarPosX = 0 * scale
  const avatarPosY = 5 * scale
  const avatarSize = 50 * scale

  const blockPosX = avatarSize + 10 * scale
  const blockPosY = 0

  const indent = 14 * scale

  let mediaType = media ? media.type : null
  let mediaCanvas = media ? media.canvas : null
  let maxMediaSize = media ? media.maxSize : null

  let nameCanvas = (mediaType === 'sticker') ? undefined : name

  let width = 0
  if (nameCanvas) width = nameCanvas.width
  if (text && width < text.width + indent) width = text.width + indent
  if (nameCanvas && width < nameCanvas.width + indent) width = nameCanvas.width + indent
  if (reply) {
    if (width < reply.name.width) width = reply.name.width + indent * 2
    if (reply.text && width < reply.text.width) width = reply.text.width + indent * 2
  }

  let height = indent
  if (text) height += text.height
  else height += indent

  if (nameCanvas) {
    height = nameCanvas.height
    if (text) height = text.height + nameCanvas.height
    else height += indent
  }

  width += blockPosX + indent
  height += blockPosY

  let namePosX = blockPosX + indent
  let namePosY = indent

  if (!nameCanvas) {
    namePosX = 0
    namePosY = -indent
  }

  const textPosX = blockPosX + indent
  let textPosY = indent
  if (nameCanvas) {
    textPosY = nameCanvas.height + indent * 0.25
    height += indent * 0.25
  }

  let replyPosX = 0
  let replyNamePosY = 0
  let replyTextPosY = 0

  if (reply) {
    replyPosX = textPosX + indent

    const replyNameHeight = reply.name.height
    const replyTextHeight = reply.text.height * 0.5

    replyNamePosY = namePosY + replyNameHeight
    replyTextPosY = replyNamePosY + replyTextHeight

    textPosY += replyNameHeight + replyTextHeight + (indent / 4)
    height += replyNameHeight + replyTextHeight + (indent / 4)
  }

  let mediaPosX = 0
  let mediaPosY = 0
  let mediaWidth, mediaHeight

  if (mediaCanvas) {
    mediaWidth = mediaCanvas.width * (maxMediaSize / mediaCanvas.height)
    mediaHeight = maxMediaSize

    if (mediaWidth >= maxMediaSize) {
      mediaWidth = maxMediaSize
      mediaHeight = mediaCanvas.height * (maxMediaSize / mediaCanvas.width)
    }

    if (!text || text.width <= mediaWidth || mediaWidth > (width - blockPosX)) {
      width = mediaWidth + indent * 6
    }

    height += mediaHeight
    if (!text) height += indent

    if (nameCanvas) {
      mediaPosX = namePosX
      mediaPosY = nameCanvas.height + 5 * scale
    } else {
      mediaPosX = blockPosX + indent
      mediaPosY = indent
    }
    if (reply) mediaPosY += replyNamePosY + indent / 2
    textPosY = mediaPosY + mediaHeight + 5 * scale
  }

  let backgroundColorOne = background.colorOne
  let backgroundColorTwo = background.colorTwo

  let rectWidth = width - blockPosX
  let rectHeight = height

  if (mediaType === 'sticker' && (nameCanvas || reply)) {
    rectHeight = reply
      ? (reply.name.height + reply.text.height * 0.5) + indent * 2
      : indent * 2
    backgroundColorOne = backgroundColorTwo = 'rgba(0, 0, 0, 0.5)'
  }

  const canvas = createCanvas(width, height)
  const canvasCtx = canvas.getContext('2d')

  const rectPosX = blockPosX
  const rectPosY = blockPosY
  const rectRoundRadius = 25 * scale

  let rect
  if (mediaType !== 'sticker' || nameCanvas || reply) {
    if (backgroundColorOne === backgroundColorTwo) {
      rect = drawRoundRect(backgroundColorOne, rectWidth, rectHeight, rectRoundRadius)
    } else {
      rect = drawGradientRoundRect(backgroundColorOne, backgroundColorTwo, rectWidth, rectHeight, rectRoundRadius)
    }
  }

  if (avatar) canvasCtx.drawImage(avatar, avatarPosX, avatarPosY, avatarSize, avatarSize)
  if (rect) canvasCtx.drawImage(rect, rectPosX, rectPosY)
  if (nameCanvas) canvasCtx.drawImage(nameCanvas, namePosX, namePosY)
  if (text) canvasCtx.drawImage(text, textPosX, textPosY)
  if (mediaCanvas) canvasCtx.drawImage(roundImage(mediaCanvas, 5 * scale), mediaPosX, mediaPosY, mediaWidth, mediaHeight)

  if (reply) {
    canvasCtx.drawImage(drawReplyLine(3 * scale, reply.name.height + reply.text.height * 0.4, reply.nameColor), textPosX - 3, replyNamePosY)
    canvasCtx.drawImage(reply.name, replyPosX, replyNamePosY)
    canvasCtx.drawImage(reply.text, replyPosX, replyTextPosY)
  }

  return canvas
}

module.exports = { drawQuote }
