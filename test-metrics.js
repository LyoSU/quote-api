// Numeric assertions for the metric text layout: line geometry must be a
// constant of the font (em box), never of the glyph shapes drawn.
// Run: node test-metrics.js  → exits non-zero on any failed assertion.

// Fixtures are served from localhost, which the SSRF guard refuses by default.
process.env.ALLOW_PRIVATE_IMAGE_URLS = '1'

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

  // 4. leaf() lays out the optical box (canvas minus the hidden cap-line /
  //    below-baseline slack, no ink scanning) and drops 1×1 stubs.
  const l = leaf(low)
  assert.ok(low.optical && low.optical.t > 0 && low.optical.b > 0, 'text canvas must carry optical insets')
  assert.strictEqual(l.h, low.height - low.optical.t - low.optical.b, 'leaf height must be the optical height')
  assert.strictEqual(l.trimT, low.optical.t, 'leaf must remember the hidden top slack')
  assert.strictEqual(low.optical.b, descent, 'bottom slack must be exactly the descent (baseline = optical bottom)')
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

  await opticalSpacing(qg)

  console.log('OK: metric layout assertions passed')
  console.log(`  e2e bubble: ${qLow.width}x${qLow.height} == ${qTall.width}x${qTall.height}`)
  console.log(`  font em box @${FS}px: ascent=${ascent} descent=${descent} lineHeight=${lineHeight}`)
  console.log(`  1 line=${low.height}px, n lines=(n-1)*${lineHeight}+${ascent}+${descent}`)
}

// ---- Optical spacing -------------------------------------------------------
// The bubble padding must read the same on every side, whatever sits at the
// edge (text, reply chip, voice row, document…): top = cap line, bottom = last
// baseline (descenders hang), blocks/media = their visible bounds. Layout gaps
// come from the composer's `canvas.layout`; the ink is checked in pixels.

