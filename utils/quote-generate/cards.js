// utils/quote-generate/cards.js
//
// In-bubble cards for Telegram message types with no text/media of their
// own (the bot builds the payloads — quote-bot features/quote/special-types):
//
//   message.checklist  title + round-checkbox task rows (+N, progress footer)
//   message.gift       regular gift card / unique (collectible) gift card
//   message.giveaway   giveaway / winners / completed card (text-centric)
//   message.story      forwarded story row (Bot API carries no story media)
//
// plus two small pieces for the header and the reply chip:
//
//   drawTopicLine   forum topic line (icon + name) above the sender name
//   drawStoryRing   story ring, the reply-chip "thumbnail" of a story reply
//
// A card replaces the bot's plain-text fallback in message.text; a gift's
// own message (gift.text) is drawn under the card, wrapped to its width.
// Every card is laid out with layout-box and returned as one canvas that
// plays the `attachment` slot of the composer (like a voice/document row):
// its visible bounds are exact, hidden margins are carried as `optical`.
// Sizes are logical px from styles.js tokens, multiplied by `scale`.

const { createCanvas } = require('canvas')
const { drawMultilineText } = require('./text-renderer')
const { drawLabel, drawRoundRect, capHeight, setOptical } = require('./canvas-utils')
const { leaf, box, measure, place, render } = require('./layout-box')
const { fontMetrics, loadCustomEmojiImage } = require('./text-prepare')
const { downloadMediaImage } = require('./media')
const { hexToRgb, colorLuminance } = require('./color')

// Card tokens (logical px). Type scale stays body 24 / small 19 / micro 15.
const CARD = {
  body: 24,
  small: 19,
  checkbox: 20, // round checkbox diameter
  ring: 1.5, // unchecked ring stroke
  ringAlpha: 0.35, // unchecked ring, relative to the text color
  // task row → task row (visible bounds). Must beat the line gap INSIDE a
  // wrapped task (24px text: ~12px baseline → next cap line), or wrapped
  // lines read as separate tasks: 6 on top of a line's rhythm.
  taskGap: 16,
  taskLines: 3, // a task wraps to at most this many lines
  maxTasks: 8, // then a muted "+N" row
  sticker: 112, // gift sticker / model box
  symbolPattern: [ // unique gift: symbol rings around the model (radius from model edge)
    { dr: 26, count: 6, size: 22, alpha: 0.5, rot: 0 },
    { dr: 64, count: 10, size: 18, alpha: 0.32, rot: Math.PI / 10 },
    { dr: 104, count: 14, size: 15, alpha: 0.2, rot: 0 }
  ],
  giftW: 264, // gift card width (capped by the bubble's media width); the gift's text wraps to it
  tint: 0.1, // card backdrop: accent at this alpha (classic has no block tint of its own)
  icon: 40, // giveaway emoji
  star: { dark: '#ffc53d', light: '#d98a00' }, // Telegram Stars gold, per theme
  storyDisc: 44, // forwarded-story row disc (= row.disc)
  margin: 12 // hidden canvas margin around a card (glyph accents, ring overflow)
}

// ---- helpers ------------------------------------------------------------------

// Bot sends '#rrggbb'; a raw Bot API RGB24 int is accepted too.
function toColor (v, fallback) {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff) return `#${v.toString(16).padStart(6, '0')}`
  if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v)) return v[0] === '#' ? v : `#${v}`
  return fallback
}

const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// Height budget for `lines` lines (the text layout cuts with "…" past it).
function maxTextHeight (fontSize, lines) {
  return fontMetrics(fontSize).ascent + (lines - 0.5) * fontSize * 1.2
}

// Entity-aware text (emoji, custom emoji, bold…) — never throws, null when empty.
async function text (str, entities, size, color, maxW, lines, o) {
  if (!str) return null
  try {
    const c = await drawMultilineText(String(str), entities || [], size, color, 0, size, maxW, maxTextHeight(size, lines), o.emojiBrand, o.telegram)
    return c.width > 1 ? c : null
  } catch (err) {
    console.warn('cards: text render failed:', err.message)
    return null
  }
}

const bold = (str) => [{ type: 'bold', offset: 0, length: String(str || '').length }]

