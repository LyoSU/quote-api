// Numeric assertions for the group-avatar and media-scale fixes.
// Run: node test-fixes.js  → exits non-zero on any failed assertion.

const assert = require('assert')
const { loadImage, createCanvas } = require('canvas')
const generateMethod = require('./methods/generate')
const QuoteGenerate = require('./utils/quote-generate')

// Count opaque pixels in the left avatar column (x < colW) of a PNG buffer.
function leftColumnInk (img, colW) {
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, colW, img.height).data
  let n = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] > 32) n++
  return n
}

async function main () {
  const scale = 2
  const msg = (chatId, text) => ({
    chatId,
    avatar: true,
    from: { id: chatId, name: `User ${chatId}`, photo: {} },
    text
  })

  // 1. Same-sender group renders ONE avatar (on the last bubble); the
  //    two-sender variant renders two. Avatar circles are solid disks of
  //    d = 50·scale, so the grouped left column must hold roughly half the
  //    opaque pixels of the ungrouped one (±25% for the tail overlap).
  const grouped = await generateMethod({ messages: [msg(7, 'перше'), msg(7, 'друге')], scale })
  const ungrouped = await generateMethod({ messages: [msg(7, 'перше'), msg(8, 'друге')], scale })
  assert.ok(!grouped.error && !ungrouped.error, 'generate failed')

  const colW = 50 * scale
  const inkGrouped = leftColumnInk(await loadImage(Buffer.from(grouped.image, 'base64')), colW)
  const inkUngrouped = leftColumnInk(await loadImage(Buffer.from(ungrouped.image, 'base64')), colW)
  const ratio = inkGrouped / inkUngrouped
  assert.ok(ratio > 0.35 && ratio < 0.65,
    `grouped/ungrouped avatar ink ratio ${ratio.toFixed(2)} — expected ≈ 0.5 (one avatar of two)`)

  // 2. Voice renders as an in-bubble attachment row capped at ⅔ of the
  //    target width. The bubble width is fully deterministic:
  //    (avatar 50 + gap 10)·s + (rowW + 2·padX 16·s) + shadowPad 12·s,
  //    where rowW comes from the same drawVoiceRow inputs.
  const { drawVoiceRow } = require('./utils/quote-generate/attachments')
  const { NAME_COLORS_DARK } = require('./utils/quote-generate/constants')
  const waveform = Array.from({ length: 60 }, (_, i) => (i * 7) % 32)
  const qg = new QuoteGenerate('0:x')
  const voice = await qg.generate('#1b1429', '#1b1429', {
    from: { id: 1, name: 'V' },
    voice: { waveform, duration: 42 },
    avatar: false
  }, 512, 512, scale, 'apple')
  // from.id=1 → NAME_COLORS_DARK[1]; dark background → textColor #fff
  const row = drawVoiceRow(waveform, 42, NAME_COLORS_DARK[1], '#fff', scale, 512 * scale * 2 / 3)
  assert.ok(row.width <= Math.ceil(512 * scale * 2 / 3), `voice row ${row.width} exceeds ⅔ cap`)
  const expectedW = (50 + 10) * scale + (row.width + 2 * 16 * scale) + 12 * scale
  assert.ok(Math.abs(voice.width - expectedW) <= 2,
    `voice bubble width ${voice.width} != expected ${expectedW}`)

  // 3. Image mode: the wallpaper must contrast with the bubble, not blend.
  //    Sample the wallpaper corner vs the bubble interior; perceived
  //    brightness (BT.601) must differ noticeably for dark AND light themes.
  const brightness = (p) => (p.r * 299 + p.g * 587 + p.b * 114) / 1000
  for (const [bgColor, label] of [['#252e44', 'dark'], ['#e8ecf3', 'light']]) {
    const img = await generateMethod({ messages: [msg(7, 'контраст фону')], scale, type: 'image', backgroundColor: bgColor })
    assert.ok(!img.error, 'image generate failed')
    const pic = await loadImage(Buffer.from(img.image, 'base64'))
    const c = createCanvas(pic.width, pic.height)
    const cx = c.getContext('2d')
    cx.drawImage(pic, 0, 0)
    const get = (x, y) => {
      const d = cx.getImageData(x, y, 1, 1).data
      return { r: d[0], g: d[1], b: d[2] }
    }
    // Wallpaper near the corner; bubble interior right of the avatar column
    // ((50+10+16)·s + margin, vertical center).
    const wallPx = get(8, 8)
    const wall = brightness(wallPx)
    const bubble = brightness(get(95 * scale / 2 + (50 + 10 + 20) * scale, Math.round(pic.height / 2)))
    assert.ok(Math.abs(bubble - wall) >= 18,
      `${label}: bubble (${bubble.toFixed(0)}) blends into wallpaper (${wall.toFixed(0)})`)
    // Light wallpapers must be pastel, not gray: require visible chroma.
    if (label === 'light') {
      const chroma = Math.max(wallPx.r, wallPx.g, wallPx.b) - Math.min(wallPx.r, wallPx.g, wallPx.b)
      assert.ok(chroma >= 15, `light wallpaper is gray (chroma ${chroma}) — expected a pastel tint`)
    }
    console.log(`  image/${label}: bubble ${bubble.toFixed(0)} vs wallpaper ${wall.toFixed(0)} (Δ${Math.abs(bubble - wall).toFixed(0)})`)
  }

  console.log('OK: fixes assertions passed')
  console.log(`  avatar ink ratio grouped/ungrouped = ${ratio.toFixed(3)} (≈0.5)`)
  console.log(`  voice bubble width = ${voice.width} (expected ${expectedW}, row ${row.width})`)
}

main().catch((err) => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
