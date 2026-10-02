/*
 * Visual regression test for the quote renderer (methods/generate).
 *
 *   node test-visual.js                 compare every case against test/visual/baseline/*.png
 *   node test-visual.js --update [re]   (re)write baselines, optionally only cases matching regex `re`
 *   node test-visual.js [re]            run only cases matching regex `re`
 *
 * NOTE: baselines are environment-specific. Fonts and libvips/cairo versions differ
 * between macOS and the Docker image, so regenerate baselines (--update) in the same
 * environment you run the test in.
 *
 * A pixel counts as changed when any RGBA channel differs by more than PIXEL_TOLERANCE;
 * a case fails when more than CASE_THRESHOLD of its pixels changed, or sizes differ.
 * Failures are written to test-output/visual/<case>/{actual,compare}.png plus overview.png.
 */

// Fixtures are served from localhost, which the SSRF guard refuses by default.
process.env.ALLOW_PRIVATE_IMAGE_URLS = '1'

process.chdir(__dirname)
const http = require('http')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { Telegram } = require('telegraf')
const { cases, assets: assetDefs } = require('./test/visual/cases')

const PIXEL_TOLERANCE = 24 // per-channel delta above which a pixel is "changed"
const CASE_THRESHOLD = 0.005 // fraction of changed pixels above which a case fails
const CONCURRENCY = 4
const BASELINE_DIR = path.join(__dirname, 'test', 'visual', 'baseline')
const OUT_DIR = path.join(__dirname, 'test-output', 'visual')

const args = process.argv.slice(2)
const update = args.includes('--update')
const filterArg = args.find(a => !a.startsWith('--'))
const filter = filterArg ? new RegExp(filterArg) : null

// Seeded PRNG so film grain in image/stories backdrops is reproducible
// (tolerance still covers any drift from concurrent consumption order).
let seed = 123456789
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

async function loadGenerate (origin) {
  Telegram.prototype.getFileLink = async (id) => `${origin}/${typeof id === 'object' ? id.file_id : id}`
  Telegram.prototype.getCustomEmojiStickers = async () => []
  Telegram.prototype.getUserProfilePhotos = async () => ({ photos: [] })
  Telegram.prototype.getChat = async () => ({})
  return require('./methods/generate')
}

async function buildAssets () {
  const out = {}
  for (const [name, [w, h, body]] of Object.entries(assetDefs)) {
    out[name] = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)).png().toBuffer()
  }
  return out
}

async function render (generate, origin, c) {
  const messages = JSON.parse(JSON.stringify(c.messages).split('@@B@@').join(origin))
  const res = await generate({ type: 'quote', format: 'png', ext: 'png', scale: 2, width: 512, height: 768, ...c.opts, messages })
  if (res.error) throw new Error(String(res.error))
  // without ext the API returns base64; normalize to raw RGBA for comparison
  const buf = typeof res.image === 'string' ? Buffer.from(res.image, 'base64') : res.image
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

const toPng = (img) => sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer()

function diff (a, b) {
  const out = Buffer.from(b.data)
  let changed = 0
  for (let i = 0; i < a.data.length; i += 4) {
    let bad = false
    for (let k = 0; k < 4; k++) if (Math.abs(a.data[i + k] - b.data[i + k]) > PIXEL_TOLERANCE) { bad = true; break }
    if (bad) { changed++; out[i] = 255; out[i + 1] = 0; out[i + 2] = 255; out[i + 3] = 255 }
  }
  return { changed, ratio: changed / (a.width * a.height), mask: { data: out, width: a.width, height: a.height } }
}

const bg = { r: 40, g: 40, b: 40, alpha: 1 }
async function sideBySide (parts) {
  const h = Math.max(...parts.map(p => p.height))
  const gap = 8
  const w = parts.reduce((s, p) => s + p.width, 0) + gap * (parts.length - 1)
  let x = 0
  const composites = []
  for (const p of parts) {
    composites.push({ input: await toPng(p), left: x, top: 0 })
    x += p.width + gap
  }
  return sharp({ create: { width: w, height: h, channels: 4, background: bg } }).composite(composites).png().toBuffer()
}

async function contactSheet (items) {
  const cellW = 480
  const cols = Math.min(items.length, 3)
  const cells = []
  for (const it of items) {
    const buf = await sharp(it.png).resize({ width: cellW }).toBuffer()
    const meta = await sharp(buf).metadata()
    cells.push({ buf, h: meta.height })
  }
  const rows = Math.ceil(cells.length / cols)
  const rowH = []
  for (let r = 0; r < rows; r++) rowH.push(Math.max(...cells.slice(r * cols, r * cols + cols).map(c => c.h)) + 8)
  const composites = cells.map((c, i) => ({
    input: c.buf,
    left: (i % cols) * (cellW + 8),
    top: rowH.slice(0, Math.floor(i / cols)).reduce((s, v) => s + v, 0)
  }))
  return sharp({ create: { width: cols * (cellW + 8), height: rowH.reduce((s, v) => s + v, 0), channels: 4, background: bg } }).composite(composites).png().toBuffer()
}

async function pool (items, n, fn) {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx) }
  }))
}

