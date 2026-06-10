// utils/quote-generate/attachments.js
//
// Row-style attachments rendered inside the bubble (voice, document, audio)
// and overlay badges for media (video play button, duration/GIF chips).
// All sizes below are logical px — multiplied by `scale` at use.

const fs = require('fs')
const path = require('path')
const { createCanvas, loadImage } = require('canvas')
const sharp = require('sharp')
const { drawLabel } = require('./canvas-utils')

// Official Material Design icons (Apache-2.0), vendored as-is from
// @material-design-icons/svg into assets/icons/. Rasterized once at 256px
// white via sharp and drawn scaled; the geometric fallbacks below only kick
// in if SVG rasterization is unavailable.
const ICON_FILES = {
  play: 'play_arrow.svg',
  file: 'insert_drive_file.svg',
  note: 'music_note.svg'
}
const ICONS_DIR = path.resolve(__dirname, '../../assets/icons')

let icons = null
let iconsLoading = null

// Warm the white icon sprites (256px). Call (and await) once before any
// drawVoiceRow/drawDocumentRow/drawAudioRow/paintMediaBadges usage.
async function loadIcons () {
  if (icons) return icons
  if (!iconsLoading) {
    iconsLoading = (async () => {
      const out = {}
      for (const [key, file] of Object.entries(ICON_FILES)) {
        const svg = await fs.promises.readFile(path.join(ICONS_DIR, file), 'utf8')
        // The vendored icons carry no fill (default black) — paint them white.
        const white = svg.replace('<svg ', '<svg fill="#ffffff" ')
        out[key] = await loadImage(
          await sharp(Buffer.from(white), { density: 256 / 24 * 72 }).resize(256, 256).png().toBuffer()
        )
      }
      icons = out
      return icons
    })().catch((err) => {
      console.warn('Icon rasterization failed, using geometric fallbacks:', err.message)
      iconsLoading = null
      return null
    })
  }
  return iconsLoading
}

// Draws a warmed white icon centered in a box, or runs the fallback painter.
function paintIcon (ctx, name, x, y, size, fallback) {
  if (icons && icons[name]) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(icons[name], x, y, size, size)
  } else {
    fallback()
  }
}

const ROW = {
  disc: 40, // play/file/cover disc side
  gap: 11, // disc → texts/waveform
  title: 16, // first line (file name, track title)
  meta: 13, // second line (size, performer, duration)
  metaAlpha: 0.55,
  lineGap: 4, // between the two text lines
  bar: 3, // waveform bar width
  barGap: 2.5, // waveform bar pitch gap
  barMin: 4, // shortest bar
  barMax: 26, // tallest bar
  cover: 8 // audio cover corner radius
}

// m:ss (Telegram never shows hours on voice/audio chips)
function formatDuration (seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Binary units, one decimal from KB up: 999 B, 2.0 KB, 5.3 MB, 1.2 GB
function formatFileSize (bytes) {
  const b = Math.max(0, Number(bytes) || 0)
  if (b < 1024) return `${Math.round(b)} B`
  const units = ['KB', 'MB', 'GB']
  let v = b
  let u = -1
  do {
    v /= 1024
    u++
  } while (v >= 1024 && u < units.length - 1)
  return `${v.toFixed(1)} ${units[u]}`
}

// Solid disc with a white play icon — the voice row lead-in.
function drawPlayDisc (d, accent) {
  const canvas = createCanvas(d, d)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2)
  ctx.fill()
  const size = d * 0.62
  paintIcon(ctx, 'play', (d - size) / 2, (d - size) / 2, size, () => {
    // Triangle fallback: optical center sits slightly right of geometric.
    const r = d * 0.22
    const cx = d * 0.54
    const cy = d / 2
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.7, cy - r)
    ctx.lineTo(cx - r * 0.7, cy + r)
    ctx.lineTo(cx + r * 1.1, cy)
    ctx.closePath()
    ctx.fill()
  })
  return canvas
}

// Solid disc with a white file icon — the document lead-in.
function drawFileDisc (d, accent) {
  const canvas = createCanvas(d, d)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2)
  ctx.fill()
  const size = d * 0.55
  paintIcon(ctx, 'file', (d - size) / 2, (d - size) / 2, size, () => {
    // Page-with-folded-corner fallback
    const w = d * 0.34
    const h = d * 0.44
    const x = (d - w) / 2
    const y = (d - h) / 2
    const fold = w * 0.38
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w - fold, y)
    ctx.lineTo(x + w, y + fold)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.moveTo(x + w - fold, y)
    ctx.lineTo(x + w - fold, y + fold)
    ctx.lineTo(x + w, y + fold)
    ctx.closePath()
    ctx.fill()
  })
  return canvas
}

