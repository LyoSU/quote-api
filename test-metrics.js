// Numeric assertions for the metric text layout: line geometry must be a
// constant of the font (em box), never of the glyph shapes drawn.
// Run: node test-metrics.js  → exits non-zero on any failed assertion.

const assert = require('assert')
const { createCanvas } = require('canvas')
const { drawMultilineText } = require('./utils/quote-generate/text-renderer')
const { drawLabel } = require('./utils/quote-generate/canvas-utils')
const { leaf } = require('./utils/quote-generate/layout-box')
const { fontMetrics } = require('./utils/quote-generate/text-prepare')

const FS = 24

async function main () {
  const { ascent, descent } = fontMetrics(FS)
  const lineHeight = FS * 1.2
  const W = 2000
  const H = 2000

  // 1. Glyph shapes must not change the canvas height (the old ink-trim bug):
  //    no ascenders/descenders vs full ascenders/descenders/diacritics.
  const low = await drawMultilineText('осе ссс еео', [], FS, '#fff', 0, FS, W, H, 'apple', null)
  const tall = await drawMultilineText('Іфj Ďjq Ції', [], FS, '#fff', 0, FS, W, H, 'apple', null)
  assert.strictEqual(low.height, tall.height,
    `single line: ${low.height} (low ink) != ${tall.height} (tall ink)`)

  // 2. Single line height is exactly the font em box.
  assert.strictEqual(low.height, Math.max(1, Math.ceil(ascent + descent)),
    `single line height ${low.height} != ceil(ascent+descent) ${Math.ceil(ascent + descent)}`)

  // 3. n-line text: height = (n-1)*lineHeight + ascent + descent, regardless of glyphs.
  for (const n of [2, 3, 5]) {
    const lowText = Array(n).fill('ооо').join('\n')
    const tallText = Array(n).fill('Іфj').join('\n')
    const a = await drawMultilineText(lowText, [], FS, '#fff', 0, FS, W, H, 'apple', null)
    const b = await drawMultilineText(tallText, [], FS, '#fff', 0, FS, W, H, 'apple', null)
    const expected = Math.ceil((n - 1) * lineHeight + ascent + descent)
    assert.strictEqual(a.height, expected, `${n} lines (low): ${a.height} != ${expected}`)
    assert.strictEqual(b.height, expected, `${n} lines (tall): ${b.height} != ${expected}`)
  }

  // 4. leaf() takes canvases at face value (no ink scanning) and drops 1×1 stubs.
  const l = leaf(low)
  assert.strictEqual(l.h, low.height, 'leaf height must equal canvas height')
  assert.strictEqual(l.srcY, 0, 'leaf must not crop the top')
  const stub = await drawMultilineText('', [], FS, '#fff', 0, FS, W, H, 'apple', null)
  assert.strictEqual(leaf(stub), null, 'empty-text stub must resolve to null leaf')

  // 5. drawLabel: same metric rule at label sizes, glyph-independent.
  const em13 = fontMetrics(13)
  const lab1 = drawLabel('ооо', 13, '#fff')
  const lab2 = drawLabel('Іфj', 13, '#fff')
  assert.strictEqual(lab1.height, lab2.height, 'label heights must match')
  assert.strictEqual(lab1.height, Math.max(1, Math.ceil(em13.ascent + em13.descent)),
    `label height ${lab1.height} != em box ${Math.ceil(em13.ascent + em13.descent)}`)

  // 6. The line box covers everything that gets drawn into it (no clipping):
  //    emoji images span [baseline−0.85·fs, baseline+0.30·fs]; probe glyph ink
  //    must fit too. Checked directly against the measured extents.
  const probeCtx = createCanvas(1, 1).getContext('2d')
  probeCtx.font = `${FS}px NotoSans`
  const inkAsc = probeCtx.measureText('ẤÅЇĎ').actualBoundingBoxAscent
  const inkDesc = probeCtx.measureText('jqyḑộ').actualBoundingBoxDescent
  assert.ok(ascent >= FS * 0.85, `ascent ${ascent} < emoji top ${FS * 0.85}`)
  assert.ok(descent >= FS * 0.3, `descent ${descent} < emoji bottom ${FS * 0.3}`)
  assert.ok(ascent >= inkAsc, `ascent ${ascent} < probe ink ascent ${inkAsc}`)
  assert.ok(descent >= inkDesc, `descent ${descent} < probe ink descent ${inkDesc}`)

  // 7. End-to-end: two messages with identical structure but different ink
  //    extents must produce pixel-identical bubble dimensions.
  const QuoteGenerate = require('./utils/quote-generate')
  const qg = new QuoteGenerate('0:x')
  const mk = (text) => qg.generate('#1b1429', '#1b1429', {
    from: { id: 42, name: 'Тест Тестенко' },
    text,
    avatar: false
  }, 512, 512, 2, 'apple')
  const qLow = await mk('осе ссс еео')
  const qTall = await mk('Іфj Ďjq Ції')
  assert.strictEqual(qLow.height, qTall.height,
    `bubble heights differ: ${qLow.height} vs ${qTall.height}`)

  console.log('OK: metric layout assertions passed')
  console.log(`  e2e bubble: ${qLow.width}x${qLow.height} == ${qTall.width}x${qTall.height}`)
  console.log(`  font em box @${FS}px: ascent=${ascent} descent=${descent} lineHeight=${lineHeight}`)
  console.log(`  1 line=${low.height}px, n lines=(n-1)*${lineHeight}+${ascent}+${descent}`)
}

main().catch((err) => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
