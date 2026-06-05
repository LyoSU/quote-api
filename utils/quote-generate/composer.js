// utils/quote-generate/composer.js
//
// Composes a quote bubble from pre-rendered canvases using a DOM/CSS-style
// box model (see layout-box.js): the bubble is a column with padding and a
// uniform vertical gap; every spacing constant lives in SP. No element is
// positioned with ad-hoc offsets — parents size themselves from children.

const { createCanvas } = require('canvas')
const { drawRoundRect, drawGradientRoundRect, roundImage, drawReplyLine, drawQuoteIcon, drawForwardLabel } = require('./canvas-utils')
const { leaf, box, measure, place, render } = require('./layout-box')

// All spacing in logical px (multiplied by scale at use). The single place
// to tune how a quote breathes.
const SP = {
  padX: 13, // bubble inner padding → ink, horizontal
  padY: 12, // bubble inner padding → ink, vertical
  gap: 8, // vertical rhythm between stacked blocks (name/forward/reply/media/text)
  headerGap: 8, // min gap between name and sender tag
  radius: 25, // bubble corner radius
  tail: 14, // bubble tail size (when avatar is shown)
  minWidth: 100, // min bubble width
  avatar: 50, // avatar diameter
  avatarGap: 10, // avatar → bubble
  mediaRound: 5, // media corner radius
  reply: { indent: 12, gap: 3, bar: 4 }, // reply block: text indent, name↔text gap, bar width
  quote: { padY: 7, padL: 11, padR: 22, bar: 3, icon: 15, iconInset: 5, radius: 8 } // partial-quote block
}

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

  const s = (v) => v * scale
  const accent = nameColor || background.textColor || '#fff'

  const mediaType = media ? media.type : null
  const mediaCanvas = media ? media.canvas : null
  const isSticker = mediaType === 'sticker'
  const nameCanvas = isSticker ? null : name

  // ---- Leaves -------------------------------------------------------------

  let headerNode = null
  if (nameCanvas) {
    let tagLeaf = null
    if (senderTag) {
      const tagFontSize = s(14)
      const tmpCtx = createCanvas(1, 1).getContext('2d')
      tmpCtx.font = `${tagFontSize}px "Noto Sans", "SF Pro", sans-serif`
      const tagW = Math.ceil(tmpCtx.measureText(senderTag).width) + 4
      const tagCanvas = createCanvas(tagW, Math.ceil(tagFontSize * 1.4))
      const tagCtx = tagCanvas.getContext('2d')
      tagCtx.font = `${tagFontSize}px "Noto Sans", "SF Pro", sans-serif`
      tagCtx.fillStyle = background.textColor || '#fff'
      tagCtx.globalAlpha = 0.45
      tagCtx.fillText(senderTag, 0, tagFontSize)
      tagLeaf = leaf(tagCanvas)
    }
    headerNode = tagLeaf
      ? box({ dir: 'row', justify: 'between', align: 'center', gap: s(SP.headerGap), stretch: true, children: [leaf(nameCanvas), tagLeaf] })
      : leaf(nameCanvas)
  }

  let forwardNode = null
  if (isForward && forwardLabel) {
    forwardNode = leaf(drawForwardLabel(forwardLabel, s(22), accent))
  }

  let replyNode = null
  if (reply) {
    replyNode = box({
      dir: 'col',
      gap: s(SP.reply.gap),
      pad: { l: s(SP.reply.indent) },
      bg: (ctx, n) => ctx.drawImage(drawReplyLine(s(SP.reply.bar), n.h - s(SP.reply.bar), reply.nameColor), n.x - 3, n.y),
      children: [leaf(reply.name), leaf(reply.text)]
    })
  }

  let mediaNode = null
  if (mediaCanvas) {
    const maxMediaSize = media.maxSize
    let mediaWidth = mediaCanvas.width * (maxMediaSize / mediaCanvas.height)
    let mediaHeight = maxMediaSize
    if (mediaWidth >= maxMediaSize) {
      mediaWidth = maxMediaSize
      mediaHeight = mediaCanvas.height * (maxMediaSize / mediaCanvas.width)
    }
    mediaNode = leaf(mediaCanvas, {
      trim: false,
      w: mediaWidth,
      h: mediaHeight,
      paint: (ctx, n) => ctx.drawImage(roundImage(n.canvas, s(SP.mediaRound)), n.x, n.y, n.w, n.h)
    })
  }

  let textNode = null
  if (text) {
    textNode = isQuote ? quoteBlock(text, accent, s) : leaf(text)
  }

  // ---- Tree ---------------------------------------------------------------

  const bubblePad = { t: s(SP.padY), r: s(SP.padX), b: s(SP.padY), l: s(SP.padX) }
  const tailSize = avatar ? s(SP.tail) : 0

  const bubbleBg = (ctx, n) => {
    const one = background.colorOne
    const two = background.colorTwo
    const rect = one === two
      ? drawRoundRect(one, n.w, n.h, s(SP.radius), tailSize)
      : drawGradientRoundRect(one, two, n.w, n.h, s(SP.radius), tailSize)
    ctx.drawImage(rect, n.x - (rect._tailOffset || 0), n.y)
  }

  let root
  if (isSticker) {
    // Sticker: no bubble; an optional dark overlay chip holds the reply.
    const chip = replyNode
      ? box({
        pad: bubblePad,
        bg: (ctx, n) => ctx.drawImage(drawRoundRect('rgba(0, 0, 0, 0.5)', n.w, n.h, s(SP.radius), 0), n.x, n.y),
        children: [replyNode]
      })
      : null
    root = box({ dir: 'col', gap: s(SP.gap), children: [chip, mediaNode] })
  } else {
    root = box({
      dir: 'col',
      gap: s(SP.gap),
      pad: bubblePad,
      minW: s(SP.minWidth),
      bg: bubbleBg,
      children: [headerNode, forwardNode, replyNode, mediaNode, textNode]
    })
  }

  // ---- Compose ------------------------------------------------------------

  measure(root)

  const bubblePosX = s(SP.avatar) + s(SP.avatarGap)
  const width = bubblePosX + root.w
  const height = Math.max(root.h, avatar ? s(SP.avatar) + s(2) : 0)

  place(root, bubblePosX, 0)

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  render(ctx, root)

  // Avatar at the bottom-left, over the bubble tail.
  if (avatar) {
    const avatarY = Math.max(0, height - s(SP.avatar) - s(2))
    ctx.drawImage(avatar, 0, avatarY, s(SP.avatar), s(SP.avatar))
  }

  return canvas
}

// Telegram-style block for a partial quote (message.quote): tinted rounded
// backdrop in the sender's accent color, solid bar on the left, solid ❝ in
// the top-right corner. A box like any other — the icon space is just
// right-padding.
function quoteBlock (textCanvas, accent, s) {
  const q = SP.quote
  return box({
    pad: { t: s(q.padY), r: s(q.padR), b: s(q.padY), l: s(q.padL) },
    bg: (ctx, n) => {
      const solid = drawRoundRect(accent, n.w, n.h, s(q.radius), 0)
      ctx.globalAlpha = 0.12
      ctx.drawImage(solid, n.x, n.y)
      ctx.globalAlpha = 1
      ctx.drawImage(solid, 0, 0, s(q.bar), n.h, n.x, n.y, s(q.bar), n.h)
      ctx.drawImage(drawQuoteIcon(s(q.icon), accent, 1), n.x + n.w - s(q.icon) - s(q.iconInset), n.y + s(q.iconInset))
    },
    children: [leaf(textCanvas)]
  })
}

module.exports = { drawQuote }
