const path = require('path')
const { QuoteGenerate } = require('../utils')
const { createCanvas, loadImage } = require('canvas')
const sharp = require('sharp')
const { parseBackgroundColor, lightOrDark, hexToHsl, hslToHex, hexToRgb } = require('../utils/quote-generate/color')
const { brands: emojiBrands } = require('../utils/emoji-image')
const { SP } = require('../utils/quote-generate/composer')
const { getStyle } = require('../utils/quote-generate/styles')

const ALLOWED_EMOJI_BRANDS = new Set(Object.keys(emojiBrands))

function normalizeMessage (message) {
  if (!message.from) {
    message.from = { id: 0 }
  }
  if (!message.from.photo) {
    message.from.photo = {}
  }
  // Grouping compares chatId; without it every message is "undefined" and
  // they all collapse into one group — fall back to the sender id
  if (message.chatId === undefined || message.chatId === null) {
    message.chatId = message.from.id
  }
  if (message.from.name !== false && !message.from.name && (message.from.first_name || message.from.last_name)) {
    message.from.name = [message.from.first_name, message.from.last_name]
      .filter(Boolean)
      .join(' ')
  }
  if (message.replyMessage) {
    if (!message.replyMessage.chatId) {
      message.replyMessage.chatId = message.from.id || 0
    }
    if (!message.replyMessage.entities) {
      message.replyMessage.entities = []
    }
    if (!message.replyMessage.from) {
      message.replyMessage.from = {
        name: message.replyMessage.name,
        photo: {}
      }
    } else if (!message.replyMessage.from.photo) {
      message.replyMessage.from.photo = {}
    }
  }
}

const BACKDROPS = ['mesh', 'doodle', 'aurora']
const DEFAULT_BACKDROP = 'doodle'

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

