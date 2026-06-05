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
  maxHeader: 300, // header/forward-label width cap — longer names fade out instead of inflating the bubble
  radius: 25, // bubble corner radius
  radiusGrouped: 7, // corner radius facing a same-sender neighbour bubble
  replyThumb: 34, // reply media thumbnail side
  shadowPad: 6, // canvas margin so the bubble drop shadow isn't clipped
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
    textBlocks, // [{ canvas, quote: bool }] — text split around blockquote entities
    media,
    isForward,
    forwardLabel,
    nameColor,
    senderTag,
    viaBot, // pre-rendered "via @bot" canvas (or null)
    groupPos = 'single', // single | first | middle | last — corners facing a same-sender neighbour flatten
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
    // The header fits into maxHeader as a whole: the name yields (fades)
    // first, "via @bot" and the tag always stay visible.
    const viaLeaf = viaBot ? leaf(viaBot) : null
    let nameMax = s(SP.maxHeader)
    if (viaLeaf) nameMax -= viaLeaf.w + s(6)
    if (tagLeaf) nameMax -= tagLeaf.w + s(SP.headerGap)
    const nameLeaf = leaf(nameCanvas, { maxW: Math.max(s(40), nameMax) })
    const nameSide = viaLeaf
      ? box({ dir: 'row', align: 'center', gap: s(6), children: [nameLeaf, viaLeaf] })
      : nameLeaf
    headerNode = tagLeaf
      ? box({ dir: 'row', justify: 'between', align: 'center', gap: s(SP.headerGap), stretch: true, children: [nameSide, tagLeaf] })
      : nameSide
  }

  let forwardNode = null
  if (isForward && forwardLabel) {
    forwardNode = leaf(drawForwardLabel(forwardLabel, s(22), accent), { maxW: s(SP.maxHeader) })
  }

  let replyNode = null
  if (reply) {
    // Modern Telegram renders the reply preview as a tinted accent block in
    // the replied sender's color — same visual language as a quote. A media
    // thumbnail (when the replied message has one) sits left of the texts.
    const replyTexts = box({ dir: 'col', gap: s(SP.block.gap), children: [leaf(reply.name), leaf(reply.text)] })
    const inner = reply.thumb
      ? box({
        dir: 'row',
        gap: s(7),
        align: 'center',
        children: [
          leaf(reply.thumb, {
            trim: false,
            w: s(SP.replyThumb),
            h: s(SP.replyThumb),
            paint: (ctx, n) => ctx.drawImage(roundImage(coverSquare(n.canvas), s(4)), n.x, n.y, n.w, n.h)
          }),
          replyTexts
        ]
      })
      : replyTexts
    replyNode = accentBlock(s, reply.nameColor, { children: [inner] })
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
    const isRound = mediaType === 'video_note' // round video — circular mask
    mediaNode = leaf(mediaCanvas, {
      trim: false,
      bleed: !isRound,
      w: isRound ? Math.min(mediaWidth, mediaHeight) : mediaWidth,
      h: isRound ? Math.min(mediaWidth, mediaHeight) : mediaHeight,
      paint: (ctx, n) => {
        ctx.save()
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        if (isRound) {
          ctx.beginPath()
          ctx.arc(n.x + n.w / 2, n.y + n.h / 2, n.w / 2, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(coverSquare(n.canvas), n.x, n.y, n.w, n.h)
        } else {
          ctx.drawImage(roundImage(n.canvas, mediaRadius), n.x, n.y, n.w, n.h)
        }
        ctx.restore()
      }
    })
  }

  let textNode = null
  if (Array.isArray(textBlocks) && textBlocks.length > 0 && !isQuote) {
    // Text with blockquote entities: plain runs and quote runs stack in one
    // column; each quote run gets the accent block treatment.
    const parts = textBlocks.map((b) => b.quote
      ? accentBlock(s, accent, { icon: true, children: [leaf(b.canvas)] })
      : leaf(b.canvas))
    textNode = box({ dir: 'col', gap: s(6), children: parts })
  } else if (text) {
    textNode = isQuote
      ? accentBlock(s, accent, { icon: true, children: [leaf(text)] })
      : leaf(text)
  }

  // ---- Tree ---------------------------------------------------------------

  const bubblePad = { t: s(SP.padY), r: s(SP.padX), b: s(SP.padY), l: s(SP.padX) }
  const tailSize = avatar ? s(SP.tail) : 0

  // Grouped bubbles flatten the left corners that face their neighbours.
  const R = s(SP.radius)
  const rSmall = s(SP.radiusGrouped)
  const radii = {
    tl: groupPos === 'middle' || groupPos === 'last' ? rSmall : R,
    tr: R,
    br: R,
    bl: groupPos === 'first' || groupPos === 'middle' ? rSmall : R
  }

  const bubbleBg = (ctx, n) => {
    const one = background.colorOne
    const two = background.colorTwo
    const rect = one === two
      ? drawRoundRect(one, n.w, n.h, radii, tailSize)
      : drawGradientRoundRect(one, two, n.w, n.h, radii, tailSize)
    ctx.save()
    // A soft drop shadow lifts the sticker off any chat wallpaper.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)'
    ctx.shadowBlur = s(4)
    ctx.shadowOffsetY = s(1)
    ctx.drawImage(rect, n.x - (rect._tailOffset || 0), n.y)
    ctx.restore()
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

  const shadowPad = s(SP.shadowPad)
  const bubblePosX = s(SP.avatar) + s(SP.avatarGap)
  const width = bubblePosX + root.w + shadowPad
  const height = Math.max(root.h, avatar ? s(SP.avatar) + s(2) : 0) + shadowPad

  place(root, bubblePosX, 0)

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  render(ctx, root)

  // Avatar at the bottom-left, over the bubble tail.
  if (avatar) {
    const avatarY = Math.max(0, height - shadowPad - s(SP.avatar) - s(2))
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(avatar, 0, avatarY, s(SP.avatar), s(SP.avatar))
  }

  return canvas
}

// Center-crops an image/canvas to a square (cover fit) for round/thumb media.
function coverSquare (img) {
  const side = Math.min(img.width, img.height)
  if (img.width === img.height) return img
  const out = createCanvas(side, side)
  const ctx = out.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, side, side)
  return out
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
