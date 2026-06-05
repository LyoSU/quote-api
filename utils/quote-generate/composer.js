// utils/quote-generate/composer.js
//
// Composes a quote bubble from pre-rendered canvases using a DOM/CSS-style
// box model (see layout-box.js): the bubble is a column with padding and a
// uniform vertical gap; every spacing constant lives in SP. No element is
// positioned with ad-hoc offsets — parents size themselves from children.

const { createCanvas } = require('canvas')
const { drawRoundRect, drawGradientRoundRect, roundImage, drawQuoteIcon, drawForwardLabel } = require('./canvas-utils')
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
  mediaRound: 12, // media corner radius (inside a bubble)
  // Accent block — the modern-Telegram rounded tinted block used for both
  // the reply preview and the partial-quote body: solid bar on the left,
  // accent tint behind, optional ❝ in the corner.
  block: { padY: 6, padL: 10, padR: 10, padRIcon: 22, bar: 3, icon: 15, iconInset: 5, radius: 8, tint: 0.12, gap: 2 }
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
    // Modern Telegram renders the reply preview as a tinted accent block in
    // the replied sender's color — same visual language as a quote.
    replyNode = accentBlock(s, reply.nameColor, { children: [leaf(reply.name), leaf(reply.text)] })
  }

  // Media-only bubbles (photo with no caption/name/reply) are pure media:
  // the photo IS the bubble, rounded with the bubble radius.
  const mediaOnly = !!mediaCanvas && !nameCanvas && !text && !reply && !forwardLabel

  let mediaNode = null
  if (mediaCanvas) {
    const maxMediaSize = media.maxSize
    let mediaWidth = mediaCanvas.width * (maxMediaSize / mediaCanvas.height)
    let mediaHeight = maxMediaSize
    if (mediaWidth >= maxMediaSize) {
      mediaWidth = maxMediaSize
      mediaHeight = mediaCanvas.height * (maxMediaSize / mediaCanvas.width)
    }
    const mediaRadius = mediaOnly || isSticker ? s(SP.radius * 0.6) : s(SP.mediaRound)
    mediaNode = leaf(mediaCanvas, {
      trim: false,
      bleed: true, // modern Telegram: media spans the full bubble width
      w: mediaWidth,
      h: mediaHeight,
      paint: (ctx, n) => ctx.drawImage(roundImage(n.canvas, mediaRadius), n.x, n.y, n.w, n.h)
    })
  }

  let textNode = null
  if (text) {
    textNode = isQuote
      ? accentBlock(s, accent, { icon: true, children: [leaf(text)] })
      : leaf(text)
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
      pad: mediaOnly ? 0 : bubblePad,
      minW: mediaOnly ? 0 : s(SP.minWidth),
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

// The modern-Telegram accent block: rounded backdrop tinted with the accent
// color, solid accent bar on the left, optional solid ❝ in the top-right
// corner. Used for the reply preview (accent = replied sender's color) and
// the partial-quote body (accent = quoted sender's color).
function accentBlock (s, accent, { icon = false, children }) {
  const b = SP.block
  return box({
    gap: s(b.gap),
    pad: { t: s(b.padY), r: s(icon ? b.padRIcon : b.padR), b: s(b.padY), l: s(b.padL) },
    bg: (ctx, n) => {
      const solid = drawRoundRect(accent, n.w, n.h, s(b.radius), 0)
      ctx.save()
      ctx.globalAlpha = b.tint
      ctx.drawImage(solid, n.x, n.y)
      ctx.restore()
      ctx.drawImage(solid, 0, 0, s(b.bar), n.h, n.x, n.y, s(b.bar), n.h)
      if (icon) ctx.drawImage(drawQuoteIcon(s(b.icon), accent, 1), n.x + n.w - s(b.icon) - s(b.iconInset), n.y + s(b.iconInset))
    },
    children
  })
}

module.exports = { drawQuote }