const rgba = (hex, alpha) => {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Backdrop palette derived from the bubble colors. The bubble must sit ON the
// backdrop, not dissolve into it, and the backdrop must stay CLEAN:
//  • only analogous hues (±14°) — blending far-apart hues in sRGB goes
//    through gray (yellow + pink → olive mud);
//  • edges darken with a deeper shade of the SAME hue, never black — a black
//    vignette desaturates the corners into dirty gray;
//  • dark bubbles → deep tinted dark; light bubbles → pastel (darkening a
//    near-white just makes mud). Near-gray inputs fall back to blue.
function backdropPalette (colorOne, colorTwo) {
  const dark = lightOrDark(colorOne) === 'dark'
  let [h, s] = hexToHsl(colorOne)
  const wall = wallpaperPalette(colorOne, dark)
  if (s < 0.1) {
    h = dark ? 225 : 207
    s = dark ? 0.3 : 0.45
  }
  // A user gradient (#a/#b) keeps its second hue only when it is a neighbour.
  const [h2raw, s2] = hexToHsl(colorTwo)
  const hueDist = Math.abs(((h2raw - h + 540) % 360) - 180)
  let h2 = s2 >= 0.1 && hueDist >= 6 && hueDist <= 40 ? h2raw : h + 14
  // Yellow/orange nudged toward green reads as sickly — go warmer instead.
  const isGreen = (x) => ((x % 360) + 360) % 360 > 55 && ((x % 360) + 360) % 360 < 150
  if (isGreen(h2) && !isGreen(h)) h2 = h - 28
  const h3 = h - 14
  if (dark) {
    s = clamp(s, 0.3, 0.5)
    return {
      dark,
      wall,
      base: hslToHex(h, s, 0.15),
      edge: hslToHex(h, s, 0.08),
      blobs: [hslToHex(h, s, 0.27), hslToHex(h2, s, 0.24), hslToHex(h3, s, 0.21)],
      grain: 3,
      doodle: '#ffffff',
      doodleAlpha: 0.06
    }
  }
  s = clamp(s * 1.6, 0.35, 0.8)
  return {
    dark,
    wall,
    base: hslToHex(h, s, 0.8),
    edge: hslToHex(h, s, 0.68),
    blobs: [hslToHex(h, s, 0.72), hslToHex(h2, s, 0.88), hslToHex(h3, s, 0.84)],
    grain: 2.5,
    doodle: hslToHex(h, Math.min(s, 0.6), 0.32),
    doodleAlpha: 0.12
  }
}

// Telegram-style chat wallpaper for the `doodle` backdrop: a four-color
// freeform gradient with the doodle pattern on top.
//  • light bubble → the gradient is the wall, doodles are a darker ink of it;
//    a neutral (white/gray) bubble gets Telegram's own default green set;
//  • dark bubble → a near-black wall a step darker than the bubble, doodles
//    are drawn WITH the gradient (Telegram's dark themes), so the frame has
//    color without ever competing with the bubble.
// Tinted bubbles derive the four colors from their own hue.
function wallpaperPalette (color, dark) {
  const [h, s, l] = hexToHsl(color)
  const neutral = s < 0.1
  if (dark) {
    return {
      base: neutral ? '#0b0b10' : hslToHex(h, clamp(s, 0.2, 0.4), clamp(l * 0.45, 0.035, 0.07)),
      colors: neutral
        ? ['#fec496', '#dd6cb9', '#962fbf', '#4f5bd5']
        : [hslToHex(h + 40, 0.65, 0.7), hslToHex(h + 10, 0.6, 0.62), hslToHex(h - 25, 0.6, 0.56), hslToHex(h - 55, 0.6, 0.62)],
      glow: 0.05, // the gradient itself, barely there, under the doodles
      alpha: 0.42 // gradient-colored doodles
    }
  }
  // A deep yellow is olive: the two deeper stops of a yellow/orange bubble
  // move toward orange and stay lighter, so the wall reads warm, not khaki.
  const warm = h >= 25 && h <= 75
  const deep = warm ? h - 24 : h
  return {
    colors: neutral
      ? ['#dbddbb', '#6ba587', '#d5d88d', '#88b884']
      : [
        hslToHex(h - (warm ? 12 : 40), 0.45, 0.84),
        hslToHex(deep, warm ? 0.55 : 0.34, warm ? 0.68 : 0.58),
        hslToHex(h - (warm ? 4 : 45), 0.55, 0.77),
        hslToHex(deep + (warm ? 8 : -15), warm ? 0.5 : 0.32, warm ? 0.74 : 0.66)
      ],
    ink: neutral ? '#234a30' : hslToHex(deep, 0.5, 0.22),
    alpha: 0.2
  }
}

// Telegram's freeform gradient: every pixel is a mix of four color points,
// each weighted by (0.9 − distance)⁴. Computed on a tiny grid and scaled up —
// the result is smooth by construction.
const GRADIENT_POINTS = [[0.8, 0.1], [0.35, 0.25], [0.2, 0.9], [0.65, 0.75]]
function freeformGradient (w, h, colors) {
  const gw = 96
  const gh = Math.max(8, Math.min(256, Math.round(gw * h / w)))
  const small = createCanvas(gw, gh)
  const sctx = small.getContext('2d')
  const img = sctx.createImageData(gw, gh)
  const rgb = colors.map(hexToRgb)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let r = 0; let g = 0; let b = 0; let sum = 0
      for (let i = 0; i < 4; i++) {
        const d = Math.max(0, 0.9 - Math.hypot(x / (gw - 1) - GRADIENT_POINTS[i][0], y / (gh - 1) - GRADIENT_POINTS[i][1]))
        const wgt = d * d * d * d
        r += rgb[i][0] * wgt; g += rgb[i][1] * wgt; b += rgb[i][2] * wgt; sum += wgt
      }
      const o = (y * gw + x) * 4
      img.data[o] = r / sum; img.data[o + 1] = g / sum; img.data[o + 2] = b / sum; img.data[o + 3] = 255
    }
  }
  sctx.putImageData(img, 0, 0)
  const out = createCanvas(w, h)
  const ctx = out.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Half a source pixel of overscan: the edge row is not stretched into a band.
  ctx.drawImage(small, 0.5, 0.5, gw - 1, gh - 1, 0, 0, w, h)
  return out
}

