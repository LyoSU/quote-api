const { createCanvas } = require('canvas')

function drawRoundRect (color, w, h, r) {
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  if (w < 2 * r) r = w / 2
  if (h < 2 * r) r = h / 2
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(w, 0, w, h, r)
  ctx.arcTo(w, h, 0, h, r)
  ctx.arcTo(0, h, 0, 0, r)
  ctx.arcTo(0, 0, w, 0, r)
  ctx.closePath()
  ctx.fill()
  return canvas
}

function drawGradientRoundRect (colorOne, colorTwo, w, h, r) {
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, colorOne)
  gradient.addColorStop(1, colorTwo)
  ctx.fillStyle = gradient
  if (w < 2 * r) r = w / 2
  if (h < 2 * r) r = h / 2
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(w, 0, w, h, r)
  ctx.arcTo(w, h, 0, h, r)
  ctx.arcTo(0, h, 0, 0, r)
  ctx.arcTo(0, 0, w, 0, r)
  ctx.closePath()
  ctx.fill()
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
  const canvas = createCanvas(20, height)
  const ctx = canvas.getContext('2d')
  ctx.beginPath()
  ctx.moveTo(10, 0)
  ctx.lineTo(10, height)
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.closePath()
  return canvas
}

module.exports = { drawRoundRect, drawGradientRoundRect, roundImage, drawReplyLine }
