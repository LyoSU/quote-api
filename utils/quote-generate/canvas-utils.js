const { createCanvas } = require('canvas')

// Draws the bubble path. When tailSize > 0, the bottom-left corner
// becomes a tail: flat bottom extending left, rounded top curving up.
// `r` is a single radius or per-corner {tl, tr, br, bl} (grouped bubbles
// flatten the corners that face their neighbours, like Telegram).
function bubblePath (ctx, w, h, r, tailSize) {
  let { tl, tr, br, bl } = typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : r
  const cap = (v) => Math.min(v, w / 2, h / 2)
  tl = cap(tl)
  tr = cap(tr)
  br = cap(br)
  bl = cap(bl)

  ctx.beginPath()
  ctx.moveTo(tl, 0)
  // top-right corner
  ctx.arcTo(w, 0, w, h, tr)
  // bottom-right corner
  ctx.arcTo(w, h, 0, h, br)

  if (tailSize > 0) {
    const t = tailSize

    // Bottom edge continues FLAT to the left, past the bubble edge
    ctx.lineTo(-t, h)

    // Rounded curve going up-right, back to the left edge of the bubble.
    // Bottom stays flat, top is smoothly rounded.
    ctx.bezierCurveTo(
      -t * 0.4, h,
      0, h - bl * 0.3,
      0, h - bl
    )
  } else {
    // Normal bottom-left rounded corner
    ctx.arcTo(0, h, 0, 0, bl)
  }

  // top-left corner
  ctx.arcTo(0, 0, w, 0, tl)
  ctx.closePath()
}

// Frosted-glass finish over the bubble fill: a hairline inner border plus a
// light top edge that fades out — both clipped to the bubble path so they
// follow the corners and the tail. `lw` is the hairline width in device px.
function paintGlass (ctx, w, h, r, tailSize, lw) {
  ctx.save()
  bubblePath(ctx, w, h, r, tailSize)
  ctx.clip()

  // Uniform hairline border. Stroke is centered on the path; with the clip
  // active only the inner half remains, so double the width.
  bubblePath(ctx, w, h, r, tailSize)
  ctx.lineWidth = lw * 2
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'
  ctx.stroke()

  // Light top edge fading out by ~40% of the height.
  const grad = ctx.createLinearGradient(0, 0, 0, h * 0.4)
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.16)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.lineWidth = lw * 2.6
  ctx.strokeStyle = grad
  ctx.stroke()
  ctx.restore()
}

function drawRoundRect (color, w, h, r, tailSize = 0, glassLw = 0) {
  const extraLeft = tailSize > 0 ? Math.ceil(tailSize * 0.8) : 0
  const canvas = createCanvas(w + extraLeft, h)
  const ctx = canvas.getContext('2d')
  ctx.translate(extraLeft, 0)
  ctx.fillStyle = color
  bubblePath(ctx, w, h, r, tailSize)
  ctx.fill()
  if (glassLw > 0) paintGlass(ctx, w, h, r, tailSize, glassLw)
  canvas._tailOffset = extraLeft
  return canvas
}

function drawGradientRoundRect (colorOne, colorTwo, w, h, r, tailSize = 0, glassLw = 0) {
  const extraLeft = tailSize > 0 ? Math.ceil(tailSize * 0.8) : 0
  const canvas = createCanvas(w + extraLeft, h)
  const ctx = canvas.getContext('2d')
  ctx.translate(extraLeft, 0)
  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, colorOne)
  gradient.addColorStop(1, colorTwo)
  ctx.fillStyle = gradient
  bubblePath(ctx, w, h, r, tailSize)
  ctx.fill()
  if (glassLw > 0) paintGlass(ctx, w, h, r, tailSize, glassLw)
  canvas._tailOffset = extraLeft
  return canvas
}

// Rounds an image's corners. `r` is a single radius or per-corner
// {tl, tr, br, bl} — flush media inherits the bubble's corner radii on the
// edges it touches while keeping the small media radius elsewhere.
function roundImage (image, r) {
  const w = image.width
  const h = image.height
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  let { tl, tr, br, bl } = typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : r
  const cap = (v) => Math.min(v, w / 2, h / 2)
  tl = cap(tl)
  tr = cap(tr)
  br = cap(br)
  bl = cap(bl)
  ctx.beginPath()
  ctx.moveTo(tl, 0)
  ctx.arcTo(w, 0, w, h, tr)
  ctx.arcTo(w, h, 0, h, br)
  ctx.arcTo(0, h, 0, 0, bl)
  ctx.arcTo(0, 0, w, 0, tl)
  ctx.save()
  ctx.clip()
  ctx.closePath()
  ctx.drawImage(image, 0, 0)
  ctx.restore()
  return canvas
}