async function drawWallpaper (canvas, pal, tileWidth) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const wall = pal.wall
  const gradient = freeformGradient(w, h, wall.colors)
  if (!pal.dark) {
    ctx.drawImage(gradient, 0, 0)
    addGrain(canvas, pal.grain)
    ctx.globalAlpha = wall.alpha
    ctx.fillStyle = ctx.createPattern(await getPatternTile(tileWidth, wall.ink), 'repeat')
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
    return
  }
  ctx.fillStyle = wall.base
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = wall.glow
  ctx.drawImage(gradient, 0, 0)
  ctx.globalAlpha = 1
  addGrain(canvas, pal.grain)
  // Doodles cut out of the gradient.
  const lines = createCanvas(w, h)
  const lctx = lines.getContext('2d')
  lctx.fillStyle = lctx.createPattern(await getPatternTile(tileWidth, '#ffffff'), 'repeat')
  lctx.fillRect(0, 0, w, h)
  lctx.globalCompositeOperation = 'source-in'
  lctx.drawImage(gradient, 0, 0)
  ctx.globalAlpha = wall.alpha
  ctx.drawImage(lines, 0, 0)
  ctx.globalAlpha = 1
}

// Smooth radial blob that fades to nothing (extra stop avoids a hard falloff)
function softBlob (ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, alpha))
  g.addColorStop(0.5, rgba(color, alpha * 0.5))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

// Fine film grain: breaks up 8-bit banding in the smooth gradients
function addGrain (canvas, amount) {
  const ctx = canvas.getContext('2d')
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  // Seeded LCG: identical input → identical output (cacheable, testable)
  let seed = 1234567
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const n = (seed / 0x7fffffff - 0.5) * amount
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

// Doodle tile: downscaled (never upscaled) from the 1440px source with
// lanczos so lines stay crisp, then recolored to a flat tint
const patternTiles = new Map()
async function getPatternTile (tileWidth, color) {
  const key = `${tileWidth}${color}`
  if (!patternTiles.has(key)) {
    const buf = await sharp(path.join(__dirname, '..', 'assets', 'pattern_02.png'))
      .resize({ width: tileWidth, kernel: 'lanczos3' })
      .toBuffer()
    const img = await loadImage(buf)
    const tile = createCanvas(img.width, img.height)
    const tctx = tile.getContext('2d')
    tctx.drawImage(img, 0, 0)
    tctx.globalCompositeOperation = 'source-in'
    tctx.fillStyle = color
    tctx.fillRect(0, 0, tile.width, tile.height)
    patternTiles.set(key, tile)
  }
  return patternTiles.get(key)
}

// Backdrop variants:
//  doodle — Telegram-style wallpaper: freeform gradient + doodles (default)
//  mesh   — soft multi-point gradient + vignette + grain
//  aurora — blurred diagonal color bands + soft bokeh discs
async function drawBackdrop (canvas, pal, variant, tileWidth) {
  if (variant === 'doodle') return drawWallpaper(canvas, pal, tileWidth)
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const R = Math.max(w, h) * 0.75

  ctx.fillStyle = pal.base
  ctx.fillRect(0, 0, w, h)

  if (variant === 'aurora') {
    const bands = [
      { x: 0.3, y: 0.3, rot: -0.55, color: pal.blobs[0], a: 0.95 },
      { x: 0.75, y: 0.72, rot: -0.55, color: pal.blobs[1], a: 0.9 }
    ]
    for (const b of bands) {
      ctx.save()
      ctx.translate(w * b.x, h * b.y)
      ctx.rotate(b.rot)
      ctx.scale(1, 0.32)
      softBlob(ctx, 0, 0, R * 1.1, b.color, b.a)
      ctx.restore()
    }
    // Deterministic bokeh discs (seeded LCG so renders are reproducible)
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const k = Math.max(w, h) / 720
    for (let i = 0; i < 9; i++) {
      const r = (36 + rnd() * 70) * k
      softBlob(ctx, rnd() * w, rnd() * h, r, pal.blobs[i % 3], pal.dark ? 0.35 : 0.5)
    }
  } else {
    softBlob(ctx, w * 0.15, h * 0.2, R, pal.blobs[0], 0.95)
    softBlob(ctx, w * 0.9, h * 0.85, R, pal.blobs[1], 0.9)
    softBlob(ctx, w * 0.8, h * 0.08, R * 0.7, pal.blobs[2], 0.7)
  }

  // Edge falloff in a deeper shade of the same hue keeps the frame calm so
  // the bubble pops — without graying the corners like a black vignette.
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2)
  vg.addColorStop(0, rgba(pal.edge, 0))
  vg.addColorStop(1, rgba(pal.edge, 0.85))
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)

  addGrain(canvas, pal.grain)
}

