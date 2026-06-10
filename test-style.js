// Numeric assertions for the glass bubble style — pixel samples and
// geometry math, no eyeballing.
// Run: node test-style.js  → exits non-zero on any failed assertion.

const assert = require('assert')
const { drawRoundRect } = require('./utils/quote-generate/canvas-utils')
const { SP } = require('./utils/quote-generate/composer')

function px (canvas, x, y) {
  const d = canvas.getContext('2d').getImageData(x, y, 1, 1).data
  return { r: d[0], g: d[1], b: d[2], a: d[3] }
}

// Fill #222b3c → r=34. Glass adds white on top edge and a hairline border.
const FILL = { r: 34, g: 43, b: 60 }
const W = 200
const H = 100
const c = drawRoundRect('#222b3c', W, H, 20, 0, 1.25)

// 1. Middle of the bubble is the pure fill (glass must not wash the body).
const mid = px(c, W / 2, H / 2)
assert.strictEqual(mid.r, FILL.r, `body tinted: r=${mid.r} != ${FILL.r}`)

// 2. Top edge is brighter than the body (top highlight, alpha ≈ .16+.07).
const top = px(c, W / 2, 1)
assert.ok(top.r > mid.r + 15, `top edge not highlighted: r=${top.r} vs body ${mid.r}`)

// 3. Side edge carries the hairline border. Math: inner stroke is
//    glassLw 1.25px wide from x=0, so pixel column 0 is fully covered:
//    expected r ≈ 34 + (255−34)·0.07 ≈ 49.
const side = px(c, 0, H / 2)
assert.ok(side.r > mid.r + 8, `side border missing: r=${side.r} vs body ${mid.r}`)

// 4. Highlight fades: at 70% height the edge pixel is border-only (≈ side).
const lower = px(c, 0, Math.round(H * 0.7))
assert.ok(Math.abs(lower.r - side.r) <= 6,
  `highlight must fade out by 40% height: lower-edge r=${lower.r}, side r=${side.r}`)

// 5. Without glassLw the canvas is untouched fill (back-compat for chips).
const plain = drawRoundRect('#222b3c', W, H, 20, 0)
assert.strictEqual(px(plain, W / 2, 1).r, FILL.r, 'plain rect must have no glass')

// 6. Shadow headroom math: blur spills (blur − offsetY) above the bubble;
//    the top margin must cover it. (composer: blur 6, offsetY 2 — logical px)
assert.ok(SP.shadowPadTop >= 6 - 2,
  `shadowPadTop ${SP.shadowPadTop} < blur−offset 4 — shadow clips at the top`)
assert.ok(SP.shadowPad >= 6 + 2,
  `shadowPad ${SP.shadowPad} < blur+offset 8 — shadow clips at the bottom`)

console.log('OK: glass style assertions passed')
console.log(`  body r=${mid.r}, top r=${top.r}, side r=${side.r}, lower r=${lower.r}`)
