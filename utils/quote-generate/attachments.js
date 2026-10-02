// utils/quote-generate/attachments.js
//
// Row-style attachments rendered inside the bubble (voice, document, audio)
// and overlay badges for media (video play button, duration/GIF chips).
// All sizes below are logical px — multiplied by `scale` at use.

const fs = require('fs')
const path = require('path')
const { createCanvas, loadImage } = require('canvas')
const sharp = require('sharp')
const { drawLabel, setOptical } = require('./canvas-utils')
const { glass } = require('./styles')

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

// Row tokens live in styles.js (glass.row, fonts.micro); same geometry for every style.
const ROW = { ...glass.row, meta: glass.fonts.micro, metaAlpha: glass.microAlpha }

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

  ctx.drawImage(durLabel, d + s(ROW.gap) + barsW + s(ROW.gap), centerY(h, durLabel))
  return setOptical(canvas, 0, 0) // the disc fills the row — no hidden slack
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

  const textMax = maxWidth ? maxWidth - d - s(ROW.gap) : 0
  const title = drawLabel(fitLabel(name, s(ROW.title), true, textMax, 'middle'), s(ROW.title), textColor, { bold: true })
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
  const textMax = maxWidth ? maxWidth - d - s(ROW.gap) : 0
  const audioTitle = fitLabel(String(audio.title || 'Audio'), s(ROW.title), true, textMax, 'end')
  const title = drawLabel(audioTitle, s(ROW.title), textColor, { bold: true })
  const meta = metaText ? drawLabel(metaText, s(ROW.meta), textColor, { alpha: ROW.metaAlpha }) : null
  return assembleRow(lead, title, meta, scale, maxWidth)
}

// Shortens a label to fit maxW. 'middle' keeps the extension visible
// ("Звіт_за_вере…версія.pdf"), 'end' just trims the tail.
function fitLabel (text, fontSize, bold, maxW, mode) {
  if (!maxW || maxW <= 0) return text
  const ctx = createCanvas(1, 1).getContext('2d')
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px NotoSans`
  const width = (t) => ctx.measureText(t).width
  if (width(text) <= maxW) return text

  const chars = Array.from(text)
  const ell = '\u2026'
  if (mode === 'end') {
    let n = chars.length
    while (n > 1 && width(chars.slice(0, n).join('').trimEnd() + ell) > maxW) n--
    return chars.slice(0, n).join('').trimEnd() + ell
  }

  // Tail = last ".ext" (if sane) plus a few chars of the stem, head takes the rest
  const dot = text.lastIndexOf('.')
  const extLen = dot > 0 && text.length - dot <= 8 ? Array.from(text.slice(dot)).length : 0
  const stem = chars.length - extLen
  let best = null
  // Prefer balanced head/tail; tail grows from the extension plus up to 4 stem chars
  for (let tail = Math.min(extLen + 4, chars.length - 2); tail >= extLen; tail--) {
    const tailStr = chars.slice(chars.length - tail).join('')
    let head = Math.min(chars.length - tail, stem) - 1
    while (head > 0 && width(chars.slice(0, head).join('') + ell + tailStr) > maxW) head--
    if (head >= 3) {
      best = chars.slice(0, head).join('') + ell + tailStr
      break
    }
  }
  return best || fitLabel(text, fontSize, bold, maxW, 'end')
}

// Top y that centers a label's visible band (cap line → baseline) on h/2.
function centerY (h, label) {
  const o = label.optical || { t: 0, b: 0 }
  return Math.round(h / 2 - (o.t + label.height - o.b) / 2)
}

// [disc] + up to two text lines. Everything is laid out by visible bounds:
// the text block (title cap line → meta baseline) is centered on the disc,
// and the canvas carries the hidden slack of the first/last label as its
// `optical` insets so the row's visible height is exactly max(disc, texts).
function assembleRow (disc, title, meta, scale, maxWidth) {
  const s = (v) => v * scale
  const gap = s(ROW.gap)
  const textW = Math.max(title.width, meta ? meta.width : 0)
  let w = Math.ceil(disc.width + gap + textW)
  if (maxWidth && w > maxWidth) w = Math.ceil(maxWidth)
  const vis = (c) => c.height - c.optical.t - c.optical.b
  const lineGap = s(ROW.lineGap)
  const textsH = vis(title) + (meta ? lineGap + vis(meta) : 0)
  const h = Math.ceil(Math.max(disc.height, textsH))
  const padT = title.optical.t
  const padB = (meta || title).optical.b
  const hAll = Math.ceil(padT + h + padB)

  const canvas = createCanvas(w, hAll)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(disc, 0, Math.round(padT + (h - disc.height) / 2))

  const maxTextW = w - disc.width - gap
  const ty = Math.round(padT + (h - textsH) / 2) // cap line of the title
  ctx.drawImage(clampWidth(title, maxTextW), disc.width + gap, ty - title.optical.t)
  if (meta) ctx.drawImage(clampWidth(meta, maxTextW), disc.width + gap, ty + vis(title) + lineGap - meta.optical.t)
  return setOptical(canvas, padT, hAll - padT - h)
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
function paintMediaBadges (ctx, x, y, w, h, badge, scale, style) {
  const s = (v) => v * scale
  if (!badge) return
  const P = style || glass
  ctx.save()
  if (badge.play) {
    const d = Math.min(s(P.badge.play), w * 0.45, h * 0.45)
    const cx = x + w / 2
    const cy = y + h / 2
    ctx.fillStyle = `rgba(0, 0, 0, ${P.badge.bg})`
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
    // Solid dark pill hugging the label's visible band (cap line → baseline).
    const label = drawLabel(badge.label, s(P.fonts.micro), '#fff')
    const o = label.optical
    const padX = s(P.badge.padX)
    const padY = s(P.badge.padY)
    const bw = label.width + padX * 2
    const bh = label.height - o.t - o.b + padY * 2
    const bx = x + s(P.badge.inset)
    const by = y + h - bh - s(P.badge.inset)
    const r = bh / 2
    ctx.fillStyle = `rgba(0, 0, 0, ${P.badge.bg})`
    ctx.beginPath()
    ctx.moveTo(bx + r, by)
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r)
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r)
    ctx.arcTo(bx, by + bh, bx, by, r)
    ctx.arcTo(bx, by, bx + bw, by, r)
    ctx.closePath()
    ctx.fill()
    ctx.drawImage(label, bx + padX, by + padY - o.t)
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
