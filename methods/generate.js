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
    base: hslToHex(h, s, 0.8),
    edge: hslToHex(h, s, 0.68),
    blobs: [hslToHex(h, s, 0.72), hslToHex(h2, s, 0.88), hslToHex(h3, s, 0.84)],
    grain: 2.5,
    doodle: hslToHex(h, Math.min(s, 0.6), 0.32),
    doodleAlpha: 0.12
  }
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
//  mesh   — soft multi-point gradient + vignette + grain
//  doodle — mesh + crisp 1:1 doodle pattern at low opacity (default)
//  aurora — blurred diagonal color bands + soft bokeh discs
async function drawBackdrop (canvas, pal, variant, tileWidth) {
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

  if (variant === 'doodle') {
    const tile = await getPatternTile(tileWidth, pal.doodle)
    ctx.globalAlpha = pal.doodleAlpha
    ctx.fillStyle = ctx.createPattern(tile, 'repeat')
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
  }
}

// Watermark color adapts to the wallpaper: light on dark, dark on light
function watermarkColor (pal) {
  return pal.dark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.38)'
}

module.exports = async (parm) => {
  if (!parm) return { error: 'query_empty' }
  if (!Array.isArray(parm.messages) || parm.messages.length < 1) return { error: 'messages_empty' }

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
  if (type !== 'image' && type !== 'stories' && canvasQuote.height > 1024 * 2) type = 'png'

  if (type === 'quote') {
    const downPadding = 75
    const maxWidth = 512
    const maxHeight = 512

    // A short quote would be upscaled to fill 512px and look gigantic next to
    // a long one. Pad it with transparent space on the right (content stays
    // left-aligned, like a chat) so the upscale never exceeds ~1.3x.
    const minLogicalWidth = Math.round(maxWidth / 1.3)
    let stickerSource = canvasQuote
    if (canvasQuote.height <= canvasQuote.width && canvasQuote.width < minLogicalWidth * scale) {
      stickerSource = createCanvas(minLogicalWidth * scale, canvasQuote.height)
      stickerSource.getContext('2d').drawImage(canvasQuote, 0, 0)
    }

    const imageQuoteSharp = sharp(stickerSource.toBuffer())

    if (stickerSource.height > stickerSource.width) imageQuoteSharp.resize({ height: maxHeight })
    else imageQuoteSharp.resize({ width: maxWidth })

    const canvasImage = await loadImage(await imageQuoteSharp.toBuffer())

    const canvasPadding = createCanvas(canvasImage.width, canvasImage.height + downPadding)
    const canvasPaddingCtx = canvasPadding.getContext('2d')
    canvasPaddingCtx.drawImage(canvasImage, 0, 0)

    const imageSharp = sharp(canvasPadding.toBuffer())

    if (canvasPadding.height >= canvasPadding.width) imageSharp.resize({ height: maxHeight })
    else imageSharp.resize({ width: maxWidth })

    if (format === 'png') quoteImage = await imageSharp.png().toBuffer()
    else quoteImage = await imageSharp.webp({ lossless: true, force: true }).toBuffer()
  } else if (type === 'image') {
    const heightPadding = 75 * scale
    const widthPadding = 95 * scale

    // Draw canvas-to-canvas directly — no need for toBuffer() -> loadImage() round-trip
    const canvasPic = createCanvas(canvasQuote.width + widthPadding, canvasQuote.height + heightPadding)
    const canvasPicCtx = canvasPic.getContext('2d')

    const wp = backdropPalette(background.colorOne, background.colorTwo)
    await drawBackdrop(canvasPic, wp, backdrop, Math.round(288 * scale))

    // Soft ambient lift on top of the bubble's own contact shadow: centered,
    // wide and faint. The old hard 8/8 offset shadow read as a dirty smear.
    canvasPicCtx.shadowOffsetX = 0
    canvasPicCtx.shadowOffsetY = 4 * scale
    canvasPicCtx.shadowBlur = 18 * scale
    canvasPicCtx.shadowColor = wp.dark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.12)'

    canvasPicCtx.drawImage(canvasQuote, widthPadding / 2, heightPadding / 2)

    canvasPicCtx.shadowOffsetX = 0
    canvasPicCtx.shadowOffsetY = 0
    canvasPicCtx.shadowBlur = 0
    canvasPicCtx.shadowColor = 'rgba(0, 0, 0, 0)'

    canvasPicCtx.fillStyle = watermarkColor(wp)
    canvasPicCtx.font = `${8 * scale}px Noto Sans`
    canvasPicCtx.textAlign = 'right'
    canvasPicCtx.fillText('@QuotLyBot', canvasPic.width - 25, canvasPic.height - 25)

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
    canvasPicCtx.shadowColor = storyWp.dark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.12)'

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
    canvasPicCtx.font = '22px Noto Sans'
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