// Leaf painted with a global alpha (muted text) and/or a shadow.
function paintWith ({ alpha = 1, shadow = null }) {
  return (ctx, n) => {
    ctx.save()
    ctx.globalAlpha = alpha
    if (shadow) {
      ctx.shadowColor = shadow.color
      ctx.shadowBlur = shadow.blur
      ctx.shadowOffsetY = shadow.y
    }
    ctx.drawImage(n.canvas, n.x, n.y - n.trimT)
    ctx.restore()
  }
}

// Image leaf scaled to fit a `side`×`side` box (aspect kept, centered).
function imageLeaf (img, side) {
  const k = side / Math.max(img.width, img.height)
  const w = Math.round(img.width * k)
  const h = Math.round(img.height * k)
  return leaf(img, {
    w: side,
    h: side,
    paint: (ctx, n) => {
      ctx.save()
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(n.canvas, n.x + (n.w - w) / 2, n.y + (n.h - h) / 2, w, h)
      ctx.restore()
    }
  })
}

// Renders a layout tree into its own canvas. Leaves draw their hidden slack
// (accents above the cap line, ring overflow) outside their box, so the
// canvas keeps a margin all around and reports it as `optical` — the
// composer then lays the card out by its visible bounds.
function renderTree (root, scale) {
  const m = Math.round(CARD.margin * scale)
  measure(root)
  place(root, 0, m) // no side margin: the card starts on the bubble's content edge
  const canvas = createCanvas(Math.max(1, root.w), Math.max(1, root.h + 2 * m))
  render(canvas.getContext('2d'), root)
  return setOptical(canvas, m, m)
}

// Rounded card backdrop: the accent at a low alpha, concentric radius.
function cardBg (o, { color = null, alpha = null } = {}) {
  return (ctx, n) => {
    ctx.save()
    ctx.globalAlpha = alpha == null ? (o.P.block.tint || CARD.tint) : alpha
    ctx.drawImage(drawRoundRect(color || o.accent, Math.ceil(n.w), Math.ceil(n.h), o.s(o.P.rich.radius)), n.x, n.y)
    ctx.restore()
  }
}

// Sticker image for a gift: animated/video stickers render from their
// thumbnail (no lottie here), static ones from the file itself.
async function loadSticker (sticker, size, o) {
  if (!sticker || !o.telegram) return null
  const id = sticker.is_animated || sticker.is_video
    ? (sticker.thumb && sticker.thumb.file_id) || null
    : sticker.file_id || (sticker.thumb && sticker.thumb.file_id) || null
  if (!id) return null
  try {
    return await downloadMediaImage(id, size, 'id', false, o.telegram)
  } catch (err) {
    console.warn('cards: sticker load failed:', err.message)
    return null
  }
}

// ---- checklist ------------------------------------------------------------------

