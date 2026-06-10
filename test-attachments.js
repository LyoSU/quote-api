// Numeric assertions for attachment rows and media badges.
// Run: node test-attachments.js  → exits non-zero on any failed assertion.

const assert = require('assert')
const { createCanvas } = require('canvas')
const {
  loadIcons, drawVoiceRow, drawDocumentRow, drawAudioRow,
  formatDuration, formatFileSize, resampleWaveform, ROW
} = require('./utils/quote-generate/attachments')
const { drawQuote } = require('./utils/quote-generate/composer')
const { fontMetrics } = require('./utils/quote-generate/text-prepare')

const ACCENT = '#ffa357' // r=255 g=163 b=87

function px (canvas, x, y) {
  const d = canvas.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data
  return { r: d[0], g: d[1], b: d[2], a: d[3] }
}

function isAccent (p) {
  return Math.abs(p.r - 255) <= 8 && Math.abs(p.g - 163) <= 12 && Math.abs(p.b - 87) <= 12 && p.a > 200
}

async function main () {
  const loaded = await loadIcons()
  assert.ok(loaded && loaded.play && loaded.file && loaded.note, 'official icon sprites must rasterize')

  // 1. Formatters — pure math.
  assert.strictEqual(formatDuration(0), '0:00')
  assert.strictEqual(formatDuration(65), '1:05')
  assert.strictEqual(formatDuration(3661), '61:01')
  assert.strictEqual(formatFileSize(999), '999 B')
  assert.strictEqual(formatFileSize(2048), '2.0 KB')
  assert.strictEqual(formatFileSize(5.3 * 1024 * 1024), '5.3 MB')
  assert.strictEqual(formatFileSize(1.5 * 1024 * 1024 * 1024), '1.5 GB')

  // 2. Waveform resampling: averages buckets, normalizes to 0..1.
  assert.deepStrictEqual(resampleWaveform([31, 31, 0, 0], 2), [1, 0])
  assert.strictEqual(resampleWaveform(Array(100).fill(31), 40).length, 40)

  // 3. Voice row: height = disc, width within cap, disc center & bars accent.
  const scale = 2
  const maxW = 600
  const wave = Array.from({ length: 50 }, (_, i) => (i * 11) % 32)
  const voice = drawVoiceRow(wave, 42, ACCENT, '#fff', scale, maxW)
  const d = ROW.disc * scale
  assert.strictEqual(voice.height, d, `voice row height ${voice.height} != disc ${d}`)
  assert.ok(voice.width <= maxW, `voice row ${voice.width} > cap ${maxW}`)
  assert.ok(isAccent(px(voice, d / 2, d / 2 - d * 0.3)), 'play disc must be accent')
  // First bar column: bars start at d+gap; min height 4·s ensures ink at center.
  const barX = d + ROW.gap * scale + (ROW.bar * scale) / 2
  assert.ok(isAccent(px(voice, barX, d / 2)), 'first waveform bar must be accent')

  // 4. Document row height: max(disc, two metric text lines) — exact math.
  const titleH = Math.max(1, Math.ceil(fontMetrics(ROW.title * scale).ascent + fontMetrics(ROW.title * scale).descent))
  const metaH = Math.max(1, Math.ceil(fontMetrics(ROW.meta * scale).ascent + fontMetrics(ROW.meta * scale).descent))
  const expRowH = Math.max(d, titleH + ROW.lineGap * scale + metaH)
  const doc = drawDocumentRow({ file_name: 'звіт.pdf', file_size: 2.4 * 1024 * 1024 }, ACCENT, '#fff', scale, maxW)
  assert.strictEqual(doc.height, expRowH, `doc row ${doc.height} != max(disc, texts) ${expRowH}`)
  const docDisc = px(doc, d / 2, doc.height / 2)
  assert.ok(docDisc.r > 240 && docDisc.g > 240 && docDisc.b > 240, 'page glyph must be white at disc center')
  assert.ok(isAccent(px(doc, d / 2, (doc.height - d) / 2 + d * 0.08)), 'disc rim must be accent')

  // 5. Audio row without thumb: accent note disc; with thumb: thumb pixels.
  const audio = drawAudioRow({ title: 'Пісня', performer: 'Гурт', duration: 215 }, ACCENT, '#fff', scale, maxW)
  assert.strictEqual(audio.height, expRowH, `audio row ${audio.height} != ${expRowH}`)
  assert.ok(isAccent(px(audio, d * 0.15, audio.height / 2)), 'note disc must be accent')

  const thumb = createCanvas(100, 100)
  thumb.getContext('2d').fillStyle = '#00ff00'
  thumb.getContext('2d').fillRect(0, 0, 100, 100)
  const audioT = drawAudioRow({ title: 'X' }, ACCENT, '#fff', scale, maxW, thumb)
  const cover = px(audioT, d / 2, audioT.height / 2)
  assert.ok(cover.g > 200 && cover.r < 60, 'cover must show the thumb image')

  // 6. Media badges through the composer (destination-space overlay).
  //    Red 600×300 media, maxSize 200 → drawn 200×100. Bubble is media-only:
  //    x = (50+10)·s? scale 1 → 60, y = shadowPadTop 4.
  const red = createCanvas(600, 300)
  red.getContext('2d').fillStyle = '#ff0000'
  red.getContext('2d').fillRect(0, 0, 600, 300)
  const q = drawQuote({
    scale: 1,
    background: { colorOne: '#1b1429', colorTwo: '#1b1429', textColor: '#fff' },
    media: { canvas: red, type: 'video', maxSize: 200, badge: { play: true, label: '0:42' } }
  })
  const mx = 60
  const my = 4
  const cx = mx + 100
  const cy = my + 50
  // Center: white play triangle.
  const center = px(q, cx, cy)
  assert.ok(center.g > 180 && center.b > 180, `center must be white triangle, got ${JSON.stringify(center)}`)
  // Inside the dark disc, left of the triangle: red dimmed by ~50% black.
  const ring = px(q, cx - 14, cy)
  assert.ok(ring.r > 100 && ring.r < 170 && ring.g < 60, `ring must be dimmed red, got ${JSON.stringify(ring)}`)
  // Outside the disc: pure media.
  const raw = px(q, mx + 30, cy)
  assert.ok(raw.r > 240 && raw.g < 15, `media must stay untouched, got ${JSON.stringify(raw)}`)
  // Duration chip bottom-left: dark backdrop over red.
  const chip = px(q, mx + 6 + 4, my + 100 - 6 - 6)
  assert.ok(chip.r < 200 && chip.g < 80, `chip backdrop missing, got ${JSON.stringify(chip)}`)

  console.log('OK: attachment assertions passed')
  console.log(`  voice ${voice.width}x${voice.height}, doc ${doc.width}x${doc.height}, audio ${audio.width}x${audio.height}`)
  console.log(`  badge pixels: center=${JSON.stringify(center)} ring=${JSON.stringify(ring)}`)
}

main().catch((err) => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