async function opticalSpacing (qg) {
  const http = require('http')
  const { getStyle } = require('./utils/quote-generate/styles')
  const img = createCanvas(640, 400)
  const ig = img.getContext('2d')
  const grad = ig.createLinearGradient(0, 0, 640, 400)
  grad.addColorStop(0, '#d4145a')
  grad.addColorStop(1, '#2a9d8f')
  ig.fillStyle = grad
  ig.fillRect(0, 0, 640, 400)
  const png = img.toBuffer('image/png')
  const server = http.createServer((q, r) => { r.setHeader('content-type', 'image/png'); r.end(png) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/p.png`

  const base = { from: { id: 3, name: 'Юрій Тест' }, avatar: false, text: 'Привіт! Як справи? Все добре, дякую.' }
  const wave = Array.from({ length: 40 }, (_, i) => (i * 7) % 31)
  const cases = {
    basic: { ...base },
    'long text': { ...base, text: 'Це довге повідомлення, яке переноситься на кілька рядків, щоб перевірити відступи.\nДругий абзац Hello World.' },
    reply: { ...base, replyMessage: { name: 'Олена', text: 'А ти бачив новий реліз?', chatId: 5 } },
    forward: { ...base, forward: { label: 'Переслано від Олена Коваленко' } },
    tag: { ...base, senderTag: 'admin' },
    'via bot': { ...base, viaBot: 'gif' },
    blockquote: { ...base, text: 'Цитата з книги:\nСлова, що лишаються в серці надовго.\nА це мій коментар.', entities: [{ type: 'blockquote', offset: 16, length: 33 }] },
    'partial quote': { ...base, text: 'Лише виділена частина повідомлення', isQuote: true, replyMessage: { name: 'Олена', text: 'Оригінал', chatId: 5 } },
    'photo + caption': { ...base, text: 'Подивись на цей краєвид', media: { url } },
    'photo + reply': { ...base, text: 'Ось це фото, дивись', media: { url }, replyMessage: { name: 'Олена', text: 'Скинь фото', chatId: 5 } },
    video: { ...base, text: 'Відос для тебе, дивись', media: { url }, mediaType: 'video', mediaDuration: 83 },
    voice: { ...base, text: '', voice: { waveform: wave, duration: 42 } },
    'voice + caption': { ...base, text: 'Послухай, будь ласка', voice: { waveform: wave, duration: 5 } },
    document: { ...base, text: '', document: { file_name: 'Звіт_за_вересень.pdf', file_size: 2.4 * 1048576 } },
    audio: { ...base, text: '', audio: { title: 'Обійми', performer: 'Океан Ельзи', duration: 245 } },
    cjk: { ...base, text: '你好世界，这是一个中文测试。日本語のテストです。' },
    entities: { ...base, text: 'Жирний курсив code_inline посилання Hello', entities: [{ type: 'bold', offset: 0, length: 6 }, { type: 'italic', offset: 7, length: 6 }, { type: 'code', offset: 14, length: 11 }] },
    'no name': { ...base, from: { id: 1, name: false }, text: 'Без імені, просто текст повідомлення' }
  }

  const report = []
  try {
    for (const styleName of ['glass', 'classic']) {
      const st = getStyle(styleName)
      for (const [name, msg] of Object.entries(cases)) {
        const label = `${styleName} / ${name}`
        const canvas = await qg.generate('#1b1429', '#1b1429', { ...msg, style: styleName }, 512, 768, 2, 'apple')
        assert.ok(canvas && canvas.layout, `${label}: no layout metadata`)
        const { scale, bubble, content, flush, mediaOnly, bleed } = canvas.layout
        const lp = (v) => v / scale // logical px
        const gap = {
          top: lp(content.top - bubble.y),
          bottom: lp(bubble.y + bubble.h - content.bottom),
          left: lp(content.left - bubble.x),
          right: lp(bubble.x + bubble.w - content.right)
        }
        const wantY = (flushSide) => (flushSide || mediaOnly ? 0 : st.space.inset.y)
        assert.ok(Math.abs(gap.top - wantY(flush.top)) <= 1, `${label}: top gap ${gap.top.toFixed(1)} != ${wantY(flush.top)}`)
        assert.ok(Math.abs(gap.bottom - wantY(flush.bottom)) <= 1, `${label}: bottom gap ${gap.bottom.toFixed(1)} != ${wantY(flush.bottom)}`)
        if (!flush.top && !flush.bottom) {
          assert.ok(Math.abs(gap.top - gap.bottom) <= 1.5, `${label}: |top ${gap.top.toFixed(1)} - bottom ${gap.bottom.toFixed(1)}| > 1.5`)
        }
        if (!mediaOnly) {
          assert.ok(Math.abs(gap.left - st.space.inset.x) <= 1, `${label}: left gap ${gap.left.toFixed(1)} != ${st.space.inset.x}`)
          if (!bleed && bubble.w > st.minWidth * scale + 1) { // media sets the width otherwise
            assert.ok(Math.abs(gap.left - gap.right) <= 1.5, `${label}: |left ${gap.left.toFixed(1)} - right ${gap.right.toFixed(1)}| > 1.5`)
          }
        }

        // Ink check: first/last strongly-colored rows inside the bubble body.
        const fill = [0x1b, 0x14, 0x29]
        const x0 = Math.round(bubble.x + 4 * scale)
        const x1 = Math.round(bubble.x + bubble.w - 4 * scale)
        const y0 = Math.round(bubble.y + 4 * scale)
        const y1 = Math.round(bubble.y + bubble.h - 4 * scale)
        const data = canvas.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data
        const rowInk = (y) => {
          for (let x = 0; x < x1 - x0; x++) {
            const i = (y * (x1 - x0) + x) * 4
            if (data[i + 3] > 200 && Math.abs(data[i] - fill[0]) + Math.abs(data[i + 1] - fill[1]) + Math.abs(data[i + 2] - fill[2]) > 260) return true
          }
          return false
        }
        let inkTop = -1
        let inkBottom = -1
        for (let y = 0; y < y1 - y0; y++) if (rowInk(y)) { inkTop = y + y0; break }
        for (let y = y1 - y0 - 1; y >= 0; y--) if (rowInk(y)) { inkBottom = y + y0; break }
        if (!flush.top && !mediaOnly) {
          // cap line ± ascender/emoji overshoot (or lowercase-only first line)
          const d = lp(inkTop - content.top)
          assert.ok(d >= -1.5 && d <= 2, `${label}: first ink row is ${d.toFixed(1)}px off the optical top`)
        }
        if (!flush.bottom && !mediaOnly) {
          // baseline ≤ ink ≤ baseline + descender depth
          const d = lp(inkBottom - content.bottom)
          assert.ok(d >= -2.5 && d <= 6, `${label}: last ink row is ${d.toFixed(1)}px off the optical bottom`)
        }
        report.push(`  ${label.padEnd(26)} top ${gap.top.toFixed(1).padStart(5)}  bottom ${gap.bottom.toFixed(1).padStart(5)}  left ${gap.left.toFixed(1).padStart(5)}  right ${gap.right.toFixed(1).padStart(5)}  ink top ${lp(inkTop - content.top).toFixed(1).padStart(5)}  ink bottom ${lp(inkBottom - content.bottom).toFixed(1).padStart(5)}`)
      }
    }
  } finally {
    server.close()
  }
  console.log('OK: optical spacing (bubble padding top == bottom, left == right) — logical px')
  if (process.env.VERBOSE) console.log(report.join('\n'))
}

main().catch((err) => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