;(async () => {
  const t0 = Date.now()
  const assets = await buildAssets()
  const srv = http.createServer((q, r) => {
    const a = assets[q.url.slice(1)]
    if (!a) { r.statusCode = 404; return r.end() }
    r.setHeader('content-type', 'image/png')
    r.end(a)
  })
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${srv.address().port}`
  const generate = await loadGenerate(origin)

  const selected = cases.filter(c => !filter || filter.test(c.name))
  if (!selected.length) { console.error('No cases match filter'); process.exit(2) }
  fs.mkdirSync(BASELINE_DIR, { recursive: true })
  if (!update) fs.rmSync(OUT_DIR, { recursive: true, force: true })

  const results = []
  await pool(selected, CONCURRENCY, async (c) => {
    const r = { name: c.name, status: 'ok', ratio: 0, note: '' }
    results.push(r)
    try {
      const actual = await render(generate, origin, c)
      const file = path.join(BASELINE_DIR, `${c.name}.png`)
      if (update) {
        fs.writeFileSync(file, await toPng(actual))
        r.status = 'updated'
        return
      }
      if (!fs.existsSync(file)) { r.status = 'FAIL'; r.note = 'no baseline'; r.actual = actual; return }
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const base = { data, width: info.width, height: info.height }
      r.actual = actual
      if (base.width !== actual.width || base.height !== actual.height) {
        r.status = 'FAIL'
        r.note = `size ${base.width}x${base.height} -> ${actual.width}x${actual.height}`
        r.base = base
        return
      }
      const d = diff(base, actual)
      r.ratio = d.ratio
      if (d.ratio > CASE_THRESHOLD) {
        r.status = 'FAIL'
        r.base = base
        r.mask = d.mask
      }
    } catch (e) {
      r.status = 'FAIL'
      r.note = 'error: ' + e.message
    }
  })
  srv.close()
  results.sort((a, b) => selected.findIndex(c => c.name === a.name) - selected.findIndex(c => c.name === b.name))

  const failed = results.filter(r => r.status === 'FAIL')
  if (update) {
    console.log(`Updated ${results.length} baselines in ${path.relative(__dirname, BASELINE_DIR)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
    process.exit(failed.length ? 1 : 0)
  }

  const sheet = []
  for (const r of failed) {
    if (!r.actual) continue
    const dir = path.join(OUT_DIR, r.name)
    fs.mkdirSync(dir, { recursive: true })
    const actualPng = await toPng(r.actual)
    fs.writeFileSync(path.join(dir, 'actual.png'), actualPng)
    if (r.base && r.mask) {
      const cmp = await sideBySide([r.base, r.actual, r.mask])
      fs.writeFileSync(path.join(dir, 'compare.png'), cmp)
      sheet.push({ png: cmp })
    } else if (r.base) {
      const cmp = await sideBySide([r.base, r.actual])
      fs.writeFileSync(path.join(dir, 'compare.png'), cmp)
      sheet.push({ png: cmp })
    } else sheet.push({ png: actualPng })
  }
  if (sheet.length) fs.writeFileSync(path.join(OUT_DIR, 'overview.png'), await contactSheet(sheet))

  const pad = Math.max(...results.map(r => r.name.length))
  console.log(`${'case'.padEnd(pad)}  status  changed`)
  for (const r of results) {
    console.log(`${r.name.padEnd(pad)}  ${r.status.padEnd(6)}  ${(r.ratio * 100).toFixed(3)}%${r.note ? '  ' + r.note : ''}`)
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  if (failed.length) console.log(`Diffs: ${path.relative(__dirname, OUT_DIR)}/ (overview.png, <case>/compare.png)`)
  process.exit(failed.length ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
