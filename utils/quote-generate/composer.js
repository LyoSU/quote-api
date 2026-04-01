// utils/quote-generate/composer.js

const { createCanvas } = require('canvas')
const { drawRoundRect, drawGradientRoundRect, roundImage, drawReplyLine, drawQuoteIcon, drawForwardLabel } = require('./canvas-utils')

function drawQuote (options) {
  const {
    scale = 1,
    background,
    avatar,
    reply,
    name,
    text,
    media,
    isForward,
    forwardLabel,
    nameColor,
    senderTag,
    isQuote
  } = options

  const avatarPosX = 0
  const avatarSize = 50 * scale

  const blockPosX = avatarSize + 10 * scale
  const blockPosY = 0

  const indent = 14 * scale

  let mediaType = media ? media.type : null
  let mediaCanvas = media ? media.canvas : null
  let maxMediaSize = media ? media.maxSize : null

  let nameCanvas = (mediaType === 'sticker') ? undefined : name

  // --- Pre-render forward label ---
  let forwardCanvas = null
  if (isForward && forwardLabel) {
    const fwdFontSize = 22 * scale
    const fwdColor = nameColor || background.textColor || '#fff'
    forwardCanvas = drawForwardLabel(forwardLabel, fwdFontSize, fwdColor)
  }

  // --- Pre-render sender tag ---
  let tagCanvas = null
  if (senderTag && nameCanvas) {
    const tagFontSize = 14 * scale
    const tmpCanvas = createCanvas(1, 1)
    const tmpCtx = tmpCanvas.getContext('2d')
    tmpCtx.font = `${tagFontSize}px "Noto Sans", "SF Pro", sans-serif`
    const tagW = Math.ceil(tmpCtx.measureText(senderTag).width) + 4
    const tagH = Math.ceil(tagFontSize * 1.4)
    tagCanvas = createCanvas(tagW, tagH)
    const tagCtx = tagCanvas.getContext('2d')
    tagCtx.font = `${tagFontSize}px "Noto Sans", "SF Pro", sans-serif`
    tagCtx.fillStyle = background.textColor || '#fff'
    tagCtx.globalAlpha = 0.45
    tagCtx.fillText(senderTag, 0, tagFontSize)
  }

  // ============================
  // ORIGINAL layout math — preserved exactly
  // ============================
  let width = 0
  if (text && width < text.width + indent) width = text.width + indent
  if (nameCanvas && width < nameCanvas.width + indent) width = nameCanvas.width + indent
  if (nameCanvas && tagCanvas && width < nameCanvas.width + tagCanvas.width + indent * 2) {
    width = nameCanvas.width + tagCanvas.width + indent * 2
  }
  if (forwardCanvas && width < forwardCanvas.width + indent) width = forwardCanvas.width + indent
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

  // Forward label adds to height
  if (forwardCanvas) {
    height += forwardCanvas.height + indent * 0.25
  }

  width += blockPosX + indent
  height += blockPosY

  let namePosX = blockPosX + indent
  let namePosY = indent

  if (!nameCanvas) {
    namePosX = 0
    namePosY = -indent
  }

  // Forward label position: below name
  let forwardPosX = blockPosX + indent
  let forwardPosY = 0
  if (forwardCanvas) {
    if (nameCanvas) {
      forwardPosY = namePosY + nameCanvas.height * 0.75
    } else {
      forwardPosY = indent * 0.5
    }
  }

  const textPosX = blockPosX + indent
  let textPosY = indent
  if (nameCanvas) {
    textPosY = nameCanvas.height + indent * 0.25
    height += indent * 0.25
  }
  if (forwardCanvas) {
    textPosY += forwardCanvas.height + indent * 0.25
  }

  let replyPosX = 0
  let replyNamePosY = 0
  let replyTextPosY = 0

  if (reply) {
    replyPosX = textPosX + indent

    const replyNameHeight = reply.name.height
    const replyTextHeight = reply.text.height * 0.5

    replyNamePosY = namePosY + replyNameHeight
    if (forwardCanvas) replyNamePosY += forwardCanvas.height + indent * 0.25
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
      if (forwardCanvas) mediaPosY += forwardCanvas.height + indent * 0.25
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

  // Min bubble width
  const minBubbleWidth = 100 * scale
  if (rectWidth < minBubbleWidth) {
    rectWidth = minBubbleWidth
    width = rectWidth + blockPosX
  }

  // --- Tail ---
  const hasTail = !!avatar
  const tailSize = hasTail ? 14 * scale : 0

  const canvas = createCanvas(width, height)
  const canvasCtx = canvas.getContext('2d')

  const rectPosX = blockPosX
  const rectPosY = blockPosY
  const rectRoundRadius = 25 * scale

  let rect
  let tailOffset = 0
  if (mediaType !== 'sticker' || nameCanvas || reply) {
    if (backgroundColorOne === backgroundColorTwo) {
      rect = drawRoundRect(backgroundColorOne, rectWidth, rectHeight, rectRoundRadius, tailSize)
    } else {
      rect = drawGradientRoundRect(backgroundColorOne, backgroundColorTwo, rectWidth, rectHeight, rectRoundRadius, tailSize)
    }
    tailOffset = rect._tailOffset || 0
  }

  // Avatar at BOTTOM-LEFT
  if (avatar) {
    const avatarY = height - avatarSize - 2 * scale
    canvasCtx.drawImage(avatar, avatarPosX, Math.max(0, avatarY), avatarSize, avatarSize)
  }

  // Bubble background
  if (rect) canvasCtx.drawImage(rect, rectPosX - tailOffset, rectPosY)

  // Name + tag
  if (nameCanvas) {
    if (tagCanvas) {
      const tagX = rectPosX + rectWidth - tagCanvas.width - indent * 0.5
      const tagY = namePosY + (nameCanvas.height - tagCanvas.height) / 2
      const minGap = 8 * scale
      const availableForTag = rectWidth - indent - indent * 0.5

      if (availableForTag >= tagCanvas.width + minGap) {
        const maxNameW = tagX - namePosX - minGap
        if (nameCanvas.width > maxNameW) {
          canvasCtx.save()
          canvasCtx.beginPath()
          canvasCtx.rect(namePosX, namePosY, maxNameW, nameCanvas.height)
          canvasCtx.clip()
          canvasCtx.drawImage(nameCanvas, namePosX, namePosY)
          canvasCtx.restore()
        } else {
          canvasCtx.drawImage(nameCanvas, namePosX, namePosY)
        }
        canvasCtx.drawImage(tagCanvas, tagX, tagY)
      } else {
        canvasCtx.drawImage(nameCanvas, namePosX, namePosY)
      }
    } else {
      canvasCtx.drawImage(nameCanvas, namePosX, namePosY)
    }
  }

  // Forward label
  if (forwardCanvas) canvasCtx.drawImage(forwardCanvas, forwardPosX, forwardPosY)

  // Text
  if (text) canvasCtx.drawImage(text, textPosX, textPosY)

  // Media
  if (mediaCanvas) canvasCtx.drawImage(roundImage(mediaCanvas, 5 * scale), mediaPosX, mediaPosY, mediaWidth, mediaHeight)

  // Reply
  if (reply) {
    canvasCtx.drawImage(drawReplyLine(4 * scale, reply.name.height + reply.text.height * 0.5, reply.nameColor), textPosX - 3, replyNamePosY)
    canvasCtx.drawImage(reply.name, replyPosX, replyNamePosY)
    canvasCtx.drawImage(reply.text, replyPosX, replyTextPosY)

    // Quote icon — only for partial quotes
    if (isQuote) {
      const iconSize = 28 * scale
      const iconColor = background.textColor || '#fff'
      const quoteIcon = drawQuoteIcon(iconSize, iconColor)
      canvasCtx.drawImage(quoteIcon, rectPosX + rectWidth - iconSize - indent * 0.3, replyNamePosY + (reply.name.height - iconSize) / 2)
    }
  }

  return canvas
}

module.exports = { drawQuote }
