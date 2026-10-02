// utils/quote-generate/composer.js
//
// Composes a quote bubble from pre-rendered canvases using a DOM/CSS-style
// box model (see layout-box.js): the bubble is a column with padding and a
// optical vertical gaps; every spacing constant is a token in styles.js
// (P.space). No element is positioned with ad-hoc offsets — parents size
// themselves from children, and all distances are between visible bounds.

const { createCanvas } = require('canvas')
const { drawRoundRect, drawGradientRoundRect, roundImage, drawQuoteIcon, drawLabel, drawForwardLabel, setOptical } = require('./canvas-utils')
const { paintMediaBadges } = require('./attachments')
const { leaf, box, measure, place, render } = require('./layout-box')
const { glass } = require('./styles')

// Design tokens live in styles.js; SP is the default (glass) preset — drawQuote
// takes the resolved preset as `style`, everything below reads it as P.
const SP = glass

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
    senderTagRole, // 'owner' | 'admin' | 'member' (default)
    viaBot, // pre-rendered "via @bot" canvas (or null)
    groupPos = 'single', // single | first | middle | last — corners facing a same-sender neighbour flatten
    isQuote,
    style
  } = options

  const P = style || SP
  const sp = P.space

  const s = (v) => v * scale
  const accent = nameColor || background.textColor || '#fff'

  const mediaType = media ? media.type : null
  const mediaCanvas = media ? media.canvas : null
  // Bare media (sticker, big emoji, round video) has no bubble and no name.
  const isSticker = mediaType === 'sticker' || mediaType === 'video_note'
  const nameCanvas = isSticker ? null : name

  // Vertical rhythm: text over text is tighter than anything next to a block.
  const stackGap = (a, b) => s(a.role === 'text' && b.role === 'text' ? sp.stackTight : sp.stack)

  // ---- Leaves -------------------------------------------------------------

  let headerNode = null
  if (nameCanvas) {
    let tagLeaf = null
    if (senderTag) {
      tagLeaf = leaf(drawTag(senderTag, senderTagRole, P, s, background.textColor || '#fff'), { role: 'text' })
    }
    // The header fits into maxHeader as a whole: the name yields (fades)
    // first, "via @bot" and the tag always stay visible.
    const viaLeaf = viaBot ? leaf(viaBot, { role: 'text' }) : null
    let nameMax = s(P.maxHeader)
    if (viaLeaf) nameMax -= viaLeaf.w + s(sp.inline)
    if (tagLeaf) nameMax -= tagLeaf.w + s(sp.inline)
    const nameLeaf = leaf(nameCanvas, { role: 'text', maxW: Math.max(s(40), nameMax) })
    const nameSide = viaLeaf
      ? box({ dir: 'row', align: 'end', role: 'text', gap: s(sp.inline), children: [nameLeaf, viaLeaf] })
      : nameLeaf
    headerNode = tagLeaf
      ? box({ dir: 'row', justify: 'between', align: tagLeaf && tagLeaf.canvas.pill ? 'center' : 'end', role: 'text', gap: s(sp.inline), stretch: true, children: [nameSide, tagLeaf] })
      : nameSide
  }

  let forwardNode = null
  if (isForward && forwardLabel) {
    forwardNode = leaf(drawForwardLabel(forwardLabel, s(P.fonts.micro), accent), { role: 'text', maxW: s(P.maxHeader) })
  }

  let replyNode = null
  if (reply) {
    // Modern Telegram renders the reply preview as a tinted accent block in
    // the replied sender's color — same visual language as a quote. A media
    // thumbnail (when the replied message has one) sits left of the texts.
    const replyTexts = box({ dir: 'col', gap: s(P.block.gap), children: [leaf(reply.name, { role: 'text' }), reply.text ? leaf(reply.text, { role: 'text' }) : null] })
    const inner = reply.thumb
      ? box({
        dir: 'row',
        gap: s(P.block.thumbGap),
        align: 'center',
        children: [
          leaf(reply.thumb, {
            trim: false,
            w: s(P.replyThumb),
            h: s(P.replyThumb),
            paint: (ctx, n) => ctx.drawImage(roundImage(coverSquare(n.canvas), s(P.block.thumbRadius)), n.x, n.y, n.w, n.h)
          }),
          replyTexts
        ]
      })
      : replyTexts
    replyNode = accentBlock(P, s, reply.nameColor, { children: [inner] })
  }

  // Media-only bubbles (photo with no caption/name/reply) are pure media:
  // the photo IS the bubble, rounded with the bubble radius.
  const mediaOnly = !!mediaCanvas && !nameCanvas && !text && !reply && !forwardLabel && !attachment

  // Grouped bubbles flatten the left corners that face their neighbours
  // (styles with uniform corners keep them round).
  const R = s(P.radius)
  const rSmall = P.groupCorners ? s(P.radiusGrouped) : R
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
    const mr = s(P.minRadius) // inset corners: concentric radius bottoms out at the floor
    const mediaRadius = mediaOnly || isSticker
      ? s(P.radius * 0.6)
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
        if (media.badge) paintMediaBadges(ctx, n.x, n.y, n.w, n.h, media.badge, scale, P)
        ctx.restore()
      }
    })
  }

  // Voice/document/audio rows sit in the media slot but behave like text:
  // padded by the bubble, never flush.
  const attachmentNode = attachment ? leaf(attachment.canvas) : null

  let textNode = null
  if (Array.isArray(textBlocks) && textBlocks.length > 0 && isQuote) {
    // Partial quote whose text also has blockquote entities: every run goes
    // inside the one quote frame (no nested frames), nothing is dropped.
    const runs = textBlocks.map((b) => leaf(b.canvas, { role: 'text' }))
    textNode = accentBlock(P, s, accent, { icon: true, children: [box({ dir: 'col', role: 'text', gap: stackGap, children: runs })] })
  } else if (Array.isArray(textBlocks) && textBlocks.length > 0) {
    // Text with blockquote entities: plain runs and quote runs stack in one
    // column; each quote run gets the accent block treatment.
    const parts = textBlocks.map((b) => {
      if (b.quote) return accentBlock(P, s, accent, { icon: true, children: [leaf(b.canvas)] })
      return leaf(b.canvas, { role: 'text' })
    })
    textNode = box({ dir: 'col', role: 'text', gap: stackGap, children: parts })
  } else if (text) {
    textNode = isQuote
      ? accentBlock(P, s, accent, { icon: true, children: [leaf(text)] })
      : leaf(text, { role: 'text' })
  }

  // Media runs edge to edge: when the bubble is wider than the photo (a long
  // caption, a wide reply chip) the photo scales up to the bubble width — a
  // modest factor only, tall portraits stay centered rather than balloon.
  if (mediaNode && flushable) {
    let inner = 0
    for (const n of [headerNode, forwardNode, replyNode, attachmentNode, textNode]) {
      if (!n) continue
      measure(n)
      inner = Math.max(inner, n.w)
    }
    const need = inner + 2 * s(sp.inset.x)
    if (need > mediaNode.w && need <= mediaNode.w * 1.25) {
      mediaNode.h *= need / mediaNode.w
      mediaNode.w = need
    }
  }

  // ---- Tree ---------------------------------------------------------------

  const bubblePad = {
    t: flushTop ? 0 : s(sp.inset.y),
    r: s(sp.inset.x),
    b: flushBottom ? 0 : s(sp.inset.y),
    l: s(sp.inset.x)
  }
  const tailSize = avatar && P.tail ? s(P.tailSize) : 0

  const bubbleBg = (ctx, n) => {
    const one = background.colorOne
    const two = background.colorTwo
    const glassLw = s(P.glass) // 0 → flat fill
    const rect = one === two
      ? drawRoundRect(one, n.w, n.h, radii, tailSize, glassLw)
      : drawGradientRoundRect(one, two, n.w, n.h, radii, tailSize, glassLw)
    ctx.save()
    // A soft neutral drop shadow lifts the sticker off any chat wallpaper.
    applyShadow(ctx, P, s)
    ctx.drawImage(rect, n.x - (rect._tailOffset || 0), n.y)
    ctx.restore()
  }

  let root
  if (isSticker) {
    // Sticker: no bubble; an optional chip holds the reply. It is a small
    // glass bubble in the theme color (not a fixed dark overlay), so the
    // reply text — drawn in the theme's text color — stays readable.
    const chip = replyNode
      ? box({
        pad: s(sp.chip),
        bg: (ctx, n) => {
          const one = background.colorOne
          const two = background.colorTwo
          const r = s(P.chipRadius)
          const rect = one === two
            ? drawRoundRect(one, n.w, n.h, r, 0, s(P.glass))
            : drawGradientRoundRect(one, two, n.w, n.h, r, 0, s(P.glass))
          ctx.save()
          applyShadow(ctx, P, s)
          ctx.drawImage(rect, n.x, n.y)
          ctx.restore()
        },
        children: [replyNode]
      })
      : null
    root = box({ dir: 'col', gap: stackGap, children: [chip, mediaNode] })
  } else {
    root = box({
      dir: 'col',
      gap: stackGap,
      pad: mediaOnly ? 0 : bubblePad,
      minW: mediaOnly ? 0 : s(P.minWidth),
      bg: bubbleBg,
      children: [headerNode, forwardNode, replyNode, mediaNode, attachmentNode, textNode]
    })
  }

  // ---- Compose ------------------------------------------------------------

  measure(root)

  const shadowPad = s(P.shadowPad)
  const shadowPadTop = s(P.shadowPadTop)
  const bubblePosX = s(P.avatar) + s(P.avatarGap)
  const width = bubblePosX + root.w + shadowPad
  const avatarH = !avatar ? 0 : P.avatarAlign === 'top' ? s(P.avatarTop) + s(P.avatar) : s(P.avatar) + s(2)
  const height = shadowPadTop + Math.max(root.h, avatarH) + shadowPad

  place(root, bubblePosX, shadowPadTop)

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  render(ctx, root)

  // Visible-bounds metadata for tests/tools: bubble rect and the box the eye
  // reads as its content (first/last in-flow child edges), canvas px.
  if (!isSticker) {
    const kids = root.children
    canvas.layout = {
      scale,
      bubble: { x: root.x, y: root.y, w: root.w, h: root.h },
      content: {
        top: Math.min(...kids.map((c) => c.y)),
        bottom: Math.max(...kids.map((c) => c.y + c.h)),
        // full-bleed media is edge to edge by design — sides read from the rest
        left: Math.min(...(kids.filter((c) => !c.bleed).length ? kids.filter((c) => !c.bleed) : kids).map((c) => c.x)),
        right: Math.max(...(kids.filter((c) => !c.bleed).length ? kids.filter((c) => !c.bleed) : kids).map((c) => c.x + c.w))
      },
      flush: { top: flushTop, bottom: flushBottom },
      mediaOnly,
      bleed: kids.some((c) => c.bleed),
      minW: root.minW
    }
  }

  // Avatar bottom-left over the bubble tail (glass), or top-left level with
  // the bubble's top edge (classic).
  if (avatar) {
    const avatarY = P.avatarAlign === 'top'
      ? shadowPadTop + s(P.avatarTop)
      : Math.max(0, height - shadowPad - s(P.avatar) - s(2))
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(avatar, 0, avatarY, s(P.avatar), s(P.avatar))
  }

  return canvas
}

