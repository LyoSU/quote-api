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
  const avatarPosY = 5 * scale
  const avatarSize = 50 * scale

  const blockPosX = avatarSize + 10 * scale
  const indent = 14 * scale
  const pad = indent

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

  // --- Pre-render sender tag (plain grey text) ---
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
  // Layout: compute Y positions top-down
  // ============================
  // Everything is relative to inside the bubble (offset by blockPosX later)
  const positions = {}
  const gap = indent * 0.15 // tight gap between elements
  let curY = indent

  // 1. Name
  if (nameCanvas) {
    positions.name = { x: pad, y: curY }
    curY += nameCanvas.height + gap
  }

  // 2. Forward label (below name)
  if (forwardCanvas) {
    if (!nameCanvas) curY = indent
    positions.forward = { x: pad, y: curY }
    curY += forwardCanvas.height + gap
  }

  // 3. Reply block
  if (reply) {
    const replyNameH = reply.name.height
    const replyTextH = reply.text.height

    positions.replyName = { x: pad + indent, y: curY }
    positions.replyText = { x: pad + indent, y: curY + replyNameH }
    positions.replyLine = { x: pad, y: curY }
    positions.replyLineH = replyNameH + replyTextH
    curY += replyNameH + replyTextH + gap * 2
  }

  // No name/forward/reply — keep top padding minimal
  if (!nameCanvas && !forwardCanvas && !reply) {
    curY = indent * 0.5
  }

  // 4. Media
  let mediaWidth, mediaHeight
  if (mediaCanvas) {
    mediaWidth = mediaCanvas.width * (maxMediaSize / mediaCanvas.height)
    mediaHeight = maxMediaSize
    if (mediaWidth >= maxMediaSize) {
      mediaWidth = maxMediaSize
      mediaHeight = mediaCanvas.height * (maxMediaSize / mediaCanvas.width)
    }
    positions.media = { x: pad, y: curY }
    curY += mediaHeight + 5 * scale
  }

  // 5. Text
  if (text) {
    positions.text = { x: pad, y: curY }
    curY += text.height
  }

  // Final bubble height — symmetric bottom padding
  const bottomPad = (!nameCanvas && !forwardCanvas && !reply) ? indent * 0.5 : indent * 0.5
  const bubbleHeight = curY + bottomPad

  // ============================
  // Width calculation
  // ============================
  let contentWidth = 0
  if (text) contentWidth = Math.max(contentWidth, text.width)
  if (nameCanvas) contentWidth = Math.max(contentWidth, nameCanvas.width)
  if (nameCanvas && tagCanvas) contentWidth = Math.max(contentWidth, nameCanvas.width + tagCanvas.width + 8 * scale)
  if (forwardCanvas) contentWidth = Math.max(contentWidth, forwardCanvas.width)
  if (reply) {
    contentWidth = Math.max(contentWidth, reply.name.width + indent)
    if (reply.text) contentWidth = Math.max(contentWidth, reply.text.width + indent)
  }
  if (mediaCanvas && mediaWidth) {
    contentWidth = Math.max(contentWidth, mediaWidth)
  }

  let rectWidth = contentWidth + pad * 2
  const minBubbleWidth = 100 * scale
  if (rectWidth < minBubbleWidth) rectWidth = minBubbleWidth

  let rectHeight = bubbleHeight

  const totalWidth = blockPosX + rectWidth

  let backgroundColorOne = background.colorOne
  let backgroundColorTwo = background.colorTwo

  if (mediaType === 'sticker' && (nameCanvas || reply)) {
    rectHeight = reply
      ? (reply.name.height + reply.text.height * 0.5) + indent * 2
      : indent * 2
    backgroundColorOne = backgroundColorTwo = 'rgba(0, 0, 0, 0.5)'
  }

  // --- Tail ---
  const hasTail = !!avatar
  const tailSize = hasTail ? 14 * scale : 0

  const canvas = createCanvas(totalWidth, rectHeight)
  const canvasCtx = canvas.getContext('2d')

  const rectRoundRadius = 25 * scale

  // Draw bubble
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

  // Avatar at BOTTOM-LEFT, aligned with the tail
  if (avatar) {
    const avatarY = rectHeight - avatarSize - 2 * scale
    canvasCtx.drawImage(avatar, avatarPosX, Math.max(0, avatarY), avatarSize, avatarSize)
  }

  // Draw bubble background (shifted right by tailOffset so tail extends into avatar area)
  const bubbleX = blockPosX - tailOffset
  if (rect) canvasCtx.drawImage(rect, bubbleX, 0)

  // All content is offset by blockPosX (inside the bubble, past the tail)
  const ox = blockPosX

  // Draw name + tag
  if (nameCanvas && positions.name) {
    const nameX = ox + positions.name.x
    const nameY = positions.name.y

    if (tagCanvas) {
      const tagX = ox + rectWidth - tagCanvas.width - pad * 0.5
      const tagY = nameY + (nameCanvas.height - tagCanvas.height) / 2
      const minGap = 8 * scale
      const availableForTag = rectWidth - positions.name.x - pad * 0.5

      if (availableForTag >= tagCanvas.width + minGap) {
        // Tag fits — clip name if it would overlap
        const maxNameW = tagX - nameX - minGap
        if (nameCanvas.width > maxNameW) {
          canvasCtx.save()
          canvasCtx.beginPath()
          canvasCtx.rect(nameX, nameY, maxNameW, nameCanvas.height)
          canvasCtx.clip()
          canvasCtx.drawImage(nameCanvas, nameX, nameY)
          canvasCtx.restore()
        } else {
          canvasCtx.drawImage(nameCanvas, nameX, nameY)
        }
        canvasCtx.drawImage(tagCanvas, tagX, tagY)
      } else {
        // Too narrow — show only name, no tag
        canvasCtx.drawImage(nameCanvas, nameX, nameY)
      }
    } else {
      canvasCtx.drawImage(nameCanvas, nameX, nameY)
    }
  }

  // Draw forward label
  if (forwardCanvas && positions.forward) {
    canvasCtx.drawImage(forwardCanvas, ox + positions.forward.x, positions.forward.y)
  }

  // Draw reply
  if (reply && positions.replyName) {
    canvasCtx.drawImage(
      drawReplyLine(4 * scale, positions.replyLineH, reply.nameColor),
      ox + positions.replyLine.x, positions.replyLine.y
    )
    canvasCtx.drawImage(reply.name, ox + positions.replyName.x, positions.replyName.y)
    canvasCtx.drawImage(reply.text, ox + positions.replyText.x, positions.replyText.y)

    // Quote icon " — only when text is a partial quote (isQuote)
    // Positioned at the reply name level, right side
    if (isQuote) {
      const iconSize = 28 * scale
      const iconColor = background.textColor || '#fff'
      const quoteIcon = drawQuoteIcon(iconSize, iconColor)
      const iconX = ox + rectWidth - iconSize - pad * 0.3
      const iconY = positions.replyName.y + (reply.name.height - iconSize) / 2
      canvasCtx.drawImage(quoteIcon, iconX, iconY)
    }
  }

  // Draw media
  if (mediaCanvas && positions.media) {
    canvasCtx.drawImage(
      roundImage(mediaCanvas, 5 * scale),
      ox + positions.media.x, positions.media.y, mediaWidth, mediaHeight
    )
  }

  // Draw text
  if (text && positions.text) {
    canvasCtx.drawImage(text, ox + positions.text.x, positions.text.y)
  }

  return canvas
}

module.exports = { drawQuote }
