const { createCanvas } = require('canvas')

// Draws the bubble path. When tailSize > 0, the bottom-left corner
// becomes a tail: flat bottom extending left, rounded top curving up.
function bubblePath (ctx, w, h, r, tailSize) {
  if (w < 2 * r) r = w / 2
  if (h < 2 * r) r = h / 2

  ctx.beginPath()
  ctx.moveTo(r, 0)
  // top-right corner
  ctx.arcTo(w, 0, w, h, r)
  // bottom-right corner
  ctx.arcTo(w, h, 0, h, r)

  if (tailSize > 0) {
    const t = tailSize

    // Bottom edge continues FLAT to the left, past the bubble edge
    ctx.lineTo(-t, h)

    // Rounded curve going up-right, back to the left edge of the bubble.
    // Bottom stays flat, top is smoothly rounded.
    ctx.bezierCurveTo(
      -t * 0.4, h,
      0, h - r * 0.3,
      0, h - r
    )
  } else {
    // Normal bottom-left rounded corner
    ctx.arcTo(0, h, 0, 0, r)
  }

  // top-left corner
  ctx.arcTo(0, 0, w, 0, r)
  ctx.closePath()
}

function drawRoundRect (color, w, h, r, tailSize = 0) {
  const extraLeft = tailSize > 0 ? Math.ceil(tailSize * 0.8) : 0
  const canvas = createCanvas(w + extraLeft, h)
  const ctx = canvas.getContext('2d')
  ctx.translate(extraLeft, 0)
  ctx.fillStyle = color
  bubblePath(ctx, w, h, r, tailSize)
  ctx.fill()
  canvas._tailOffset = extraLeft
  return canvas
}

function drawGradientRoundRect (colorOne, colorTwo, w, h, r, tailSize = 0) {
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
  canvas._tailOffset = extraLeft
  return canvas
}

function roundImage (image, r) {
  const w = image.width
  const h = image.height
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  if (w < 2 * r) r = w / 2
  if (h < 2 * r) r = h / 2
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(w, 0, w, h, r)
  ctx.arcTo(w, h, 0, h, r)
  ctx.arcTo(0, h, 0, 0, r)
  ctx.arcTo(0, 0, w, 0, r)
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

function drawQuoteIcon (size, color) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Draw as a single combined path so nothing overlaps
  ctx.fillStyle = color
  ctx.globalAlpha = 0.15

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

function drawForwardLabel (text, fontSize, color) {
  const canvas = createCanvas(1, 1)
  const ctx = canvas.getContext('2d')
  ctx.font = `bold ${fontSize}px "Noto Sans", "SF Pro", sans-serif`
  const metrics = ctx.measureText(text)
  const w = Math.ceil(metrics.width) + 4
  const h = Math.ceil(fontSize * 1.4)

  const result = createCanvas(w, h)
  const rctx = result.getContext('2d')
  rctx.font = ctx.font
  rctx.fillStyle = color
  rctx.fillText(text, 0, fontSize)
  return result
}

module.exports = { drawRoundRect, drawGradientRoundRect, roundImage, drawReplyLine, drawQuoteIcon, drawForwardLabel }
