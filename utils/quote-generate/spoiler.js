// utils/quote-generate/spoiler.js
//
// Telegram "tap to reveal" media: the picture is replaced by a heavily blurred,
// dimmed version with a fine dotted particle overlay. Nothing recognizable
// survives: the source is first reduced to a few dozen pixels.

const { createCanvas, loadImage } = require('canvas')
const sharp = require('sharp')

const MAX_SIDE = 800 // output cap (px) — the composer rescales anyway
const BLUR_SIDE = 9 // the picture is reduced to this many px before blurring

// Seeded LCG so the same media always gets the same particles.
function lcg (seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * @param {Image|Canvas} img  decoded source
 * @param {number} scale      render scale (dot size follows it)
 * @returns {Promise<Canvas>} same aspect ratio, ≤ MAX_SIDE px
 */
async function applySpoiler (img, scale = 2) {
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
  const w = Math.max(2, Math.round(img.width * k))
  const h = Math.max(2, Math.round(img.height * k))

  // 1. Reduce to a tiny raster (flatten alpha onto mid-gray so transparent
  //    areas don't leave a recognizable cut-out), blur it, scale back up.
  const src = createCanvas(w, h)
  const sctx = src.getContext('2d')
  sctx.fillStyle = '#808080'
  sctx.fillRect(0, 0, w, h)
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(img, 0, 0, w, h)

  const tinyW = Math.max(2, Math.round(w >= h ? BLUR_SIDE : (BLUR_SIDE * w) / h))
  const tinyH = Math.max(2, Math.round(h > w ? BLUR_SIDE : (BLUR_SIDE * h) / w))
  // (sharp keeps only the last resize() of a pipeline, so it is two passes)
  const tiny = await sharp(src.toBuffer())
    .resize(tinyW, tinyH, { fit: 'fill', kernel: 'cubic' })
    .png()
    .toBuffer()
  const blurred = await sharp(tiny)
    .resize(w, h, { fit: 'fill', kernel: 'cubic' })
    .blur(8)
    .png()
    .toBuffer()
  const base = await loadImage(blurred)

  const out = createCanvas(w, h)
  const ctx = out.getContext('2d')
  ctx.drawImage(base, 0, 0)

  // 2. Gentle dim so the veil reads as a veil on light and dark pictures alike.
  ctx.fillStyle = 'rgba(30, 34, 44, 0.28)'
  ctx.fillRect(0, 0, w, h)

  // 3. Dotted particles (Telegram's shimmering dust), seeded → reproducible.
  const rnd = lcg(w * 73856093 ^ h * 19349663)
  const dot = Math.max(1, (scale * w) / 640 * 1.1)
  const count = Math.round((w * h) / (dot * dot * 22))
  for (let i = 0; i < count; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const r = dot * (0.45 + rnd() * 0.75)
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.35 + rnd() * 0.5).toFixed(2)})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return out
}

module.exports = { applySpoiler }