// Disc with a white music note icon — audio fallback cover.
function drawNoteDisc (d, accent) {
  const canvas = createCanvas(d, d)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2)
  ctx.fill()
  const size = d * 0.55
  paintIcon(ctx, 'note', (d - size) / 2, (d - size) / 2, size, () => {
    // Geometric eighth-note fallback (no font dependency)
    ctx.fillStyle = '#fff'
    const headR = d * 0.09
    const hx = d * 0.42
    const hy = d * 0.66
    const stemH = d * 0.34
    const stemW = Math.max(1, d * 0.045)
    ctx.beginPath()
    ctx.ellipse(hx, hy, headR * 1.25, headR, -0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(hx + headR * 1.1 - stemW, hy - stemH, stemW, stemH)
    ctx.beginPath()
    ctx.moveTo(hx + headR * 1.1, hy - stemH)
    ctx.quadraticCurveTo(d * 0.62, hy - stemH + d * 0.07, d * 0.58, hy - stemH + d * 0.2)
    ctx.quadraticCurveTo(d * 0.56, hy - stemH + d * 0.12, hx + headR * 1.1, hy - stemH + d * 0.1)
    ctx.closePath()
    ctx.fill()
  })
  return canvas
}

// Resamples a Telegram waveform (values 0..31) to `n` buckets by averaging.
function resampleWaveform (data, n) {
  if (data.length <= n) return data.map((v) => v / 31)
  const out = []
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * data.length / n)
    const to = Math.max(from + 1, Math.floor((i + 1) * data.length / n))
    let sum = 0
    for (let j = from; j < to; j++) sum += data[j]
    out.push(sum / (to - from) / 31)
  }
  return out
}

/**
 * Voice message row: [accent play disc] [rounded waveform bars] [duration].
 * `maxWidth` caps the full row (device px); bars resample to fit.
 */
function drawVoiceRow (waveform, duration, accent, textColor, scale, maxWidth) {
  const s = (v) => v * scale
  const d = s(ROW.disc)
  const durLabel = drawLabel(formatDuration(duration), s(ROW.meta), textColor, { alpha: ROW.metaAlpha })

  const pitch = s(ROW.bar) + s(ROW.barGap)
  const barsAvail = Math.max(pitch * 8, (maxWidth || s(220)) - d - s(ROW.gap) * 2 - durLabel.width)
  const barCount = Math.min(Math.max(8, waveform.length), Math.floor(barsAvail / pitch))
  const heights = resampleWaveform(waveform, barCount)
  const barsW = barCount * pitch - s(ROW.barGap)

  const w = Math.ceil(d + s(ROW.gap) + barsW + s(ROW.gap) + durLabel.width)
  const h = d
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')

  ctx.drawImage(drawPlayDisc(d, accent), 0, 0)

  ctx.fillStyle = accent
  const cy = h / 2
  for (let i = 0; i < barCount; i++) {
    const bh = Math.max(s(ROW.barMin), heights[i] * s(ROW.barMax))
    const x = d + s(ROW.gap) + i * pitch
    roundedVBar(ctx, x, cy - bh / 2, s(ROW.bar), bh)
  }

  ctx.drawImage(durLabel, d + s(ROW.gap) + barsW + s(ROW.gap), Math.round((h - durLabel.height) / 2))
  return canvas
}

/**
 * Document row: [accent file disc] [file name / size · EXT].
 */
function drawDocumentRow (doc, accent, textColor, scale, maxWidth) {
  const s = (v) => v * scale
  const d = s(ROW.disc)
  const name = String(doc.file_name || 'File')
  const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : ''
  const metaText = [doc.file_size != null ? formatFileSize(doc.file_size) : null, ext || null]
    .filter(Boolean).join(' · ')

  const title = drawLabel(name, s(ROW.title), textColor, { bold: true })
  const meta = metaText ? drawLabel(metaText, s(ROW.meta), textColor, { alpha: ROW.metaAlpha }) : null
  return assembleRow(drawFileDisc(d, accent), title, meta, scale, maxWidth)
}

/**
 * Audio row: [cover or accent note disc] [title / performer · duration].
 * `thumb` is an optional Image/Canvas (already loaded).
 */