function drawReplyLine (lineWidth, height, color) {
  const r = lineWidth
  const w = lineWidth
  const h = height + lineWidth
  const x = 5
  const canvas = createCanvas(w + 10, h)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = color
  ctx.beginPath()
  // Top-left: rounded
  ctx.moveTo(x, r)
  ctx.arcTo(x, 0, x + w, 0, r)
  // Top-right: square
  ctx.lineTo(x + w, 0)
  // Right edge straight down
  ctx.lineTo(x + w, h)
  // Bottom-right: square
  ctx.lineTo(x + r, h)
  // Bottom-left: rounded
  ctx.arcTo(x, h, x, 0, r)
  ctx.closePath()
  ctx.fill()

  return canvas
}

function drawQuoteIcon (size, color, alpha = 0.15) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Draw as a single combined path so nothing overlaps
  ctx.fillStyle = color
  ctx.globalAlpha = alpha

  const s = size
  const r = s * 0.09
  const gapX = s * 0.36

  // Build one unified path for both quote marks
  ctx.beginPath()
  addQuoteMarkPath(ctx, s * 0.08, s * 0.15, r, s)
  addQuoteMarkPath(ctx, s * 0.08 + gapX, s * 0.15, r, s)
  ctx.fill()

  return canvas
}

function addQuoteMarkPath (ctx, x, y, r, s) {
  // Comma-shaped glyph: circle on top, tail curving down-left
  const cx = x + r
  const cy = y + r
  // Circle
  ctx.moveTo(cx + r, cy)
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  // Tail
  ctx.moveTo(x + r * 2, cy)
  ctx.quadraticCurveTo(x + r * 2.2, y + s * 0.35, x + r * 0.3, y + s * 0.4)
  ctx.lineTo(x + r * 0.3, y + s * 0.32)
  ctx.quadraticCurveTo(x + r * 1.5, y + s * 0.27, x + r * 0.8, cy)
  ctx.closePath()
}

// Vertical ink bounds of a canvas (rows with any non-transparent pixel),
// or null for a blank canvas. Text canvases from drawMultilineText carry
// transparent slack (~0.8×fontSize below the last baseline), so geometry
// that should follow the VISIBLE glyphs must use these bounds instead of
// canvas height.
function inkBounds (canvas) {
  const w = canvas.width
  const h = canvas.height
  // Plain Images (loadImage results) have no getContext — callers must not
  // trim those; treat them as fully opaque.
  if (w < 1 || h < 1 || typeof canvas.getContext !== 'function') return null
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data
  const rowHasInk = (y) => {
    const off = y * w * 4 + 3
    for (let x = 0; x < w; x++) if (data[off + x * 4] > 8) return true
    return false
  }
  // Scan from both ends — skips the (usually large) solid middle.
  let top = -1
  for (let y = 0; y < h; y++) if (rowHasInk(y)) { top = y; break }
  if (top === -1) return null
  let bottom = top
  for (let y = h - 1; y > top; y--) if (rowHasInk(y)) { bottom = y; break }
  return { top, bottom }
}

// One-line label drawn at metric size: canvas height = ascent + descent of
// the font em box, baseline at ascent. Same geometry rules as multiline
// text — glyph shapes never change the box.
function drawLabel (text, fontSize, color, opts = {}) {
  // Lazy require — canvas-utils is loaded by layout-box before text-prepare.
  const { fontMetrics } = require('./text-prepare')
  const { ascent, descent } = fontMetrics(fontSize)
  const font = `${opts.bold ? 'bold ' : ''}${fontSize}px NotoSans`
  const measure = createCanvas(1, 1).getContext('2d')
  measure.font = font
  const m = measure.measureText(text)

  const canvas = createCanvas(Math.max(1, Math.ceil(m.width)), Math.max(1, Math.ceil(ascent + descent)))
  const ctx = canvas.getContext('2d')
  ctx.font = font
  ctx.fillStyle = color
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha
  ctx.fillText(text, 0, ascent)
  return canvas
}

function drawForwardLabel (text, fontSize, color) {
  return drawLabel(text, fontSize, color, { bold: true })
}

module.exports = { drawRoundRect, drawGradientRoundRect, roundImage, drawReplyLine, drawQuoteIcon, drawLabel, drawForwardLabel, inkBounds }
