// utils/quote-generate/composer.js
//
// Composes a quote bubble from pre-rendered canvases using a DOM/CSS-style
// box model (see layout-box.js): the bubble is a column with padding and a
// uniform vertical gap; every spacing constant lives in SP. No element is
// positioned with ad-hoc offsets — parents size themselves from children.

const { createCanvas } = require('canvas')
const { drawRoundRect, drawGradientRoundRect, roundImage, drawQuoteIcon, drawLabel, drawForwardLabel } = require('./canvas-utils')
const { paintMediaBadges } = require('./attachments')
const { leaf, box, measure, place, render } = require('./layout-box')

// All spacing in logical px (multiplied by scale at use). The single place
// to tune how a quote breathes.
const SP = {
  padX: 16, // bubble inner padding → ink, horizontal
  padY: 12, // bubble inner padding → first metric box (which adds its own slack)
  // Vertical rhythm between solid blocks (reply chip, media, attachment).
  // Text nodes override it with mt 0: their metric line box already carries
  // the air above the cap line, so stacking at 0 lands on the same
  // baseline-to-baseline rhythm as the text's own line height.
  gap: 5,
  headerGap: 8, // min gap between name and sender tag
  maxHeader: 300, // header/forward-label width cap — longer names fade out instead of inflating the bubble
  radius: 25, // bubble corner radius
  radiusGrouped: 7, // corner radius facing a same-sender neighbour bubble
  replyThumb: 34, // reply media thumbnail side
  shadowPad: 12, // canvas margin (right/bottom) so the drop shadow isn't clipped
  shadowPadTop: 4, // canvas margin above the bubble (shadow blur spills up a little)
  glass: 1.25, // frosted-glass hairline width (border + top edge highlight)
  tail: 14, // bubble tail size (when avatar is shown)
  minWidth: 100, // min bubble width
  avatar: 50, // avatar diameter
  avatarGap: 10, // avatar → bubble
  mediaRound: 12, // media corner radius (inside a bubble)
  // Accent block — the modern-Telegram rounded tinted block used for both
  // the reply preview and the partial-quote body: solid bar on the left,
  // accent tint behind, optional ❝ in the corner.
  block: { padY: 6, padL: 10, padR: 10, padRIcon: 22, bar: 3.5, icon: 15, iconInset: 5, radius: 7, tint: 0.14, gap: 3 }
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
    attachment, // pre-rendered in-bubble row canvas (voice/document/audio)
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
      tagLeaf = leaf(drawLabel(senderTag, s(13), background.textColor || '#fff', { alpha: 0.45 }))
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
    forwardNode = leaf(drawForwardLabel(forwardLabel, s(13), accent), { maxW: s(SP.maxHeader) })
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
  const mediaOnly = !!mediaCanvas && !nameCanvas && !text && !reply && !forwardLabel && !attachment

  // Grouped bubbles flatten the left corners that face their neighbours.
  const R = s(SP.radius)
  const rSmall = s(SP.radiusGrouped)
  const radii = {
    tl: groupPos === 'middle' || groupPos === 'last' ? rSmall : R,
    tr: R,
    br: R,
    bl: groupPos === 'first' || groupPos === 'middle' ? rSmall : R
  }

  // Like Telegram, media hugs the bubble edge it borders: with no caption
  // below (or no header above) the bubble padding on that side collapses and
  // the media corners inherit the bubble's own radii.
  const isRound = mediaType === 'video_note' // round video — circular mask
  const hasCaption = Boolean(text) || (Array.isArray(textBlocks) && textBlocks.length > 0) || Boolean(attachment)
  const flushable = !!mediaCanvas && !mediaOnly && !isSticker && !isRound
  const flushBottom = flushable && !hasCaption
  const flushTop = flushable && !nameCanvas && !(isForward && forwardLabel) && !reply

  let mediaNode = null
  if (mediaCanvas) {
    const maxMediaSize = media.maxSize
    let mediaWidth = mediaCanvas.width * (maxMediaSize / mediaCanvas.height)
    let mediaHeight = maxMediaSize
    if (mediaWidth >= maxMediaSize) {
      mediaWidth = maxMediaSize
      mediaHeight = mediaCanvas.height * (maxMediaSize / mediaCanvas.width)
    }
    const mr = s(SP.mediaRound)
    const mediaRadius = mediaOnly || isSticker
      ? s(SP.radius * 0.6)
      : {
        tl: flushTop ? radii.tl : mr,
        tr: flushTop ? radii.tr : mr,
        br: flushBottom ? radii.br : mr,
        bl: flushBottom ? radii.bl : mr
      }
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
          // roundImage clips in SOURCE pixel space; the leaf then scales the
          // result down to n.w×n.h — so the radii must scale up by the same
          // factor or hi-res photos end up with visually smaller corners.
          const k = n.canvas.width / n.w
          const rSrc = typeof mediaRadius === 'number'
            ? mediaRadius * k
            : { tl: mediaRadius.tl * k, tr: mediaRadius.tr * k, br: mediaRadius.br * k, bl: mediaRadius.bl * k }
          ctx.drawImage(roundImage(n.canvas, rSrc), n.x, n.y, n.w, n.h)
        }
        // Video/GIF overlays are painted in destination space so their size
        // doesn't depend on the source media resolution.
        if (media.badge) paintMediaBadges(ctx, n.x, n.y, n.w, n.h, media.badge, scale)
        ctx.restore()
      }
    })
  }

  // Voice/document/audio rows sit in the media slot but behave like text:
  // padded by the bubble, never flush.
  const attachmentNode = attachment ? leaf(attachment.canvas) : null

  let textNode = null
  if (Array.isArray(textBlocks) && textBlocks.length > 0 && !isQuote) {
    // Text with blockquote entities: plain runs and quote runs stack in one
    // column; each quote run gets the accent block treatment.
    const parts = textBlocks.map((b) => {
      if (b.quote) return accentBlock(s, accent, { icon: true, children: [leaf(b.canvas)] })
      const l = leaf(b.canvas)
      if (l) l.mt = s(2) // plain runs carry their own metric air
      return l
    })
    textNode = box({ dir: 'col', gap: s(5), children: parts })
  } else if (text) {
    textNode = isQuote
      ? accentBlock(s, accent, { icon: true, children: [leaf(text)] })
      : leaf(text)
  }
  // Text supplies its own air above the cap line (metric ascent slack) —
  // no extra flow gap, the name reads like the previous text line.
  if (textNode && !isQuote) textNode.mt = 0

  // ---- Tree ---------------------------------------------------------------

  const bubblePad = {
    t: flushTop ? 0 : s(SP.padY),
    r: s(SP.padX),
    b: flushBottom ? 0 : s(SP.padY),
    l: s(SP.padX)
  }
  const tailSize = avatar ? s(SP.tail) : 0

  const bubbleBg = (ctx, n) => {
    const one = background.colorOne
    const two = background.colorTwo
    const glassLw = s(SP.glass)
    const rect = one === two
      ? drawRoundRect(one, n.w, n.h, radii, tailSize, glassLw)
      : drawGradientRoundRect(one, two, n.w, n.h, radii, tailSize, glassLw)
    ctx.save()
    // A soft neutral drop shadow lifts the sticker off any chat wallpaper.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.24)'
    ctx.shadowBlur = s(6)
    ctx.shadowOffsetY = s(2)
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
      children: [headerNode, forwardNode, replyNode, mediaNode, attachmentNode, textNode]
    })
  }

  // ---- Compose ------------------------------------------------------------

  measure(root)

  const shadowPad = s(SP.shadowPad)
  const shadowPadTop = s(SP.shadowPadTop)
  const bubblePosX = s(SP.avatar) + s(SP.avatarGap)
  const width = bubblePosX + root.w + shadowPad
  const height = shadowPadTop + Math.max(root.h, avatar ? s(SP.avatar) + s(2) : 0) + shadowPad

  place(root, bubblePosX, shadowPadTop)

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

module.exports = { drawQuote, SP }