// Header tag: a role pill (owner purple, admin green — tinted fill, colored
// text) or plain muted text (member / unknown). The pill wraps the label's
// visible band (cap line → baseline) with the token padding, so it is an
// optical box like everything else.
function drawTag (text, role, P, s, textColor) {
  const size = s(P.fonts.micro)
  const colors = P.tag.colors[role]
  if (!colors) return drawLabel(text, size, textColor, { alpha: P.microAlpha })
  const color = textColor === '#000' ? colors.light : colors.dark
  const label = drawLabel(text, size, color)
  const o = label.optical
  const padX = s(P.tag.padX)
  const padY = s(P.tag.padY)
  const w = Math.ceil(label.width + 2 * padX)
  const h = Math.ceil(label.height - o.t - o.b + 2 * padY)
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.globalAlpha = P.tag.tint
  ctx.drawImage(drawRoundRect(color, w, h, h / 2, 0), 0, 0)
  ctx.globalAlpha = 1
  ctx.drawImage(label, padX, padY - o.t)
  canvas.pill = true
  return setOptical(canvas, 0, 0)
}

// Soft drop shadow (no-op for flat styles).
function applyShadow (ctx, P, s) {
  if (!P.shadow) return
  ctx.shadowColor = P.shadow.color
  ctx.shadowBlur = s(P.shadow.blur)
  ctx.shadowOffsetY = s(P.shadow.y)
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
function accentBlock (P, s, accent, { icon = false, children }) {
  const b = P.block
  return box({
    gap: s(b.gap),
    pad: { t: s(b.padY), r: s(icon ? b.padRIcon : b.padR), b: s(b.padY), l: s(b.padL) },
    bg: (ctx, n) => {
      if (P.replyStyle === 'line') {
        // Thin rounded accent bar, no tinted backdrop.
        ctx.drawImage(drawRoundRect(accent, Math.ceil(s(b.bar)), n.h, s(b.bar) / 2), n.x, n.y)
        if (icon) ctx.drawImage(drawQuoteIcon(s(b.icon), accent, 1), n.x + n.w - s(b.icon) - s(b.iconInset), n.y + s(b.iconInset))
        return
      }
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
