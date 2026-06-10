// Assertions for the two rendering bugs:
//  1. Emoji in the user name must keep their own colors (gradientTint used to
//     recolor them into flat silhouettes via source-in).
//  2. An animation that arrives as a raw video file (mp4, no thumbnail) must
//     still produce a media canvas — first frame extracted via ffmpeg.
// Run: node test-emoji-gif.js  → exits non-zero on any failed assertion.

const assert = require('assert')
const http = require('http')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { loadImage, createCanvas } = require('canvas')
const generateMethod = require('./methods/generate')
const { downloadMediaImage } = require('./utils/quote-generate/media')

function pixels (img) {
  const c = createCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, img.width, img.height).data
}

// Count pixels matching a predicate over {r,g,b,a}
function countPx (data, fn) {
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (fn({ r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] })) n++
  }
  return n
}

async function testNameEmojiKeepsColor () {
  // Name with the Ukrainian flag: a correct render contains BOTH saturated
  // blue and saturated yellow pixels. The tinted-silhouette bug leaves only
  // the (pink-ish) name-color pixels.
  const r = await generateMethod({
    messages: [{
      chatId: 125,
      avatar: false,
      from: { id: 125, name: 'Yūri 🇺🇦 💜', photo: {} },
      text: 'x'
    }],
    scale: 2,
    backgroundColor: '#1b1429'
  })
  assert.ok(!r.error, `generate failed: ${r.error}`)
  const data = pixels(await loadImage(Buffer.from(r.image, 'base64')))

  const blue = countPx(data, p => p.a > 200 && p.b > 120 && p.b - p.r > 60 && p.b - p.g > 40)
  const yellow = countPx(data, p => p.a > 200 && p.r > 180 && p.g > 140 && p.r - p.b > 100)
  assert.ok(blue > 30, `flag blue missing in name (got ${blue} px) — emoji recolored by gradientTint?`)
  assert.ok(yellow > 30, `flag yellow missing in name (got ${yellow} px) — emoji recolored by gradientTint?`)
  console.log(`  name emoji: blue=${blue}px yellow=${yellow}px — colors preserved`)
}

async function testVideoBufferDecodesToFrame () {
  let ffmpegOk = true
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }) } catch (e) { ffmpegOk = false }
  if (!ffmpegOk) {
    console.log('  video frame: ffmpeg not installed — skipping')
    return
  }

  // Solid-red 64x64 mp4, like a Telegram animation without thumbnail.
  const tmp = path.join(os.tmpdir(), `quote-test-${process.pid}.mp4`)
  execFileSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=0.2:r=5',
    '-pix_fmt', 'yuv420p', tmp
  ], { stdio: 'ignore' })
  const mp4 = fs.readFileSync(tmp)

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'video/mp4' })
    res.end(mp4)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/anim.mp4`

  try {
    const img = await downloadMediaImage(url, 512, 'url', false, null)
    assert.ok(img, 'downloadMediaImage returned null for an mp4 animation')
    const data = pixels(img)
    const red = countPx(data, p => p.a > 200 && p.r > 180 && p.g < 80 && p.b < 80)
    assert.ok(red > 1000, `decoded frame is not the red video frame (red=${red}px)`)
    console.log(`  video frame: decoded ${img.width}x${img.height}, red=${red}px`)
  } finally {
    server.close()
    fs.unlinkSync(tmp)
  }
}

async function main () {
  await testNameEmojiKeepsColor()
  await testVideoBufferDecodesToFrame()
  console.log('OK: emoji/gif assertions passed')
}

main().catch((err) => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