// Round checkbox centered on the first line's cap band: done = filled accent
// disc with a white check, open = thin muted ring.
function checkboxLeaf (done, o) {
  const d = o.s(CARD.checkbox)
  const band = capHeight(o.s(CARD.body))
  return leaf(createCanvas(1, 2), {
    w: d,
    h: band,
    paint: (ctx, n) => {
      const cx = n.x + d / 2
      const cy = n.y + n.h / 2
      ctx.save()
      if (done) {
        ctx.fillStyle = o.accent
        ctx.beginPath()
        ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = o.s(2)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(cx - d * 0.22, cy + d * 0.01)
        ctx.lineTo(cx - d * 0.06, cy + d * 0.17)
        ctx.lineTo(cx + d * 0.23, cy - d * 0.15)
        ctx.stroke()
      } else {
        const lw = o.s(CARD.ring)
        ctx.strokeStyle = rgba(o.textColor, CARD.ringAlpha)
        ctx.lineWidth = lw
        ctx.beginPath()
        ctx.arc(cx, cy, d / 2 - lw / 2, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    }
  })
}

async function drawChecklist (c, o) {
  const { s, P, textColor } = o
  const body = s(CARD.body)
  const gutter = s(CARD.checkbox) + s(P.space.inline) // hanging indent of task text
  const textW = Math.max(s(120), o.textW - gutter)
  const tasks = Array.isArray(c.tasks) ? c.tasks : []

  const children = []
  const title = await text(c.title, [...bold(c.title), ...(c.title_entities || [])], body, textColor, o.textW, 3, o)
  if (title) children.push(leaf(title, { role: 'text' }))

  const shown = tasks.slice(0, CARD.maxTasks)
  for (const t of shown) {
    const done = !!t.done
    const canvas = await text(t.text || ' ', t.entities, body, textColor, textW, CARD.taskLines, o)
    const taskLeaf = canvas ? leaf(canvas, { role: 'text', paint: done ? paintWith({ alpha: P.microAlpha }) : null }) : null
    const row = box({ dir: 'row', gap: s(P.space.inline), role: 'text', children: [checkboxLeaf(done, o), taskLeaf] })
    row.mt = children.length ? s(children.length === 1 && title ? P.space.stack : CARD.taskGap) : 0
    children.push(row)
  }

  const more = tasks.length - shown.length
  if (more > 0) {
    const label = drawLabel(`+${more}`, s(CARD.small), textColor, { alpha: P.microAlpha })
    const row = box({ pad: { l: gutter }, children: [leaf(label, { role: 'text' })] })
    row.mt = s(CARD.taskGap)
    children.push(row)
  }

  if (c.footer) {
    const footer = leaf(drawLabel(String(c.footer), s(P.fonts.micro), textColor, { alpha: P.microAlpha }), { role: 'text' })
    footer.mt = s(P.space.stack)
    children.push(footer)
  }
  if (!children.length) return null
  return renderTree(box({ dir: 'col', children }), o.scale)
}

// ---- gifts ------------------------------------------------------------------------

// 5-point star (Telegram Stars) — vector, so it never depends on an emoji font.
function drawStar (size, color) {
  const c = createCanvas(Math.ceil(size), Math.ceil(size))
  const ctx = c.getContext('2d')
  const R = size / 2
  const r = R * 0.48
  ctx.fillStyle = color
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.lineWidth = size * 0.08
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5
    const rr = i % 2 ? r : R * 0.92
    ctx.lineTo(R + rr * Math.cos(a), R * 1.04 + rr * Math.sin(a))
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  return c
}

// "★ 50" pill in Stars gold, tinted like the header role tag.
function starPill (count, o) {
  const { s, P } = o
  const gold = o.light ? CARD.star.light : CARD.star.dark
  const label = drawLabel(Number(count).toLocaleString('en-US'), s(P.fonts.micro), gold, { bold: true })
  const lo = label.optical
  const band = label.height - lo.t - lo.b
  const star = drawStar(band * 1.25, gold)
  const padX = s(P.tag.padX)
  const padY = s(P.tag.padY)
  const gap = s(4)
  const w = Math.ceil(padX * 2 + star.width + gap + label.width)
  const h = Math.ceil(band + padY * 2)
  const c = createCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.globalAlpha = P.tag.tint
  ctx.drawImage(drawRoundRect(gold, w, h, h / 2, 0), 0, 0)
  ctx.globalAlpha = 1
  ctx.drawImage(star, padX, Math.round((h - star.height) / 2))
  ctx.drawImage(label, padX + star.width + gap, padY - lo.t)
  return setOptical(c, 0, 0)
}

async function drawRegularGift (g, o) {
  const { s, P, textColor } = o
  const side = s(CARD.sticker)
  const img = await loadSticker(g.sticker, side, o)
  const art = img
    ? imageLeaf(img, side)
    : leaf(await text('🎁', [], s(64), textColor, s(200), 1, o))

  const title = await text(g.title || 'Gift', bold(g.title || 'Gift'), s(CARD.small), textColor, o.maxW - s(120), 1, o)
  const head = box({
    dir: 'row',
    align: 'center',
    gap: s(P.space.inline),
    children: [title ? leaf(title, { role: 'text' }) : null, g.starCount ? leaf(starPill(g.starCount, o)) : null]
  })
  return box({
    dir: 'col',
    align: 'center',
    gap: s(P.space.inline),
    pad: s(P.space.stack),
    minW: o.giftW,
    bg: cardBg(o),
    children: [art, head.children.length ? head : null]
  })
}

// Faint symbol pattern: tinted copies of the symbol on rings around the
// model, like Telegram's collectible card. Clipped to the card shape.
function paintSymbolPattern (ctx, n, symbol, color, cx, cy, o) {
  const tint = createCanvas(symbol.width, symbol.height)
  const tctx = tint.getContext('2d')
  tctx.drawImage(symbol, 0, 0)
  tctx.globalCompositeOperation = 'source-in'
  tctx.fillStyle = color
  tctx.fillRect(0, 0, tint.width, tint.height)

  const layer = createCanvas(Math.ceil(n.w), Math.ceil(n.h))
  const lctx = layer.getContext('2d')
  lctx.imageSmoothingEnabled = true
  lctx.imageSmoothingQuality = 'high'
  const half = o.s(CARD.sticker) / 2
  for (const ring of CARD.symbolPattern) {
    const r = half + o.s(ring.dr)
    const size = o.s(ring.size)
    const k = size / Math.max(tint.width, tint.height)
    const w = tint.width * k
    const h = tint.height * k
    lctx.globalAlpha = ring.alpha
    for (let i = 0; i < ring.count; i++) {
      const a = ring.rot + (i / ring.count) * Math.PI * 2
      lctx.drawImage(tint, cx - n.x + r * Math.cos(a) - w / 2, cy - n.y + r * Math.sin(a) - h / 2, w, h)
    }
  }
  // keep inside the rounded card
  lctx.globalAlpha = 1
  lctx.globalCompositeOperation = 'destination-in'
  lctx.drawImage(drawRoundRect('#000', layer.width, layer.height, o.s(o.P.rich.radius)), 0, 0)
  ctx.drawImage(layer, n.x, n.y)
}

async function drawUniqueGift (g, o) {
  const { s, P } = o
  const bd = g.backdrop || {}
  const center = toColor(bd.centerColor, '#5a6b8c')
  const edge = toColor(bd.edgeColor, '#2c3650')
  const symbolColor = toColor(bd.symbolColor, colorLuminance(edge, -0.3))
  const side = s(CARD.sticker)
  const W = o.giftW
  const innerW = W - 2 * s(P.space.stack)

  const [model, symbol] = await Promise.all([
    loadSticker(g.model && g.model.sticker, side, o),
    loadSticker(g.symbol && g.symbol.sticker, s(48), o)
  ])
  const art = model ? imageLeaf(model, side) : leaf(await text('🎁', [], s(64), '#fff', s(200), 1, o))
  const shadow = { color: 'rgba(0, 0, 0, 0.28)', blur: s(4), y: s(1) }
  const name = await text(g.name, bold(g.name), s(20), '#fff', innerW, 1, o)
  const attrs = g.attributes ? await text(g.attributes, [], s(P.fonts.micro), '#fff', innerW, 1, o) : null
  const nameLeaf = name ? leaf(name, { role: 'text', paint: paintWith({ shadow }) }) : null
  const attrsLeaf = attrs ? leaf(attrs, { role: 'text', paint: paintWith({ alpha: 0.7, shadow }) }) : null
  if (attrsLeaf) attrsLeaf.mt = s(6)
  if (nameLeaf) nameLeaf.mt = s(P.space.inline)

  const radius = s(P.rich.radius)
  const card = box({
    dir: 'col',
    align: 'center',
    pad: { t: s(16), r: s(P.space.stack), b: s(14), l: s(P.space.stack) },
    minW: W,
    bg: (ctx, n) => {
      const artNode = n.children[0]
      const cx = artNode.x + artNode.w / 2
      const cy = artNode.y + artNode.h / 2
      const bg = createCanvas(Math.ceil(n.w), Math.ceil(n.h))
      const bctx = bg.getContext('2d')
      const grad = bctx.createRadialGradient(cx - n.x, cy - n.y, 0, cx - n.x, cy - n.y, Math.max(n.w, n.h) * 0.72)
      grad.addColorStop(0, center)
      grad.addColorStop(1, edge)
      bctx.fillStyle = grad
      bctx.fillRect(0, 0, bg.width, bg.height)
      bctx.globalCompositeOperation = 'destination-in'
      bctx.drawImage(drawRoundRect('#000', bg.width, bg.height, radius), 0, 0)
      ctx.drawImage(bg, n.x, n.y)
      if (symbol) paintSymbolPattern(ctx, n, symbol, symbolColor, cx, cy, o)
    },
    children: [art, nameLeaf, attrsLeaf]
  })
  return card
}

// ---- giveaway ----------------------------------------------------------------------

async function drawGiveaway (g, o) {
  const { s, P, textColor } = o
  const innerW = o.maxW - 2 * s(P.space.stack)
  const icon = await text(g.kind === 'winners' ? '🏆' : '🎁', [], s(CARD.icon), textColor, s(200), 1, o)
  const title = await text(g.title, bold(g.title), s(CARD.small), textColor, innerW, 2, o)
  const prize = await text(g.prize, [], s(CARD.small), textColor, innerW, 3, o)
  const winners = await text(g.winners, [], s(P.fonts.micro), textColor, innerW, 2, o)
  const metas = []
  for (const line of (Array.isArray(g.meta) ? g.meta : []).slice(0, 3)) {
    const c = await text(line, [], s(P.fonts.micro), textColor, innerW, 2, o)
    if (c) metas.push(c)
  }

  const children = []
  const push = (node, mt) => {
    if (!node) return
    node.mt = children.length ? mt : 0
    children.push(node)
  }
  push(icon && leaf(icon), 0)
  push(title && leaf(title, { role: 'text' }), s(P.space.inline))
  push(prize && leaf(prize, { role: 'text' }), s(CARD.taskGap))
  push(winners && leaf(winners, { role: 'text' }), s(P.space.inline))
  metas.forEach((m, i) => push(leaf(m, { role: 'text', paint: paintWith({ alpha: P.microAlpha }) }), s(i === 0 ? P.space.inline : CARD.taskGap / 2)))
  if (!children.length) return null

  return renderTree(box({
    dir: 'col',
    align: 'center',
    pad: s(P.space.stack),
    minW: o.maxW, // text-heavy: the full media width, so prize/meta lines rarely wrap
    bg: cardBg(o),
    children
  }), o.scale)
}

// ---- story ---------------------------------------------------------------------------

/**
 * Telegram-like story ring: a 2px accent-gradient circle around a softly
 * tinted disc. Used as the reply-chip thumbnail of a story reply and as the
 * lead-in of a forwarded-story row. `d` is the side in device px.
 */
function drawStoryRing (d, accent, scale = 1) {
  const c = createCanvas(Math.ceil(d), Math.ceil(d))
  const ctx = c.getContext('2d')
  const lw = 2 * scale
  const r = d / 2
  const grad = ctx.createLinearGradient(0, d, d, 0)
  grad.addColorStop(0, colorLuminance(accent, -0.15))
  grad.addColorStop(1, colorLuminance(accent, 0.45))
  ctx.strokeStyle = grad
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.arc(r, r, r - lw / 2, 0, Math.PI * 2)
  ctx.stroke()
  // inner disc, one ring-width of air inside the ring
  ctx.globalAlpha = 0.22
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(r, r, r - lw * 2.5, 0, Math.PI * 2)
  ctx.fill()
  // a tiny "play" mark — reads as "story" at 40px without any text
  ctx.globalAlpha = 0.9
  ctx.fillStyle = accent
  const t = d * 0.13
  ctx.beginPath()
  ctx.moveTo(r - t * 0.7, r - t)
  ctx.lineTo(r - t * 0.7, r + t)
  ctx.lineTo(r + t * 1.05, r)
  ctx.closePath()
  ctx.fill()
  return c
}

async function drawStoryRow (st, o) {
  const { s, P, textColor } = o
  const disc = drawStoryRing(s(CARD.storyDisc), o.accent, o.scale)
  const title = drawLabel(String(st.label || 'Story'), s(18), textColor, { bold: true })
  const meta = st.chatName ? await text(st.chatName, [], s(P.fonts.micro), textColor, o.maxW - disc.width - s(12), 1, o) : null
  const texts = box({
    dir: 'col',
    gap: s(8),
    children: [leaf(title, { role: 'text' }), meta ? leaf(meta, { role: 'text', paint: paintWith({ alpha: P.microAlpha }) }) : null]
  })
  return renderTree(box({ dir: 'row', align: 'center', gap: s(12), children: [leaf(disc), texts] }), o.scale)
}

// ---- public ---------------------------------------------------------------------------

/**
 * Card for a special message, or null when the message has none.
 * opts: { scale, style, accent, textColor, width (text width, device px),
 *         telegram, emojiBrand }.
 * Returns { canvas, text, entities }: `text/entities` replace the message's
 * own (the bot's fallback) and are always empty — a gift's own message is
 * drawn inside the card canvas, wrapped to the card width.
 */
async function drawCard (message, opts) {
  if (!message || typeof message !== 'object') return null
  const kind = message.checklist ? 'checklist'
    : message.gift ? 'gift'
      : message.giveaway ? 'giveaway'
        : message.story && typeof message.story === 'object' ? 'story'
          : null
  if (!kind) return null

  const scale = opts.scale || 1
  const s = (v) => v * scale
  const P = opts.style
  const o = {
    ...opts,
    s,
    P,
    scale,
    light: opts.textColor === '#000',
    accent: opts.accent || '#4c9ce2',
    textW: Math.max(s(160), (opts.width || s(512)) * 0.8),
    maxW: Math.max(s(160), (opts.width || s(512)) * 2 / 3)
  }
  o.giftW = Math.round(Math.min(o.maxW, s(CARD.giftW)))

  let canvas = null
  try {
    if (kind === 'checklist') canvas = await drawChecklist(message.checklist, o)
    else if (kind === 'gift') {
      // The gift's own message wraps to the card width, under the card (like
      // Telegram) — as the bubble's text it would stretch the bubble instead.
      const g = message.gift
      const node = g.kind === 'unique' ? await drawUniqueGift(g, o) : await drawRegularGift(g, o)
      const caption = g.text
        ? await text(String(g.text), Array.isArray(g.entities) ? g.entities : [], o.s(CARD.body), o.textColor, o.giftW, 8, o)
        : null
      canvas = renderTree(box({ dir: 'col', gap: o.s(o.P.space.stack), children: [node, caption ? leaf(caption, { role: 'text' }) : null] }), scale)
    } else if (kind === 'giveaway') canvas = await drawGiveaway(message.giveaway, o)
    else canvas = await drawStoryRow(message.story, o)
  } catch (err) {
    console.warn(`cards: ${kind} failed, falling back to text:`, err.message)
    return null
  }
  if (!canvas) return null
  return { canvas, text: '', entities: [] }
}

/**
 * Forum topic header line: [icon] Topic name, micro, muted, one line
 * (ellipsized). The icon is the topic's custom emoji when it loads, else a
 * dot in the topic color. Canvas carries label-like optical insets so the
 * composer measures gaps from its cap line / baseline.
 */
async function drawTopicLine (topic, opts) {
  if (!topic || !topic.name) return null
  const scale = opts.scale || 1
  const s = (v) => v * scale
  const P = opts.style
  const size = s(P.fonts.micro)
  const color = toColor(topic.iconColor, opts.accent || '#6fb9f0')
  const gap = s(6)

  let emoji = null
  if (topic.iconEmojiId && opts.telegram) {
    emoji = await loadCustomEmojiImage(String(topic.iconEmojiId), opts.telegram).catch(() => null)
  }
  const iconSide = emoji ? s(18) : s(10)
  const maxW = s(P.maxHeader) - iconSide - gap
  const label = await text(topic.name, [], size, opts.textColor, maxW, 1, { ...opts })
  if (!label) return null

  const lo = label.optical || { t: 0, b: 0 }
  const band = label.height - lo.t - lo.b
  const bandMid = lo.t + band / 2
  // Grow the canvas if the icon is taller than the label's metric box.
  const extra = Math.max(0, Math.ceil(iconSide / 2 - bandMid), Math.ceil(bandMid + iconSide / 2 - label.height))
  const w = Math.ceil(iconSide + gap + label.width)
  const h = label.height + 2 * extra
  const c = createCanvas(w, h)
  const ctx = c.getContext('2d')
  const cy = extra + bandMid
  if (emoji) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(emoji, 0, cy - iconSide / 2, iconSide, iconSide)
  } else {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(iconSide / 2, cy, iconSide / 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = P.microAlpha
  ctx.drawImage(label, iconSide + gap, extra)
  return setOptical(c, extra + lo.t, extra + lo.b)
}

module.exports = { drawCard, drawTopicLine, drawStoryRing, toColor, CARD }