// Watermark color adapts to the wallpaper: light on dark, dark on light
function watermarkColor (pal) {
  return pal.dark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.38)'
}

// Ambient shadow under the quote. On a light wallpaper it is a deeper shade
// of the wall itself: a black shadow grays the pastel around the bubble.
function ambientShadow (pal, backdrop) {
  if (pal.dark) return 'rgba(0, 0, 0, 0.3)'
  return backdrop === 'doodle' && pal.wall.ink ? rgba(pal.wall.ink, 0.2) : 'rgba(0, 0, 0, 0.12)'
}

// Image mode (a shareable picture on a wallpaper), logical px.
const IMAGE = {
  margin: 48, // wallpaper visible around the quote, every side
  watermark: 11
}

// Bounding box of the solid part of a quote canvas (the soft shadow is far
// below the alpha threshold and does not count).
function visibleBounds (canvas) {
  const w = canvas.width
  const h = canvas.height
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

// ---- Sticker sizing --------------------------------------------------------
// A sticker is at most 512×512 and Telegram shows it small (~190pt on a phone),
// so the only thing that keeps a quote readable is how few pixels the text
// loses on the way into that box. The design size is 1:1 — a 512-wide quote
// with 24px text — and these numbers bound how far a quote may drift from it.
const STICKER = {
  side: 512,
  downPadding: 75, // transparent strip under the quote: Telegram's time badge lands there
  minScale: 0.75, // text never goes below 24 × 0.75 = 18px …
  lineHeight: 28.8, // … which bounds how many text lines a sticker can hold
  charsPerLine: 30, // rough average for a full-width line of 24px text
  minLines: 3,
  rerenderAbove: 1.05, // upscale factor past which a short quote is re-rendered sharper
  maxRenderScale: 6 // … at no more than this canvas scale
}

// Height (logical px) a message takes besides its text lines — a rough model,
// only used to split the line budget.
function messageOverhead (m) {
  let h = 44 // bubble padding + gap to the next bubble
  if (m.groupPos === 'single' || m.groupPos === 'first') h += 32 // name line
  if (m.replyMessage) h += 62
  if (m.forward) h += 26
  if (m.media || (Array.isArray(m.album) && m.album.length)) h += 250
  if (m.voice || m.document || m.audio) h += 56
  return h
}

function estimateLines (m) {
  const text = typeof m.text === 'string' ? m.text : ''
  if (!text) return 0
  return text.split('\n').reduce((n, row) => n + Math.max(1, Math.ceil(row.length / STICKER.charsPerLine)), 0)
}

// The 16-line cap is per message; three long messages used to stack into a
// 900px column squeezed to 12px text. For a sticker the lines are a shared
// budget: every message keeps what it needs while the total fits, otherwise
// the longest ones are cut first (water-filling), never below minLines.
function allocateLines (messages, maxLines) {
  const usable = (STICKER.side - STICKER.downPadding) / STICKER.minScale
  const overhead = messages.reduce((sum, m) => sum + messageOverhead(m), 0)
  const budget = Math.floor((usable - overhead) / STICKER.lineHeight)
  const need = messages.map((m) => Math.min(maxLines, estimateLines(m)))
  if (need.reduce((a, b) => a + b, 0) <= budget) return
  const floor = need.map((n) => Math.min(n, STICKER.minLines))
  let cap = maxLines
  while (cap > STICKER.minLines && need.reduce((sum, n, i) => sum + Math.max(floor[i], Math.min(n, cap)), 0) > budget) cap--
  messages.forEach((m, i) => { if (need[i] > cap) m.maxLines = Math.max(STICKER.minLines, cap) })
}

// canvas.toBuffer('raw') is premultiplied BGRA in native byte order; sharp
// wants straight RGBA. One pass over the pixels beats a PNG encode + decode.
function canvasToSharp (canvas) {
  const src = canvas.toBuffer('raw')
  const out = Buffer.allocUnsafe(src.length)
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]
    if (a === 255) {
      out[i] = src[i + 2]
      out[i + 1] = src[i + 1]
      out[i + 2] = src[i]
      out[i + 3] = 255
    } else if (a === 0) {
      out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0
    } else {
      const k = 255 / a
      out[i] = Math.min(255, Math.round(src[i + 2] * k))
      out[i + 1] = Math.min(255, Math.round(src[i + 1] * k))
      out[i + 2] = Math.min(255, Math.round(src[i] * k))
      out[i + 3] = a
    }
  }
  return sharp(out, { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
}

module.exports = async function generate (parm) {
  if (!parm) return { error: 'query_empty' }
  if (!Array.isArray(parm.messages) || parm.messages.length < 1) return { error: 'messages_empty' }

  // Rendering mutates the messages; a sticker that comes out narrower than
  // 512px is rendered again from this pristine copy (see the sticker branch).
  const sourceMessages = !parm.rerendered && (!parm.type || parm.type === 'quote') ? structuredClone(parm.messages) : null

  const botToken = parm.botToken || process.env.BOT_TOKEN
  const quoteGenerate = new QuoteGenerate(botToken)
  const rawScale = parseFloat(parm.scale) || 2
  const scale = Math.min(20, Math.max(1, Number.isFinite(rawScale) ? rawScale : 2))
  const rawBrand = parm.emojiBrand || 'apple'
  const emojiBrand = ALLOWED_EMOJI_BRANDS.has(rawBrand) ? rawBrand : 'apple'

  const backdrop = BACKDROPS.includes(parm.backdrop) ? parm.backdrop : DEFAULT_BACKDROP

  const background = parseBackgroundColor(parm.backgroundColor)

  // Normalize all messages first (sync, no I/O)
  const validMessages = parm.messages.filter(Boolean)
  for (const message of validMessages) {
    normalizeMessage(message)
    // Style preset ('glass' | 'classic' …) is per request; the renderer reads
    // it per message. Unknown values fall back to the default in styles.js.
    if (parm.style) message.style = String(parm.style)
  }

  // Same-sender runs render with grouped corners (small radii between
  // neighbours), like consecutive messages in Telegram. The avatar (and with
  // it the bubble tail) belongs to the LAST message of a group only — the
  // reserved left column keeps the other bubbles aligned.
  const avatarTop = getStyle(parm.style).avatarAlign === 'top'
  for (let i = 0; i < validMessages.length; i++) {
    const prevSame = i > 0 && validMessages[i - 1].chatId === validMessages[i].chatId
    const nextSame = i < validMessages.length - 1 && validMessages[i + 1].chatId === validMessages[i].chatId
    validMessages[i].groupPos = prevSame && nextSame ? 'middle' : prevSame ? 'last' : nextSame ? 'first' : 'single'
  }
  // One avatar per run: bottom-aligned (glass) on the LAST bubble, top-aligned
  // (classic) on the FIRST. Callers (the bot) may already have de-duplicated
  // it onto the last message, so recompute per run instead of only clearing —
  // otherwise classic cleared the one survivor and the run had no avatar.
  for (let start = 0; start < validMessages.length;) {
    let end = start
    while (end + 1 < validMessages.length && validMessages[end + 1].chatId === validMessages[start].chatId) end++
    const run = validMessages.slice(start, end + 1)
    const wanted = run.some((m) => m.avatar)
    run.forEach((m) => { m.avatar = false })
    validMessages[avatarTop ? start : end].avatar = wanted
    start = end + 1
  }

  // Sticker: the text lines of all messages share one budget.
  if (!parm.type || parm.type === 'quote') allocateLines(validMessages, getStyle(parm.style).maxLines)

  // Generate quotes with concurrency limit to avoid Telegram API rate limits
  const CONCURRENCY = 3
  const quoteImages = new Array(validMessages.length).fill(null)
  let running = 0
  let nextIndex = 0

  await new Promise((resolve) => {
    function runNext () {
      while (running < CONCURRENCY && nextIndex < validMessages.length) {
        const index = nextIndex++
        running++

        quoteGenerate.generate(
          background.colorOne,
          background.colorTwo,
          validMessages[index],
          parm.width,
          parm.height,
          scale,
          emojiBrand
        ).then((canvas) => {
          if (canvas) quoteImages[index] = canvas
          else console.warn('Failed to generate quote for message, skipping')
        }).catch((error) => {
          console.error('Error generating quote for message:', error.message)
        }).finally(() => {
          running--
          if (nextIndex >= validMessages.length && running === 0) resolve()
          else runNext()
        })
      }
      if (validMessages.length === 0) resolve()
    }
    runNext()
  })

  // Filter nulls (failed messages) while preserving order, keeping each
  // image paired with its source message (for grouped-margin decisions).
  const pairs = validMessages
    .map((message, i) => ({ message, image: quoteImages[i] }))
    .filter((p) => p.image)
  const filteredImages = pairs.map((p) => p.image)

  if (filteredImages.length === 0) {
    return { error: 'empty_messages' }
  }

  let canvasQuote

  if (filteredImages.length > 1) {
    let width = 0
    let height = 0

    for (let index = 0; index < filteredImages.length; index++) {
      if (filteredImages[index].width > width) width = filteredImages[index].width
      height += filteredImages[index].height
    }

    // Every bubble canvas carries transparent shadow margins (shadowPadTop
    // above, shadowPad below). Stacking them as-is turned a 2px gap into
    // ~18px, so neighbours overlap by those margins: the visible gap is
    // exactly the margin below, and the next bubble covers the previous
    // shadow's spill. Tighter inside a same-sender group, roomier between.
    const shadowOverlap = (SP.shadowPad + SP.shadowPadTop) * scale
    const margins = []
    let totalMargin = 0
    for (let index = 0; index < pairs.length - 1; index++) {
      const grouped = pairs[index].message.chatId === pairs[index + 1].message.chatId
      const m = (grouped ? 2 : 8) * scale - shadowOverlap
      margins.push(m)
      totalMargin += m
    }

    const canvas = createCanvas(width, height + totalMargin)
    const canvasCtx = canvas.getContext('2d')

    let imageY = 0
    for (let index = 0; index < filteredImages.length; index++) {
      canvasCtx.drawImage(filteredImages[index], 0, imageY)
      imageY += filteredImages[index].height + (margins[index] || 0)
    }
    canvasQuote = canvas
  } else {
    canvasQuote = filteredImages[0]
  }

  let quoteImage

  let { type, format, ext } = parm

  if (!type && ext) type = 'png'
  // Too tall to stay legible once squeezed into a 512px sticker → plain png.
  // Measured in logical px: a sticker is downscaled to 512 whatever the scale,
  // so a higher `scale` must not tip a short quote over the limit.
  if (type !== 'image' && type !== 'stories' && canvasQuote.height / scale > 1024) type = 'png'

  if (type === 'quote') {
    const { side, downPadding } = STICKER
    const srcW = canvasQuote.width
    const srcH = canvasQuote.height

    // One resample, straight from the canvas pixels. The quote always fills
    // the sticker: 512 wide, or (512 − padding) tall when it is the taller
    // side — a one-word quote is scaled up to the full width too.
    const k = Math.min(side / srcW, (side - downPadding) / srcH)

    // A short quote is narrower than the sticker even at `scale`: resampling
    // it up would blur text and emoji, so render it once more at the scale
    // that lands on 512 directly. Avatars and custom emoji come from cache.
    if (sourceMessages && k > STICKER.rerenderAbove && scale < STICKER.maxRenderScale) {
      const exact = Math.min(STICKER.maxRenderScale, Math.ceil(scale * k * 100) / 100)
      return generate({ ...parm, messages: sourceMessages, scale: exact, rerendered: true })
    }
    const outW = Math.max(1, Math.min(side, Math.round(srcW * k)))
    const outH = Math.max(1, Math.min(side - downPadding, Math.round(srcH * k)))

    const imageSharp = canvasToSharp(canvasQuote)
      .resize({ width: outW, height: outH, fit: 'fill', kernel: 'lanczos3' })
      .extend({ bottom: downPadding, background: { r: 0, g: 0, b: 0, alpha: 0 } })

    if (format === 'png') quoteImage = await imageSharp.png().toBuffer()
    else quoteImage = await imageSharp.webp({ lossless: true, force: true }).toBuffer()
  } else if (type === 'image') {
    // One margin on all four sides, measured from what is VISIBLE (avatar and
    // bubble edges) — the quote canvas itself carries uneven transparent
    // slack: shadow room right/below, an empty avatar column when there is
    // no avatar.
    const margin = Math.round(IMAGE.margin * scale)
    const ink = visibleBounds(canvasQuote)
    const canvasPic = createCanvas(ink.w + 2 * margin, ink.h + 2 * margin)
    const canvasPicCtx = canvasPic.getContext('2d')

    const wp = backdropPalette(background.colorOne, background.colorTwo)
    await drawBackdrop(canvasPic, wp, backdrop, Math.round(288 * scale))

    // Soft ambient lift on top of the bubble's own contact shadow: centered,
    // wide and faint. The old hard 8/8 offset shadow read as a dirty smear.
    canvasPicCtx.shadowOffsetX = 0
    canvasPicCtx.shadowOffsetY = 4 * scale
    canvasPicCtx.shadowBlur = 18 * scale
    canvasPicCtx.shadowColor = ambientShadow(wp, backdrop)

    canvasPicCtx.drawImage(canvasQuote, margin - ink.x, margin - ink.y)

    canvasPicCtx.shadowOffsetX = 0
    canvasPicCtx.shadowOffsetY = 0
    canvasPicCtx.shadowBlur = 0
    canvasPicCtx.shadowColor = 'rgba(0, 0, 0, 0)'

    // Signature: right-aligned to the bubble edge, centered in the bottom
    // margin — it sits on the layout grid instead of floating in a corner.
    canvasPicCtx.fillStyle = watermarkColor(wp)
    canvasPicCtx.font = `600 ${IMAGE.watermark * scale}px NotoSans`
    canvasPicCtx.textAlign = 'right'
    canvasPicCtx.textBaseline = 'middle'
    canvasPicCtx.fillText('@QuotLyBot', canvasPic.width - margin, canvasPic.height - margin / 2)

    quoteImage = await sharp(canvasPic.toBuffer()).png({ lossless: true, force: true }).toBuffer()
  } else if (type === 'stories') {
    const canvasPic = createCanvas(720, 1280)
    const canvasPicCtx = canvasPic.getContext('2d')

    const storyWp = backdropPalette(background.colorOne, background.colorTwo)
    await drawBackdrop(canvasPic, storyWp, backdrop, 576)

    // Same soft ambient lift as image mode (absolute px: the canvas is 720 wide)
    canvasPicCtx.shadowOffsetX = 0
    canvasPicCtx.shadowOffsetY = 4
    canvasPicCtx.shadowBlur = 20
    canvasPicCtx.shadowColor = ambientShadow(storyWp, 'doodle')

    // Fit the quote to ~80% of the width (up or down) within the max height;
    // lanczos keeps text crisp. The side watermark lives in the free margin.
    const maxW = Math.round(canvasPic.width * 0.8)
    const maxH = canvasPic.height - 2 * 110
    const fit = Math.min(maxW / canvasQuote.width, maxH / canvasQuote.height)
    const fitW = Math.max(1, Math.round(canvasQuote.width * fit))
    const fitH = Math.max(1, Math.round(canvasQuote.height * fit))

    const resizedBuffer = await sharp(canvasQuote.toBuffer()).resize({
      width: fitW,
      height: fitH,
      fit: 'fill',
      kernel: 'lanczos3'
    }).toBuffer()
    const drawSource = await loadImage(resizedBuffer)

    const imageX = Math.round((canvasPic.width - drawSource.width) / 2)
    // Slightly above geometric center: reads as optically centered
    const imageY = Math.round((canvasPic.height - drawSource.height) / 2 - canvasPic.height * 0.02)

    canvasPicCtx.drawImage(drawSource, imageX, imageY)

    canvasPicCtx.shadowOffsetX = 0
    canvasPicCtx.shadowOffsetY = 0
    canvasPicCtx.shadowBlur = 0

    canvasPicCtx.fillStyle = watermarkColor(storyWp)
    canvasPicCtx.font = '22px NotoSans'
    canvasPicCtx.textAlign = 'center'
    canvasPicCtx.fillText('@QuotLyBot', canvasPic.width / 2, canvasPic.height - 56)

    quoteImage = await sharp(canvasPic.toBuffer()).png({ lossless: true, force: true }).toBuffer()
  } else {
    quoteImage = canvasQuote.toBuffer()
  }

  // Use sharp metadata only when we went through sharp pipeline, otherwise use canvas dimensions
  let width, height
  if (type === 'quote' || type === 'image' || type === 'stories') {
    const imageMetadata = await sharp(quoteImage).metadata()
    width = imageMetadata.width
    height = imageMetadata.height
  } else {
    width = canvasQuote.width
    height = canvasQuote.height
  }

  let image
  if (ext) image = quoteImage
  else image = quoteImage.toString('base64')

  return { image, type, width, height, ext }
}