function drawAudioRow (audio, accent, textColor, scale, maxWidth, thumb) {
  const s = (v) => v * scale
  const d = s(ROW.disc)

  let lead
  if (thumb) {
    lead = createCanvas(d, d)
    const ctx = lead.getContext('2d')
    const r = s(ROW.cover)
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.arcTo(d, 0, d, d, r)
    ctx.arcTo(d, d, 0, d, r)
    ctx.arcTo(0, d, 0, 0, r)
    ctx.arcTo(0, 0, d, 0, r)
    ctx.closePath()
    ctx.clip()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const side = Math.min(thumb.width, thumb.height)
    ctx.drawImage(thumb, (thumb.width - side) / 2, (thumb.height - side) / 2, side, side, 0, 0, d, d)
  } else {
    lead = drawNoteDisc(d, accent)
  }

  const metaText = [audio.performer || null, audio.duration != null ? formatDuration(audio.duration) : null]
    .filter(Boolean).join(' · ')
  const title = drawLabel(String(audio.title || 'Audio'), s(ROW.title), textColor, { bold: true })
  const meta = metaText ? drawLabel(metaText, s(ROW.meta), textColor, { alpha: ROW.metaAlpha }) : null
  return assembleRow(lead, title, meta, scale, maxWidth)
}

// [disc] + up to two text lines, vertically centered against the disc.
function assembleRow (disc, title, meta, scale, maxWidth) {
  const s = (v) => v * scale
  const gap = s(ROW.gap)
  const textW = Math.max(title.width, meta ? meta.width : 0)
  let w = Math.ceil(disc.width + gap + textW)
  if (maxWidth && w > maxWidth) w = Math.ceil(maxWidth)
  const textsH = title.height + (meta ? s(ROW.lineGap) + meta.height : 0)
  const h = Math.max(disc.height, textsH)

  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(disc, 0, Math.round((h - disc.height) / 2))

  const maxTextW = w - disc.width - gap
  let ty = Math.round((h - textsH) / 2)
  ctx.drawImage(clampWidth(title, maxTextW), disc.width + gap, ty)
  ty += title.height + s(ROW.lineGap)
  if (meta) ctx.drawImage(clampWidth(meta, maxTextW), disc.width + gap, ty)
  return canvas
}

// Hard-crops a label canvas with a trailing fade (same look as layout-box).
function clampWidth (canvas, maxW) {
  if (canvas.width <= maxW) return canvas
  const w = Math.max(1, Math.floor(maxW))
  const out = createCanvas(w, canvas.height)
  const ctx = out.getContext('2d')
  ctx.drawImage(canvas, 0, 0)
  const fadeW = Math.min(w, Math.round(canvas.height * 0.9))
  const grad = ctx.createLinearGradient(w - fadeW, 0, w, 0)
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  grad.addColorStop(1, 'rgba(0, 0, 0, 1)')
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = grad
  ctx.fillRect(w - fadeW, 0, fadeW, canvas.height)
  return out
}

function roundedVBar (ctx, x, y, w, h) {
  const r = w / 2
  ctx.beginPath()
  ctx.moveTo(x, y + r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.closePath()
  ctx.fill()
}

/**
 * Overlay badges for media, painted in DESTINATION space (after the media
 * is scaled into the bubble): centered play button and/or a bottom-left chip
 * ("GIF", "0:42"). `ctx` is the final canvas, (x, y, w, h) the media rect.
 */
function paintMediaBadges (ctx, x, y, w, h, badge, scale) {
  const s = (v) => v * scale
  if (!badge) return
  ctx.save()
  if (badge.play) {
    const d = Math.min(s(44), w * 0.45, h * 0.45)
    const cx = x + w / 2
    const cy = y + h / 2
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.beginPath()
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
    ctx.fill()
    const size = d * 0.62
    paintIcon(ctx, 'play', cx - size / 2, cy - size / 2, size, () => {
      const r = d * 0.24
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.62, cy - r)
      ctx.lineTo(cx - r * 0.62, cy + r)
      ctx.lineTo(cx + r * 1.05, cy)
      ctx.closePath()
      ctx.fill()
    })
  }
  if (badge.label) {
    const label = drawLabel(badge.label, s(13), '#fff')
    const padX = s(7)
    const padY = s(2)
    const bw = label.width + padX * 2
    const bh = label.height + padY * 2
    const bx = x + s(6)
    const by = y + h - bh - s(6)
    const r = bh / 2
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.beginPath()
    ctx.moveTo(bx + r, by)
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r)
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r)
    ctx.arcTo(bx, by + bh, bx, by, r)
    ctx.arcTo(bx, by, bx + bw, by, r)
    ctx.closePath()
    ctx.fill()
    ctx.drawImage(label, bx + padX, by + padY)
  }
  ctx.restore()
}

module.exports = {
  loadIcons,
  drawVoiceRow,
  drawDocumentRow,
  drawAudioRow,
  paintMediaBadges,
  formatDuration,
  formatFileSize,
  resampleWaveform,
  ROW
}
